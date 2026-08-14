import type { Registry } from '../content/registry';
import type { TagClause } from '../grammar/tagClause';
import type { PruneWarning } from './save';
import type { GameState } from './state';

// One application of one source to one character. A buff is equipment that
// expires, so what it grants is the tag-clause list an item already carries and
// nothing is scaled by how many are held: five instances of `+6 attack` are
// `+30 attack` because the fold reads five carriers, not because anything here
// multiplies. A penalty is a negative amount in that same list.
export interface BuffInstance {
  readonly source: string;
  readonly tags: readonly TagClause[];
  readonly expiresAt: number;
}

// Who holds what. Readonly because this module owns every write, and with it
// granting, stacking, expiry, and how a buff's identity is spelled — no reader
// takes a source id apart, because none of them assembled it.
export type BuffTable = { readonly [actorId: string]: readonly BuffInstance[] };

// What a source has to say to grant one. An `# item` is one already, which is
// why nothing converts one into anything.
export interface BuffSource {
  readonly id: string;
  readonly tags: readonly TagClause[];
}

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

// How many instances of one source a character is holding, which is what
// `per stack of <source>` counts.
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

// The earliest instant any instance ends, for the boundary walk to weigh
// against every other clock. Each instance runs on its own, so a second
// application is a second boundary rather than a moved one.
export function nextBuffExpiry(state: GameState): { at: number; actorId: string; source: string } | undefined {
  let earliest: { at: number; actorId: string; source: string } | undefined;
  for (const [actorId, held] of Object.entries(state.buffs)) {
    for (const buff of held) {
      if (!earliest || buff.expiresAt < earliest.at) earliest = { at: buff.expiresAt, actorId, source: buff.source };
    }
  }
  return earliest;
}

// Returns whether anything ended, because the boundary loop repeats until a
// pass moves nothing.
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

function isTagClause(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { kind } = value as { kind?: unknown };
  return kind === 'keyword' || kind === 'stat-bonus' || kind === 'duration';
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

// `actorLoaded` because who counts as a character is the encounter's to say and
// not this module's; what a buff is made of is this module's, and is the rest.
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
      const missingStat = buff.tags.find((tag) => tag.kind === 'stat-bonus' && !registry.stats.has(tag.statId));
      const missing = !registry.items.has(buff.source)
        ? `item ${buff.source}`
        : missingStat
          ? `stat ${(missingStat as Extract<TagClause, { kind: 'stat-bonus' }>).statId}`
          : undefined;
      if (!missing) {
        kept.push(buff);
        continue;
      }
      warnings.push({ path: `buffs.${actorId}.${buff.source}`, id: buff.source, message: `Removed buff ${buff.source} on ${actorId} because its ${missing} is not loaded.` });
    }
    if (kept.length !== held.length) set(state, actorId, kept);
  }
  return warnings;
}
