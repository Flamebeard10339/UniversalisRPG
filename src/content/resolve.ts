import { Action } from '../grammar/action';
import { actionAddress, actionTextSection } from './sections/action';
import { actionSlug } from './locale';
import { DslError } from '../grammar/parser';
import { EntityBlock, isHandlerBlock } from './sections/entity';
import { lastSegment } from '../grammar/values';
import { VISITS } from '../grammar/condition';
import { isFieldEdits, listMembers } from '../grammar/section';
import { ACTION_MEMBER, Namespace, qualify } from './namespace';
import { idScopeOf, isOwnedKind } from './sections';
import { contentSectionMaps, isActionOwnerKind, sectionFor } from './sections';
import { MemberName } from './sections/define';
import { ParsedModule } from './universe';
import { ReferenceKind } from './refs';
import { visitSection } from './sections';
import { Removal } from './sections/remove';

function visibleTo(module: ParsedModule, loaded: ReadonlySet<string>): Set<string | null> {
  const visible = new Set<string | null>([module.namespace]);
  for (const dependency of module.info.dependencies) {
    if (dependency.prefix !== 'incompatible' && loaded.has(dependency.module)) visible.add(dependency.module);
  }
  return visible;
}

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

export function declaredKey(namespace: string | null, kind: string, id: string): string | null {
  if (!isOwnedKind(kind)) return id;
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

function declareFlag(namespace: Namespace, kind: string, id: string, name: string, where: string): string {
  if (name === VISITS) throw new DslError(`${where} declares a flag named ${VISITS}, which the engine reads as a dialogue node's visit counter`);
  return namespace.declareMember('flag', kind, id, name);
}

const addedMembers = <T>(value: unknown): T[] => (isFieldEdits(value) ? value.ops.filter((op) => op.op === '+').flatMap((op) => op.values as T[]) : listMembers<T>(value));

export interface MemberOwner {
  id: string;
  flags?: unknown;
  actions?: unknown;
  blocks?: unknown;
  uses?: unknown;
}

export interface Member {
  kind: string;
  key: string;
}

export function actionAddresses(kind: string, value: MemberOwner): string[] {
  if (!isActionOwnerKind(kind)) return [];
  const used = addedMembers<string>(value.uses).map(lastSegment);
  const inline = [...addedMembers<Action>(value.actions), ...addedMembers<EntityBlock>(value.blocks).filter((block) => !isHandlerBlock(block))] as Action[];
  const minted = sectionFor(kind)?.mintedActions?.(value) ?? [];
  return [...used, ...minted.map((one) => actionAddress(one.action)), ...inline.filter((block) => !used.includes(lastSegment(block.label))).map((block) => actionSlug(block.label))];
}

type Members = (value: { id: string }) => readonly MemberName[];

let bearing: ReadonlyMap<string, Members> | undefined;

// Which registry map holds values carrying names of their own, and the kind those names are read off. A # quest declares the nodes it hands out because it fills `dialogues`, not because anything here names quest beside dialogue.
const memberBearingMaps = (): ReadonlyMap<string, Members> =>
  (bearing ??= new Map(
    contentSectionMaps().flatMap(([kind, map]) => {
      const members = sectionFor(kind)?.members as Members | undefined;
      return members === undefined ? [] : [[map, members] as const];
    }),
  ));

// A member is declared beneath the section that landed it, which is what lets removing that section take its members with it. A value a section lands under another kind's map carries its own id, and that id sits under the section's.
const beneath = (owner: string, id: string, name: string): string => (id === owner ? name : `${id.slice(owner.length + 1)}.${name}`);

function landedMembers(namespace: Namespace, kind: string, value: MemberOwner): Member[] {
  const declared: Member[] = [];
  for (const [map, lands] of Object.entries(sectionFor(kind)?.maps ?? {})) {
    const members = memberBearingMaps().get(map);
    if (members === undefined) continue;
    for (const [id, landed] of lands(value)) {
      for (const member of members(landed as { id: string })) {
        declared.push({ kind: member.kind, key: namespace.declareMember(member.kind, kind, value.id, beneath(value.id, id, member.name)) });
      }
    }
  }
  return declared;
}

export function declareMembers(namespace: Namespace, kind: string, value: MemberOwner): Member[] {
  const declared: Member[] = [];
  for (const minted of sectionFor(kind)?.flags ?? [])
    declared.push({
      kind: 'flag',
      key: namespace.declareMember('flag', kind, value.id, minted),
    });
  for (const flag of addedMembers<string>(value.flags))
    declared.push({
      kind: 'flag',
      key: declareFlag(namespace, kind, value.id, flag, `# ${kind} ${value.id}`),
    });
  for (const address of actionAddresses(kind, value))
    declared.push({
      kind: ACTION_MEMBER,
      key: namespace.declareMember(ACTION_MEMBER, kind, value.id, address),
    });
  declared.push(...landedMembers(namespace, kind, value));
  return declared;
}

type Created = { kind: string; value: MemberOwner };

const createdSections = (module: ParsedModule): Created[] => module.sections.filter((section) => section.kind !== 'remove') as Created[];

// A qualified id names the module the section belongs to, so a section nothing has declared yet is
// declared there rather than under the module the writing arrived in. That is the whole of how a
// section authored during a run — where every edit is staged in one module of its own — becomes a
// section of the module it names. An id naming a module this one cannot see is left to `resolve`,
// which says so in the words an author reads everywhere else.
function writtenUnder(id: string, loaded: ReadonlySet<string>, visible: ReadonlySet<string | null>): { namespace: string; local: string } | null {
  const at = id.indexOf('.');
  if (at < 0) return null;
  const named = id.slice(0, at);
  return loaded.has(named) && visible.has(named) ? { namespace: named, local: id.slice(at + 1) } : null;
}

function declareIds(module: ParsedModule, namespace: Namespace, loaded: ReadonlySet<string>): void {
  const missingOptional = missingOptionalDependencies(module, loaded);
  const visible = visibleTo(module, loaded);
  module.sections = module.sections.filter((section) => {
    if (section.kind === 'remove') return !namesMissingOptional((section.value as Removal).kind, (section.value as Removal).target, missingOptional);
    const { id } = section.value as { id?: string };
    return id === undefined || !isOwnedKind(section.kind) || !id.includes('.') || !namesMissingOptional(section.kind, id, missingOptional);
  });

  for (const { kind, value } of createdSections(module)) {
    // An action minted under a section of its own takes that section's id, so it is declared where an authored one's would be and an author who writes the same heading is told rather than silently overwritten.
    for (const minted of sectionFor(kind)?.mintedActions?.(value) ?? []) {
      const under = actionTextSection(kind, value.id, minted.action);
      if (under.kind !== kind || under.id !== value.id) namespace.mint(under.kind, under.id, minted.from);
    }
    const scope = idScopeOf(kind);
    if (scope === 'none' || value.id === undefined) continue;
    const written = scope === 'owned' ? writtenUnder(value.id, loaded, visible) : null;
    if (written === null && value.id.includes('.')) continue;
    const own = written?.local ?? value.id;
    if (kind === 'flag' && own === VISITS) throw new DslError(`# flag ${VISITS} is reserved: the engine reads <node>.${VISITS} as a dialogue node's visit counter`);
    // A global id is one name whichever module wrote it, so the world holds it at the root instead of under the module that happened to.
    namespace.declare(kind, scope === 'owned' ? (written?.namespace ?? module.namespace) : null, own);
  }
}

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
      if (!isOwnedKind(removal.kind)) throw new DslError(`# remove ${removal.id}: ${removal.kind} is not a kind a module owns`);
      removal.target = namespace.resolve(removal.kind, removal.target, self, visible, `# remove ${removal.id}`);
      const owner = namespace.ownerOf(removal.kind, removal.target);
      if (owner !== null && owner !== undefined && unorderedDependencies(module).has(owner)) {
        throw new DslError(`# remove ${removal.id} edits ${owner}, but ~ dependencies do not load before this module. Use a load-order dependency for patches.`);
      }
      continue;
    }
    const { id } = section.value as { id: string };
    const visit = (kind: ReferenceKind, raw: string, where: string): string => (isOwnedKind(kind) && !namesMissingOptional(kind, raw, missingOptional) ? namespace.resolve(kind, raw, self, visible, where, id) : raw);
    visitSection(section, `# ${section.kind} ${id}`, visit);
  }
}

export const RESOLUTION_PASSES: readonly ((module: ParsedModule, namespace: Namespace, loaded: ReadonlySet<string>) => void)[] = [declareIds, settleIds, resolveReferences];
