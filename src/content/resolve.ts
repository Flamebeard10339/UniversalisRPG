import { Action } from '../grammar/action';
import { actionSlug } from './locale';
import { DISCOVERED } from './location';
import { DslError } from '../grammar/parser';
import { EntityBlock, isHandlerBlock } from './entity';
import { lastSegment } from '../grammar/values';
import { VISITS } from '../grammar/condition';
import { isFieldEdits, listMembers } from '../grammar/section';
import { ACTION_MEMBER, NAMESPACED_KINDS, Namespace, qualify } from './namespace';
import { isActionOwnerKind } from './sectionKind';
import { ParsedModule } from './universe';
import { ReferenceKind, visitSection } from './referenceSites';
import { Removal } from './removal';

// What a module may name: its own namespace, and those of the dependencies it
// declared. A module that could see its dependencies' dependencies would be
// referencing a module it never named, which is what declaring one is for.
function visibleTo(module: ParsedModule, loaded: ReadonlySet<string>): Set<string | null> {
  const visible = new Set<string | null>([module.namespace]);
  for (const dependency of module.info.dependencies) {
    if (dependency.prefix !== 'incompatible' && loaded.has(dependency.module)) visible.add(dependency.module);
  }
  return visible;
}

const isNamespaced = (kind: string): boolean => NAMESPACED_KINDS.includes(kind);

function missingOptionalDependencies(module: ParsedModule, loaded: ReadonlySet<string>): Set<string> {
  const missing = new Set<string>();
  for (const dependency of module.info.dependencies) {
    if ((dependency.prefix === 'optional' || dependency.prefix === 'recommended') && !loaded.has(dependency.module)) missing.add(dependency.module);
  }
  return missing;
}

function namesMissingOptional(kind: string, raw: string, missing: ReadonlySet<string>): boolean {
  const segments = raw.split('.');
  if (segments[0] === kind && segments.length > 1) segments.shift();
  return segments.length > 1 && missing.has(segments[0]);
}

function unorderedDependencies(module: ParsedModule): ReadonlySet<string> {
  return new Set(module.info.dependencies.filter((dependency) => dependency.prefix === 'unordered').map((dependency) => dependency.module));
}

// A bare heading names something inside this module; a dotted one edits something
// that already exists. You cannot create outside your own namespace, so adding a
// dependency can never quietly turn a module's creation into an edit of another
// module's object. Null is the second case, and is what a caller asking which
// file declared an id has to skip — the question is asked from two places, and
// two spellings of this rule would send an edit home to a file that never held
// it.
export function declaredKey(namespace: string | null, kind: string, id: string): string | null {
  if (!isNamespaced(kind)) return id;
  return id.includes('.') ? null : qualify(namespace, id);
}

function targetKey(module: ParsedModule, kind: string, id: string, namespace: Namespace, visible: ReadonlySet<string | null>): string {
  const own = declaredKey(module.namespace, kind, id);
  if (own !== null) return own;
  const resolved = namespace.resolve(kind, id, module.namespace, visible, `# ${kind} ${id}`);
  const owner = namespace.ownerOf(kind, resolved);
  if (owner !== null && owner !== undefined && unorderedDependencies(module).has(owner)) {
    throw new DslError(`# ${kind} ${id} edits ${owner}, but ~ dependencies do not load before this module. Use a load-order dependency for patches.`);
  }
  return resolved;
}

// `<node>.visits` is how a condition asks how often a dialogue node has been
// reached, so a flag by that name would be read as a node counter and resolve
// against a node that does not exist.
function declareFlag(namespace: Namespace, kind: string, id: string, name: string, where: string): string {
  if (name === VISITS) throw new DslError(`${where} declares a flag named ${VISITS}, which the engine reads as a dialogue node's visit counter`);
  return namespace.declareMember('flag', kind, id, name);
}

const addedMembers = <T>(value: unknown): T[] => (isFieldEdits(value) ? value.ops.filter((op) => op.op === '+').flatMap((op) => op.values as T[]) : listMembers<T>(value));

export interface MemberOwner {
  id: string;
  flags?: unknown;
  nodes?: { name: string }[];
  actions?: unknown;
  blocks?: unknown;
  uses?: unknown;
}

export interface Member {
  kind: string;
  key: string;
}

// Read off what was authored rather than off the built table, because a member
// is declared before `uses:` is resolved and reconciled against the merged
// section long before either is linked. A shortened id names the same action as
// the whole path, so the last segment is what survives resolution either way,
// and a block whose label names a used action is that entity's overload of it
// rather than an action of its own.
export function actionAddresses(kind: string, value: MemberOwner): string[] {
  if (!isActionOwnerKind(kind)) return [];
  const used = addedMembers<string>(value.uses).map(lastSegment);
  const inline = [...addedMembers<Action>(value.actions), ...addedMembers<EntityBlock>(value.blocks).filter((block) => !isHandlerBlock(block))] as Action[];
  return [...used, ...inline.filter((block) => !used.includes(lastSegment(block.label))).map((block) => actionSlug(block.label))];
}

