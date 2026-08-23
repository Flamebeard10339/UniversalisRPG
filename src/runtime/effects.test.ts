import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { applyResults, getDelta, newSegment, RESULT_OBSERVERS, ResultApplication, ResultObserver, settlePools } from './effects';
import { IMPLICIT_TARGET_FULL, newCadence } from './encounter';
import { createGameState, GameState, initResources, PLAYER } from './runtime';
import { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { toMilliUnits } from './units';

const MODULE = `
# stat max-health
base: 20

# flag lit

# resource health
max: max-health

# droptable spoils
drain: 5 health

# droptable bakery
say: One loaf.

// One of each wrapper kind, every one of them certain to fire, so what varies
// between them is only which actor their body is applied to.
# droptable every-wrapper
1 in 1: drain: 5 health
1000 vs 0: drain: 5 health
if lit: drain: 5 health
one of:
  1x: drain: 5 health
roll: spoils
`;

function watched(): { seen: ResultApplication[]; observer: ResultObserver } {
  const seen: ResultApplication[] = [];
  return { seen, observer: (_segment, application) => seen.push(application) };
}

function fresh(): { registry: Registry; state: GameState } {
  const registry = loadInEnglish(MODULE);
  const state = createGameState();
  initResources(state, registry);
  return { registry, state };
}

describe('applyResults: the actor a result applies to', () => {
  it('accrues a pool result against the actor it was given, not the player', () => {
    const { registry, state } = fresh();
    const segment = newSegment(state, registry, []);

    applyResults(segment, [{ kind: 'pool', resource: 'health', delta: point(-5) }], 'brute');

    expect(getDelta(segment.deltas, 'brute', 'health')).toBe(toMilliUnits(-5));
    expect(getDelta(segment.deltas, PLAYER, 'health')).toBe(0);
  });

  it('settles that accrual into the foe\'s pools and leaves the player\'s where it was', () => {
    const { registry, state } = fresh();
    state.activeAction = {
      ownerRef: 'entity.brute',
      actionSlug: 'fight',
      repeating: false,
      implicitTarget: IMPLICIT_TARGET_FULL,
      cadences: { [PLAYER]: newCadence() },
      actors: { brute: { resources: { health: toMilliUnits(20) }, rateRemainders: {} } },
    };
    const segment = newSegment(state, registry, []);

    applyResults(segment, [{ kind: 'pool', resource: 'health', delta: point(-5) }], 'brute');
    settlePools(state, registry, [], 0, segment.deltas);

    expect(state.activeAction.actors!.brute.resources.health).toBe(toMilliUnits(15));
    expect(state.resources.health).toBe(toMilliUnits(20));
  });

  it('carries the actor into the body of every wrapper kind', () => {
    const { registry, state } = fresh();
    state.flags.lit = true;
    const segment = newSegment(state, registry, []);

    applyResults(segment, registry.dropTables.get('every-wrapper')!.results, 'brute');

    expect(getDelta(segment.deltas, 'brute', 'health')).toBe(toMilliUnits(-25));
    expect(getDelta(segment.deltas, PLAYER, 'health')).toBe(0);
  });

  it('carries the actor into each repetition of a batch that samples per application', () => {
    const { registry, state } = fresh();
    state.flags.lit = true;
    const segment = newSegment(state, registry, []);

    applyResults(segment, registry.dropTables.get('every-wrapper')!.results, 'brute', 3);

    expect(getDelta(segment.deltas, 'brute', 'health')).toBe(toMilliUnits(-75));
    expect(getDelta(segment.deltas, PLAYER, 'health')).toBe(0);
  });
});

describe('applyResults: watching what was applied', () => {
  it('reports each applied result with its actor and what it moved, and reports no wrapper', () => {
    const { registry, state } = fresh();
    state.inventory.coin = 2;
    const { seen, observer } = watched();
    const segment = newSegment(state, registry, [observer]);

    applyResults(segment, [
      { kind: 'give', item: 'coin', amount: point(3) },
      { kind: 'take', item: 'coin', amount: 5 },
      { kind: 'xp', skill: 'thieving', amount: point(4) },
      { kind: 'chance', numerator: 1, denominator: 1, results: [{ kind: 'set', variable: 'opened' }] },
    ], 'brute');

    expect(seen.map((application) => [application.result.kind, application.actor, application.magnitude])).toEqual([
      ['give', 'brute', 3],
      ['take', 'brute', -5],
      ['xp', 'brute', 4],
      ['set', 'brute', 0],
    ]);
  });

  it('reports a repetition that does not lead as not having spoken', () => {
    const { registry, state } = fresh();
    const { seen, observer } = watched();
    const segment = newSegment(state, registry, [observer]);

    applyResults(segment, [
      registry.dropTables.get('bakery')!.results[0],
      { kind: 'give', item: 'coin', amount: { min: 1, max: 4 } },
    ], PLAYER, 5);

    expect(state.log).toEqual(['One loaf.']);
    expect(seen.filter((application) => application.result.kind === 'say')).toHaveLength(1);
    expect(seen.filter((application) => application.result.kind === 'give')).toHaveLength(5);
  });

  it('narrates a modal from the observers, so applying one without them opens it silently', () => {
    const { registry, state } = fresh();
    const bare = newSegment(state, registry, []);

    applyResults(bare, [{ kind: 'open-modal', modal: 'name-yourself' }], PLAYER);

    expect(state.modals.map((frame) => frame.name)).toEqual(['name-yourself']);
    expect(state.log).toEqual([]);
  });

  it('narrates a modal once per batch through the observers a segment carries by default', () => {
    const { registry, state } = fresh();
    const wired = newSegment(state, registry);

    applyResults(wired, [
      { kind: 'open-modal', modal: 'name-yourself' },
      { kind: 'give', item: 'coin', amount: { min: 1, max: 4 } },
    ], PLAYER, 5);

    expect(state.log).toEqual(['modal:name-yourself']);
    expect(state.modals.map((frame) => frame.name)).toEqual(['name-yourself']);
  });

  it('lets a caller subscribe alongside the default list rather than in place of it', () => {
    const { registry, state } = fresh();
    const { seen, observer } = watched();
    const segment = newSegment(state, registry, [...RESULT_OBSERVERS, observer]);

    applyResults(segment, [{ kind: 'open-modal', modal: 'name-yourself' }], PLAYER);

    expect(state.log).toEqual(['modal:name-yourself']);
    expect(seen.map((application) => application.result.kind)).toEqual(['open-modal']);
  });
});
