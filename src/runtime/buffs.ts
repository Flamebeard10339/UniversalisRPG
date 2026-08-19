import type { Registry } from '../content/registry';
import type { Item } from '../content/item';
import { isTagClause, type TagClause } from '../grammar/tagClause';
import { localizerOf } from './localized';
import type { PruneWarning } from './pruning';
import { type BuffInstance, type GameState } from './state';
import { secondsToMs } from './units';

// One application of one source to one character, holding the tag-clause list
// that source carries. Nothing is scaled by how many instances are held, and
// nothing distinguishes a penalty from a bonus.
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

export function clearBuffs(state: GameState, actorIds: readonly string[]): void {
  for (const actorId of actorIds) set(state, actorId, []);
}

export function buffsOf(state: GameState, actorId: string): readonly BuffInstance[] {
  return state.buffs[actorId] ?? [];
}

// How many instances of one source a character is holding.
export function stackCount(state: GameState, actorId: string, source: string): number {
  return buffsOf(state, actorId).filter((buff) => buff.source === source).length;
}

// How long one instance of a declaration runs. Zero where it names no duration,
// which `applyDeclared`'s callers may not reach: the load path refuses an
// `inflict:` naming a source with none, and a `# item` with no duration clause
// grants a buff that is gone at the next boundary, which is the behaviour food
// has always had.
export function declaredSeconds(source: BuffSource): number {
  return source.tags.find((tag): tag is Extract<TagClause, { kind: 'duration' }> => tag.kind === 'duration')?.seconds ?? 0;
}

// The one place a declaration becomes an instance on a clock. Both authored
// routes into a buff — eating one, and an `inflict:` naming one — spend this,
// so a later rule about what may be granted is written once.
export function applyDeclared(state: GameState, actorId: string, source: BuffSource, now: number): void {
  grantBuff(state, actorId, source, now + secondsToMs(declaredSeconds(source)));
}

export function grantBuff(state: GameState, actorId: string, source: BuffSource, expiresAt: number): void {
  const stacks = source.tags.some((tag) => tag.kind === 'keyword' && tag.value === STACKS);
  const held = stacks ? buffsOf(state, actorId) : buffsOf(state, actorId).filter((buff) => buff.source !== source.id);
  set(state, actorId, [...held, { source: source.id, tags: source.tags, expiresAt }]);
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
//
// The kind of thing that is missing and its id, kept apart rather than composed
// into a phrase: a fragment like `stat attack` substituted into a sentence is a
// sentence no translator can reach.
type Missing = { kind: 'stat' | 'item' | 'resource'; id: string };

function missingReference(tag: TagClause, registry: Registry): Missing | undefined {
  if (tag.kind !== 'stat-bonus') return undefined;
  if (!registry.stats.has(tag.statId)) return { kind: 'stat', id: tag.statId };
  if (tag.per === undefined) return undefined;
  if (tag.per.kind === 'stack') return registry.items.has(tag.per.id) ? undefined : { kind: 'item', id: tag.per.id };
  return registry.resources.has(tag.per.id) ? undefined : { kind: 'resource', id: tag.per.id };
}

const MISSING_KEY = { stat: 'engine.prune.buff.stat', item: 'engine.prune.buff.item', resource: 'engine.prune.buff.resource' } as const;

// `actorLoaded` because who counts as a character is the encounter's to say and
// not this module's; what a buff is made of is this module's, and is the rest.
// Every holder is written back through `set` whether or not it lost anything,
// because a hand-written `# save` is the one table nothing else here assembled.
export function pruneBuffs(state: GameState, registry: Registry, actorLoaded: (actorId: string) => boolean): PruneWarning[] {
  const warnings: PruneWarning[] = [];
  const localizer = localizerOf(registry, state);
  const named = localizer.identifier;
  for (const [actorId, held] of Object.entries(state.buffs)) {
    if (!actorLoaded(actorId)) {
      set(state, actorId, []);
      warnings.push({ path: `buffs.${actorId}`, id: actorId, message: localizer.engine('engine.prune.buff.actor', { actor: named(actorId) }) });
      continue;
    }
    const kept: BuffInstance[] = [];
    for (const buff of held) {
      const missing: Missing | undefined = registry.items.has(buff.source)
        ? buff.tags.map((tag) => missingReference(tag, registry)).find((problem) => problem !== undefined)
        : { kind: 'item', id: buff.source };
      if (!missing) {
        kept.push(buff);
        continue;
      }
      const message = localizer.engine(MISSING_KEY[missing.kind], { buff: named(buff.source), actor: named(actorId), [missing.kind]: named(missing.id) });
      warnings.push({ path: `buffs.${actorId}.${buff.source}`, id: buff.source, message });
    }
    set(state, actorId, kept);
  }
  return warnings;
}
