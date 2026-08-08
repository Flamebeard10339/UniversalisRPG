import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { applyResults, getDelta, newSegment, ResultApplication, ResultObserver, settlePools } from './effects';
import { IMPLICIT_TARGET_FULL, newCadence } from './encounter';
import { createGameState, GameState, initResources, PLAYER } from './runtime';
import { loadModule, Registry } from '../content/registry';
import { toMilliUnits } from './units';

const MODULE = `
# stat max-health
base: 20

# resource health
max: max-health
`;

function watched(): { seen: ResultApplication[]; observer: ResultObserver } {
  const seen: ResultApplication[] = [];
  return { seen, observer: (_segment, application) => seen.push(application) };
}

function fresh(): { registry: Registry; state: GameState } {
  const registry = loadModule(MODULE);
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
      actionLabel: 'fight',
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
});

describe('applyResults: watching what was applied', () => {
  it('reports each applied result with its actor and what it moved, and reports no wrapper', () => {
    const { registry, state } = fresh();
    state.inventory.coin = 2;
    const { seen, observer } = watched();
    const segment = newSegment(state, registry, [observer]);

    applyResults(segment, [
      { kind: 'give', item: 'coin', amount: point(3) },
      { kind: 'take', item: 'coin', amount: 10 },
      { kind: 'xp', skill: 'thieving', amount: point(4) },
      { kind: 'chance', numerator: 1, denominator: 1, results: [{ kind: 'set', variable: 'opened' }] },
    ], 'brute');

    expect(seen.map((application) => [application.result.kind, application.actor, application.magnitude])).toEqual([
      ['give', 'brute', 3],
      // Five asked for, two held plus the three just given: what moved is -5.
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
      { kind: 'say', text: 'One loaf.' },
      { kind: 'give', item: 'coin', amount: { min: 1, max: 4 } },
    ], PLAYER, 5);

    expect(state.log).toEqual(['One loaf.']);
    expect(seen.filter((application) => application.result.kind === 'say')).toHaveLength(1);
    expect(seen.filter((application) => application.result.kind === 'give')).toHaveLength(5);
  });

  it('narrates a modal from the observers, so applying one without them opens it silently', () => {
    const { registry, state } = fresh();
    const bare = newSegment(state, registry, []);

    applyResults(bare, [{ kind: 'open-modal', modal: 'character-creation' }], PLAYER);

    expect(state.pendingModal).toBe('character-creation');
    expect(state.log).toEqual([]);
  });

  it('narrates a modal once per batch through the observers a segment carries by default', () => {
    const { registry, state } = fresh();
    const wired = newSegment(state, registry);

    applyResults(wired, [
      { kind: 'open-modal', modal: 'character-creation' },
      { kind: 'give', item: 'coin', amount: { min: 1, max: 4 } },
    ], PLAYER, 5);

    expect(state.log).toEqual(['modal:character-creation']);
    expect(state.pendingModal).toBe('character-creation');
  });
});
