import { describe, expect, it } from 'vitest';
import { MODAL_SCREENS } from '../grammar/actionResult';
import { point } from '../grammar/range';
import { applyResults, getDelta, HANDLER_SETTLE_PASSES, newSegment, RESULT_OBSERVERS, ResultApplication, ResultObserver, settlePools, standWhereTheyAre } from './effects';
import { DISCOVERED } from '../content/sections/location';
import { TOUCHED } from '../content/sections/define';
import { loadUniverseWithDiagnostics } from '../content/load';
import { shippedSources } from '../content/shipped';
import { roadsFrom } from './journey';
import { IMPLICIT_TARGET_FULL, newCadence } from './encounter';
import { applyResultsNow, createGameState, GameState, initResources, PLAYER } from './runtime';
import { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { toMilliUnits } from './units';
import { DEFAULT_LANGUAGE } from '../grammar/section';
import { mintedName } from '../grammar/values';

const OPENING_ONE = mintedName('choose-name', DEFAULT_LANGUAGE);

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

// Handlers that move pools: one empties a second pool, and one, when primed, feeds the pool that
// fired it.
const HANDLERS = `
# stat max-health
base: 20

# stat max-mana
base: 20

# stat max-charge
base: 10

# resource health
max: max-health

# resource mana
max: max-mana

# resource charge
start: 0
max: max-charge

# event death
resource: health
trigger: on empty

# event mana-gone
resource: mana
trigger: on empty

# event charged
resource: charge
trigger: on full

# flag primed

# entity player
on death:
  say: You black out.
  drain: 100 mana
  if primed:
    restore: charge
on mana-gone:
  say: The mana is gone.
on charged:
  restore: charge
`;

function watched(): { seen: ResultApplication[]; observer: ResultObserver } {
  const seen: ResultApplication[] = [];
  return { seen, observer: (_segment, application) => seen.push(application) };
}

function fresh(source = MODULE): { registry: Registry; state: GameState } {
  const registry = loadInEnglish(source);
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

describe('what an event handler does to a pool', () => {
  const faint = (state: GameState, registry: Registry): void =>
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: point(-100) }]);

  it('empties a second pool as loudly as anything else would, firing its on empty', () => {
    const { registry, state } = fresh(HANDLERS);

    faint(state, registry);

    expect(state.resources.mana).toBe(0);
    expect(state.log).toEqual(['You black out.', 'The mana is gone.']);
  });

  it('refuses handlers that keep feeding the pool that fired them, rather than settling forever', () => {
    const { registry, state } = fresh(HANDLERS);
    state.flags.primed = true;

    expect(() => faint(state, registry)).toThrow(`${HANDLER_SETTLE_PASSES} passes running`);
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

    applyResults(bare, [{ kind: 'open-modal', modal: 'choose-name' }], PLAYER);

    expect(state.modals.map((frame) => frame.name)).toEqual(['choose-name']);
    expect(state.log).toEqual([]);
  });

  // Subjects derived from the whole of what `open modal:` may name, so a screen the language opens
  // next month is held to the same line with nothing edited here.
  it('tells a player a screen opened in the screen own words, for every screen a world may open', () => {
    expect(MODAL_SCREENS.length).toBeGreaterThan(0);
    for (const screen of MODAL_SCREENS) {
      const { registry, state } = fresh();
      applyResults(newSegment(state, registry), [{ kind: 'open-modal', modal: screen }], PLAYER);

      expect(state.log, screen).toHaveLength(1);
      expect(state.log[0], `${screen} reaches the player as the address the engine keys it by`).not.toContain(screen);
      expect(state.log[0], screen).toContain(mintedName(screen, DEFAULT_LANGUAGE));
    }
  });

  it('narrates a modal once per batch through the observers a segment carries by default', () => {
    const { registry, state } = fresh();
    const wired = newSegment(state, registry);

    applyResults(wired, [
      { kind: 'open-modal', modal: 'choose-name' },
      { kind: 'give', item: 'coin', amount: { min: 1, max: 4 } },
    ], PLAYER, 5);

    expect(state.log).toEqual([expect.stringContaining(OPENING_ONE)]);
    expect(state.log[0], 'a screen names itself to a player in words, never as the address the engine keys it by').not.toContain('choose-name');
    expect(state.modals.map((frame) => frame.name)).toEqual(['choose-name']);
  });

  it('lets a caller subscribe alongside the default list rather than in place of it', () => {
    const { registry, state } = fresh();
    const { seen, observer } = watched();
    const segment = newSegment(state, registry, [...RESULT_OBSERVERS, observer]);

    applyResults(segment, [{ kind: 'open-modal', modal: 'choose-name' }], PLAYER);

    expect(state.log).toEqual([expect.stringContaining(OPENING_ONE)]);
    expect(seen.map((application) => application.result.kind)).toEqual(['open-modal']);
  });
});

// The two words the engine has for a place, told apart over every location the corpus declares
// rather than over one that was easy to pick. Standing somewhere is the only thing that touches it,
// and the same step puts every neighbour the roads open on the map without touching any of them —
// so a `when:` asking whether the player has been here means something a `when:` asking whether
// they have heard of it does not. A location written next month is held to this with no edit.
describe('standing in a place the corpus declares', () => {
  const world = loadUniverseWithDiagnostics(shippedSources()).registry;
  const everywhere = [...world.locations.keys()];

  const stood = (id: string): GameState => {
    const state = createGameState(id);
    standWhereTheyAre(state, world);
    return state;
  };

  const flagged = (state: GameState, flag: string): string[] =>
    Object.keys(state.flags)
      .filter((key) => key.endsWith(`.${flag}`))
      .map((key) => key.slice(0, -flag.length - 1))
      .sort();

  const openOut = (id: string): string[] => roadsFrom(id, world, stood(id));

  it('is asked of enough places, with enough roads between them, for what is below to mean something', () => {
    expect(everywhere.length).toBeGreaterThan(20);
    expect(everywhere.filter((id) => openOut(id).length > 0).length).toBeGreaterThan(20);
  });

  it.each(everywhere)('touches %s and nowhere else, however many roads run out of it', (id) => {
    expect(flagged(stood(id), TOUCHED)).toEqual([id]);
  });

  it.each(everywhere)('puts %s on the map together with every neighbour its open roads reach, and nothing further', (id) => {
    expect(flagged(stood(id), DISCOVERED)).toEqual([...new Set([id, ...openOut(id)])].sort());
  });

  it('leaves every place with a road out of it heard of from somewhere nobody stood, which is the whole difference between the two', () => {
    const heardOnly = everywhere.filter((id) => flagged(stood(id), DISCOVERED).length > flagged(stood(id), TOUCHED).length);
    expect(heardOnly).toEqual(everywhere.filter((id) => openOut(id).length > 0));
    expect(heardOnly.length).toBeGreaterThan(20);
  });
});
