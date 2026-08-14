import type { Registry } from '../content/registry';
import type { Item } from '../content/item';
import { isTagClause, TagClause } from '../grammar/tagClause';
import type { PruneWarning } from './save';
import type { GameState } from './state';

// One application of one source to one character, holding the tag-clause list
// that source carries. Nothing is scaled by how many instances are held, and
// nothing distinguishes a penalty from a bonus.
export interface BuffInstance {
  readonly source: string;
  readonly tags: readonly TagClause[];
  readonly expiresAt: number;
}

// Who holds what. Readonly because this module owns every write, and with it
// granting, stacking, expiry, and how a buff's identity is spelled — no reader
// takes a source id apart, because none of them assembled it.
export type BuffTable = { readonly [actorId: string]: readonly BuffInstance[] };

// An `# item` is the only thing that can grant one, because a source id has to
// still resolve after a save is reloaded and an item id is what `pruneBuffs`
// can ask the registry about. A grantor of any other shape is a second question
// for that rule before it is a type here.
export type BuffSource = Item;

// Authored, so that whether a second application adds or replaces is a decision
// a source states rather than a consequence of two keys colliding.
export const STACKS = 'stacks';

function writable(state: GameState): { [actorId: string]: readonly BuffInstance[] } {
  return state.buffs as { [actorId: string]: readonly BuffInstance[] };
}

function set(state: GameState, actorId: string, held: readonly BuffInstance[]): void {
  const table = writable(state);
  // An actor holding nothing is spelled as absent, so a save diff and a table
  // walked for the next expiry both see the same nothing.
  if (held.length === 0) delete table[actorId];
  else table[actorId] = held;
}

export function buffsOf(state: GameState, actorId: string): readonly BuffInstance[] {
  return state.buffs[actorId] ?? [];
}

// How many instances of one source a character is holding.
export function stackCount(state: GameState, actorId: string, source: string): number {
  return buffsOf(state, actorId).filter((buff) => buff.source === source).length;
}

export function grantBuff(state: GameState, actorId: string, source: BuffSource, expiresAt: number): void {
  const stacks = source.tags.some((tag) => tag.kind === 'keyword' && tag.value === STACKS);
  const held = stacks ? buffsOf(state, actorId) : buffsOf(state, actorId).filter((buff) => buff.source !== source.id);
  set(state, actorId, [...held, { source: source.id, tags: source.tags, expiresAt }]);
}

export function clearBuffs(state: GameState, actorIds: readonly string[]): void {
  for (const actorId of actorIds) set(state, actorId, []);
}

// The earliest instant any instance ends. Each instance runs on its own clock,
// so a second application is a second one of these rather than a moved one.
export function nextBuffExpiry(state: GameState): { at: number; actorId: string; source: string } | undefined {
  let earliest: { at: number; actorId: string; source: string } | undefined;
  for (const [actorId, held] of Object.entries(state.buffs)) {
    for (const buff of held) {
      if (!earliest || buff.expiresAt < earliest.at) earliest = { at: buff.expiresAt, actorId, source: buff.source };
    }
  }
  return earliest;
}

export function expireBuffs(state: GameState, at: number): boolean {
  let changed = false;
  for (const [actorId, held] of Object.entries(state.buffs)) {
    const left = held.filter((buff) => buff.expiresAt > at);
    if (left.length === held.length) continue;
    set(state, actorId, left);
    changed = true;
  }
  return changed;
}

export function isBuffList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((held) => {
      if (typeof held !== 'object' || held === null) return false;
      const { source, tags, expiresAt } = held as { source?: unknown; tags?: unknown; expiresAt?: unknown };
      return typeof source === 'string' && typeof expiresAt === 'number' && Array.isArray(tags) && tags.every(isTagClause);
    })
  );
}

// Every id a clause names that has to still resolve: the stat it moves, and the
// counter its magnitude is multiplied by. A counter resolving to nothing scales
// the bonus to nothing rather than failing, so an unresolvable one has to be
// found here — the load path refuses it, and a `# save` body is the one reader
// the load path never sees.
function missingReference(tag: TagClause, registry: Registry): string | undefined {
  if (tag.kind !== 'stat-bonus') return undefined;
  if (!registry.stats.has(tag.statId)) return `stat ${tag.statId}`;
  if (tag.per === undefined) return undefined;
  if (tag.per.kind === 'stack') return registry.items.has(tag.per.id) ? undefined : `item ${tag.per.id}`;
  return registry.resources.has(tag.per.id) ? undefined : `resource ${tag.per.id}`;
}

// `actorLoaded` because who counts as a character is the encounter's to say and
// not this module's; what a buff is made of is this module's, and is the rest.
// Every holder is written back through `set` whether or not it lost anything,
// because a hand-written `# save` is the one table nothing else here assembled.
export function pruneBuffs(state: GameState, registry: Registry, actorLoaded: (actorId: string) => boolean): PruneWarning[] {
  const warnings: PruneWarning[] = [];
  for (const [actorId, held] of Object.entries(state.buffs)) {
    if (!actorLoaded(actorId)) {
      set(state, actorId, []);
      warnings.push({ path: `buffs.${actorId}`, id: actorId, message: `Removed every buff on ${actorId} because it is not a character this world has.` });
      continue;
    }
    const kept: BuffInstance[] = [];
    for (const buff of held) {
      const missing = registry.items.has(buff.source)
        ? buff.tags.map((tag) => missingReference(tag, registry)).find((problem) => problem !== undefined)
        : `item ${buff.source}`;
      if (!missing) {
        kept.push(buff);
        continue;
      }
      warnings.push({ path: `buffs.${actorId}.${buff.source}`, id: buff.source, message: `Removed buff ${buff.source} on ${actorId} because its ${missing} is not loaded.` });
    }
    set(state, actorId, kept);
  }
  return warnings;
}
