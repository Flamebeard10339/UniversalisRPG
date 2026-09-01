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

// The module an id names, which is the first thing written in it. Where a section belongs is read off
// its id and asked of nothing else, so anything composing an id for a section it is about to make
// takes the module apart the same way the loader puts it together.
export const moduleNamed = (id: string): string | null => (id.includes('.') ? id.slice(0, id.indexOf('.')) : null);

// A section made during a run is staged rather than shipped, and its id is the only thing saying
// which file it goes home to, so a kind a module owns cannot be made under a name that says no
// module: there would be no file to take it back to. Said here beside the rule it is the refusal
// for, and read by every command that makes a section rather than by the one that was written first.
export const homelessId = (kind: string, id: string): string | null =>
  isOwnedKind(kind) && !id.includes('.') ? `${id} names no module: write it as <module>.${id}, which is where the section belongs` : null;

// The module a body is written over is the one its address names, and not whoever wrote at that
// address first: under a ~ dependency which of the two came first is the very thing in doubt.
function refuseUnorderedEdit(module: ParsedModule, key: string, where: string): void {
  const edited = moduleNamed(key);
  if (edited !== null && edited !== module.namespace && unorderedDependencies(module).has(edited)) {
    throw new DslError(`${where} edits ${edited}, but ~ dependencies do not load before this module. Use a load-order dependency for patches.`);
  }
}

function targetKey(module: ParsedModule, kind: string, id: string, namespace: Namespace, visible: ReadonlySet<string | null>): string {
  const own = declaredKey(module.namespace, kind, id);
  if (own !== null) return own;
  const resolved = namespace.resolve(kind, id, module.namespace, visible, `# ${kind} ${id}`);
  refuseUnorderedEdit(module, resolved, `# ${kind} ${id}`);
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

// The name inside the module a qualified id addresses, where that module is one this one can see.
// An id naming a module this one cannot see is left to `resolve`, which says so in the words an
// author reads everywhere else.
function addressedIn(id: string, loaded: ReadonlySet<string>, visible: ReadonlySet<string | null>): string | null {
  const named = moduleNamed(id);
  if (named === null) return null;
  return loaded.has(named) && visible.has(named) ? id.slice(named.length + 1) : null;
}

// Which kind owns each registry map, so a value one kind lands in another's is known for what it is.
let owningKind: ReadonlyMap<string, string> | undefined;
const ownerOfMap = (): ReadonlyMap<string, string> => (owningKind ??= new Map(contentSectionMaps().map(([kind, map]) => [map, kind])));

// A section that carries a value of another kind rather than naming one declares that value's id under
// that kind. What a section lands where is its `maps` and nothing else's to say, so a kind that starts
// carrying one next month is held apart, resolved and refused for a name already taken with no edit here.
export function carriedIds(kind: string, value: { id: string }): { kind: string; id: string }[] {
  const owner = sectionFor(kind);
  const found: { kind: string; id: string }[] = [];
  for (const [map, lands] of Object.entries(owner?.maps ?? {})) {
    const under = ownerOfMap().get(map);
    if (under === undefined || under === kind) continue;
    for (const [id] of lands(value)) found.push({ kind: under, id });
  }
  return found;
}

function declareIds(module: ParsedModule, namespace: Namespace, loaded: ReadonlySet<string>): void {
  const missingOptional = missingOptionalDependencies(module, loaded);
  const visible = visibleTo(module, loaded);
  module.sections = module.sections.filter((section) => {
    if (section.kind === 'remove') return !namesMissingOptional((section.value as Removal).kind, (section.value as Removal).target, missingOptional);
    const { id } = section.value as { id?: string };
    return id === undefined || !isOwnedKind(section.kind) || !id.includes('.') || !namesMissingOptional(section.kind, id, missingOptional);
  });

  // `carriedBy` names the section a value of this kind was written under rather than beside, and a name
  // written there is minted: nothing else may be authored at it, or the two would be one key and the
  // one that loaded last would silently win.
  const declaring = (kind: string, id: string, carriedBy?: string): void => {
    const scope = idScopeOf(kind);
    if (scope === 'none') return;
    // A global id is one name whichever module wrote it, so the world holds it at the root instead of under the module that happened to.
    if (scope !== 'owned') return void namespace.declare(kind, null, id);
    const addressed = addressedIn(id, loaded, visible);
    if (addressed === null && id.includes('.')) return;
    const own = addressed ?? id;
    if (kind === 'flag' && own === VISITS) throw new DslError(`# flag ${VISITS} is reserved: the engine reads <node>.${VISITS} as a dialogue node's visit counter`);
    const key = addressed === null ? qualify(module.namespace, own) : id;
    if (carriedBy === undefined) namespace.declare(kind, module.namespace, key);
    else namespace.mint(kind, key, carriedBy, module.namespace);
  };

  for (const { kind, value } of createdSections(module)) {
    // An action minted under a section of its own takes that section's id, so it is declared where an authored one's would be and an author who writes the same heading is told rather than silently overwritten.
    for (const minted of sectionFor(kind)?.mintedActions?.(value) ?? []) {
      const under = actionTextSection(kind, value.id, minted.action);
      if (under.kind !== kind || under.id !== value.id) namespace.mint(under.kind, under.id, minted.from);
    }
    if (value.id === undefined) continue;
    declaring(kind, value.id);
    for (const each of carriedIds(kind, value as { id: string })) declaring(each.kind, each.id, `# ${kind} ${value.id}`);
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
      refuseUnorderedEdit(module, removal.target, `# remove ${removal.id}`);
      continue;
    }
    const { id } = section.value as { id: string };
    const visit = (kind: ReferenceKind, raw: string, where: string): string => (isOwnedKind(kind) && !namesMissingOptional(kind, raw, missingOptional) ? namespace.resolve(kind, raw, self, visible, where, id) : raw);
    visitSection(section, `# ${section.kind} ${id}`, visit);
  }
}

export const RESOLUTION_PASSES: readonly ((module: ParsedModule, namespace: Namespace, loaded: ReadonlySet<string>) => void)[] = [declareIds, settleIds, resolveReferences];
