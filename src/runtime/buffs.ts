import type { Registry } from '../content/registry';
import type { Item } from '../content/sections/item';
import { carries, isTagClause, type TagClause } from '../grammar/tagClause';
import { localizerOf, type Answer, type Localized } from './localized';
import type { PruneWarning } from './pruning';
import { type BuffInstance, type GameState } from './state';
import { MS_PER_SECOND, secondsToMs } from './units';

export type BuffSource = Item;

function writable(state: GameState): { [actorId: string]: readonly BuffInstance[] } {
  return state.buffs as { [actorId: string]: readonly BuffInstance[] };
}

function set(state: GameState, actorId: string, held: readonly BuffInstance[]): void {
  const table = writable(state);
  if (held.length === 0) delete table[actorId];
  else table[actorId] = held;
}

export function clearBuffs(state: GameState, actorIds: readonly string[]): void {
  for (const actorId of actorIds) set(state, actorId, []);
}

export function buffsOf(state: GameState, actorId: string): readonly BuffInstance[] {
  return state.buffs[actorId] ?? [];
}

export function stackCount(state: GameState, actorId: string, source: string): number {
  return buffsOf(state, actorId).filter((buff) => buff.source === source).length;
}

export interface HeldEffect {
  readonly id: Answer;
  readonly title: Localized;
  readonly stacks: number;
  readonly secondsLeft: number;
}

export function heldEffects(state: GameState, registry: Registry, actorId: string): HeldEffect[] {
  const title = localizerOf(registry, state).title;
  const rows = new Map<string, HeldEffect>();
  for (const buff of buffsOf(state, actorId)) {
    const held = rows.get(buff.source);
    rows.set(buff.source, {
      id: buff.source,
      title: title('item', buff.source),
      stacks: (held?.stacks ?? 0) + 1,
      secondsLeft: Math.max(held?.secondsLeft ?? 0, Math.ceil(Math.max(0, buff.expiresAt - state.time) / MS_PER_SECOND)),
    });
  }
  return [...rows.values()].sort((one, other) => one.secondsLeft - other.secondsLeft);
}

export function declaredSeconds(source: BuffSource): number {
  return source.tags.find((tag): tag is Extract<TagClause, { kind: 'duration' }> => tag.kind === 'duration')?.seconds ?? 0;
}

export function applyDeclared(state: GameState, actorId: string, source: BuffSource, now: number, seconds = declaredSeconds(source)): void {
  grantBuff(state, actorId, source, now + secondsToMs(Math.max(0, seconds)));
}

export function grantBuff(state: GameState, actorId: string, source: BuffSource, expiresAt: number): void {
  const stacks = carries(source.tags, 'stacks');
  const held = stacks ? buffsOf(state, actorId) : buffsOf(state, actorId).filter((buff) => buff.source !== source.id);
  set(state, actorId, [...held, { source: source.id, tags: source.tags, expiresAt }]);
}

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

type Missing = { kind: 'stat' | 'item' | 'resource'; id: string };

function missingReference(tag: TagClause, registry: Registry): Missing | undefined {
  if (tag.kind !== 'stat-bonus') return undefined;
  if (!registry.stats.has(tag.statId)) return { kind: 'stat', id: tag.statId };
  if (tag.per === undefined) return undefined;
  if (tag.per.kind === 'stack') return registry.items.has(tag.per.id) ? undefined : { kind: 'item', id: tag.per.id };
  return registry.resources.has(tag.per.id) ? undefined : { kind: 'resource', id: tag.per.id };
}

const MISSING_KEY = { stat: 'engine.prune.buff.stat', item: 'engine.prune.buff.item', resource: 'engine.prune.buff.resource' } as const;

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