// What hangs under an object rather than beside it: the flags it owns, the
// actions it performs, and the nodes of a dialogue, whose visits the engine
// counts against the node's path.
export function declareMembers(namespace: Namespace, kind: string, value: MemberOwner): Member[] {
  const declared: Member[] = [];
  if (kind === 'location') declared.push({ kind: 'flag', key: namespace.declareMember('flag', kind, value.id, DISCOVERED) });
  for (const flag of addedMembers<string>(value.flags)) declared.push({ kind: 'flag', key: declareFlag(namespace, kind, value.id, flag, `# ${kind} ${value.id}`) });
  for (const address of actionAddresses(kind, value)) declared.push({ kind: ACTION_MEMBER, key: namespace.declareMember(ACTION_MEMBER, kind, value.id, address) });
  if (kind === 'dialogue') for (const node of value.nodes ?? []) declared.push({ kind: 'node', key: namespace.declareMember('node', kind, value.id, node.name) });
  return declared;
}

type Created = { kind: string; value: MemberOwner };

const createdSections = (module: ParsedModule): Created[] => module.sections.filter((section) => section.kind !== 'remove') as Created[];

// A section naming an absent optional dependency is dropped rather than failing
// the module, which is what makes an optional dependency optional.
function declareIds(module: ParsedModule, namespace: Namespace, loaded: ReadonlySet<string>): void {
  const missingOptional = missingOptionalDependencies(module, loaded);
  module.sections = module.sections.filter((section) => {
    if (section.kind === 'remove') return !namesMissingOptional((section.value as Removal).kind, (section.value as Removal).target, missingOptional);
    const { id } = section.value as { id?: string };
    return id === undefined || !isNamespaced(section.kind) || !id.includes('.') || !namesMissingOptional(section.kind, id, missingOptional);
  });

  for (const { kind, value } of createdSections(module)) {
    if (!isNamespaced(kind) || value.id === undefined || value.id.includes('.')) continue;
    if (kind === 'flag' && value.id === VISITS) throw new DslError(`# flag ${VISITS} is reserved: the engine reads <node>.${VISITS} as a dialogue node's visit counter`);
    namespace.declare(kind, module.namespace, value.id);
  }
}

// Ids settle before members are declared, because a member hangs under the key
// its object ended up with — and an edit's heading names another module's.
function settleIds(module: ParsedModule, namespace: Namespace, loaded: ReadonlySet<string>): void {
  const visible = visibleTo(module, loaded);
  for (const section of createdSections(module)) {
    section.value.id = targetKey(module, section.kind, section.value.id, namespace, visible);
    declareMembers(namespace, section.kind, section.value);
  }
}

function resolveReferences(module: ParsedModule, namespace: Namespace, loaded: ReadonlySet<string>): void {
  const visible = visibleTo(module, loaded);
  const missingOptional = missingOptionalDependencies(module, loaded);
  const self = module.namespace;

  for (const section of module.sections) {
    if (section.kind === 'remove') {
      const removal = section.value as Removal;
      if (!isNamespaced(removal.kind)) throw new DslError(`# remove ${removal.id}: ${removal.kind} is not a kind a module owns`);
      removal.target = namespace.resolve(removal.kind, removal.target, self, visible, `# remove ${removal.id}`);
      const owner = namespace.ownerOf(removal.kind, removal.target);
      if (owner !== null && owner !== undefined && unorderedDependencies(module).has(owner)) {
        throw new DslError(`# remove ${removal.id} edits ${owner}, but ~ dependencies do not load before this module. Use a load-order dependency for patches.`);
      }
      // Deliberately does not undeclare: a removal is a merge-time fact, and
      // taking the id out of the namespace here made every later module's
      // reference to it fail while every earlier module's silently survived.
      // What survives is proved against the built registry instead.
      continue;
    }
    const { id } = section.value as { id: string };
    // The section is the innermost context its own references are read from, so
    // a bare flag name means this object's before it means anyone else's.
    const visit = (kind: ReferenceKind, raw: string, where: string): string =>
      isNamespaced(kind) && !namesMissingOptional(kind, raw, missingOptional) ? namespace.resolve(kind, raw, self, visible, where, id) : raw;
    visitSection(section.kind, section.value, `# ${section.kind} ${id}`, visit);
  }
}

// Each pass runs over every module before the next begins, so what a name
// resolves to follows from what is loaded rather than from where the naming
// module sits in the load order — which is what `~` promises and what a
// module-at-a-time resolution could not deliver.
export const RESOLUTION_PASSES: readonly ((module: ParsedModule, namespace: Namespace, loaded: ReadonlySet<string>) => void)[] = [declareIds, settleIds, resolveReferences];
