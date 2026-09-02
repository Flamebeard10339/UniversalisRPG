import { describe, expect, it } from 'vitest';
import { MODAL_SCREENS } from '../grammar/actionResult';
import { point } from '../grammar/range';
import { applyResults, facing, getDelta, HANDLER_SETTLE_PASSES, newSegment, RESULT_OBSERVERS, ResultApplication, ResultObserver, settlePools, standWhereTheyAre } from './effects';
import { DISCOVERED } from '../content/sections/location';
import { TOUCHED } from '../content/sections/define';
import { loadUniverseWithDiagnostics } from '../content/load';
import { fixtureSources } from '../content/worldFixture';
import { buffsOf } from './buffs';
import { roadsFrom } from './journey';
import { IMPLICIT_TARGET_FULL, newCadence } from './encounter';
import { applyResultsNow, createGameState, GameState, grantBuff, initResources, PLAYER } from './runtime';
import { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { secondsToMs, toMilliUnits } from './units';
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

describe('standing in a place the fixture world declares', () => {
  const world = loadUniverseWithDiagnostics(fixtureSources()).registry;
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
    expect(everywhere.length).toBeGreaterThan(2);
    expect(everywhere.filter((id) => openOut(id).length > 0).length).toBeGreaterThan(2);
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
    expect(heardOnly.length).toBeGreaterThan(2);
  });
});

describe('a one of: row weighed by a stat', () => {
  const CHEST = `
# stat luck
base: 5

# item coin
examine: A coin.

# item gem
examine: A gem.

# item cursed-charm
examine: It is not lucky.
-1000% luck, 600s

# entity chest
open:
  one of:
    luck: give: 1 gem
    2x: give: 1 coin
`;

  const opening = (cursed: boolean): { state: GameState; open: () => void } => {
    const registry = loadInEnglish(CHEST);
    const state = createGameState();
    state.rng = 7;
    if (cursed) grantBuff(state, PLAYER, registry.items.get('cursed-charm')!, secondsToMs(600));
    const results = registry.entities.get('chest')!.actions.find((each) => each.label === 'open')!.results;
    return { state, open: () => applyResultsNow(state, registry, results) };
  };

  it('draws on both rows while the stat reads a quantity', () => {
    const { state, open } = opening(false);
    for (let i = 0; i < 50; i++) open();

    expect(state.inventory['gem'] ?? 0).toBeGreaterThan(0);
    expect(state.inventory['coin'] ?? 0).toBeGreaterThan(0);
  });

  it('refuses a stat that has been carried below nothing, naming the row, rather than never firing it', () => {
    const { state, open } = opening(true);

    expect(open).toThrow(/one of: row luck weighs -\d/);
    expect(state.inventory['gem'] ?? 0, 'and nothing was handed out on the way to saying so').toBe(0);
  });
});

const TOLL = `
# stat max-health
base: 20

# stat toll
base: 1

# resource health
max: max-health

# skill larceny
title: Larceny

# entity mark
title: Mark
stats: toll 7
`;

describe('an amount that names a stat', () => {
  const paid = (amount: { side?: 'my' | 'their'; id: string }): { xp: number; drained: number } => {
    const registry = loadInEnglish(TOLL);
    const state = createGameState();
    initResources(state, registry);
    const segment = newSegment(state, registry, []);
    facing(segment, PLAYER, 'mark', () =>
      applyResults(segment, [
        { kind: 'xp', skill: 'larceny', amount },
        { kind: 'pool', resource: 'health', delta: { ...amount, falls: true } },
      ], PLAYER),
    );
    return { xp: state.xp['larceny'] ?? 0, drained: getDelta(segment.deltas, PLAYER, 'health') };
  };

  it('reads it off the other party where the amount says their', () => {
    expect(paid({ side: 'their', id: 'toll' })).toEqual({ xp: 7, drained: toMilliUnits(-7) });
  });

  it('reads it off whoever acts where the amount says my, or names no side at all', () => {
    expect(paid({ side: 'my', id: 'toll' })).toEqual({ xp: 1, drained: toMilliUnits(-1) });
    expect(paid({ id: 'toll' })).toEqual({ xp: 1, drained: toMilliUnits(-1) });
  });

  it('falls back to whoever acts where nothing else stands opposite', () => {
    const registry = loadInEnglish(TOLL);
    const state = createGameState();
    initResources(state, registry);
    const segment = newSegment(state, registry, []);

    applyResults(segment, [{ kind: 'xp', skill: 'larceny', amount: { side: 'their', id: 'toll' } }], PLAYER);

    expect(state.xp['larceny']).toBe(1);
  });
});

const MARKED = `
# info marked
version: 1.0.0

# stat regeneration

# stat attack-rate

# item dazed
title: Dazed
examine: The floor is closer than it was.
-30 regeneration, 20s

# item hurried
title: Hurried
examine: The next one comes faster.
+2 attack-rate, 60s
`;

describe('shaking a mark back off whoever is carrying it', () => {
  const carrying = (): { registry: Registry; state: GameState } => {
    const held = fresh(MARKED);
    for (const source of ['marked.dazed', 'marked.hurried']) grantBuff(held.state, PLAYER, held.registry.items.get(source)!, secondsToMs(30));
    return held;
  };

  it('takes off the one it names and leaves the rest standing', () => {
    const { registry, state } = carrying();

    applyResults(newSegment(state, registry, []), [{ kind: 'shake-off', buff: 'marked.dazed' }], PLAYER);

    expect(buffsOf(state, PLAYER).map((buff) => buff.source)).toEqual(['marked.hurried']);
  });

  it('takes off every mark at once where it names everything', () => {
    const { registry, state } = carrying();

    applyResults(newSegment(state, registry, []), [{ kind: 'shake-off', buff: null }], PLAYER);

    expect(buffsOf(state, PLAYER)).toEqual([]);
  });

  it('leaves a mark nobody is carrying alone rather than refusing it', () => {
    const { registry, state } = carrying();

    applyResults(newSegment(state, registry, []), [{ kind: 'shake-off', buff: 'marked.hurried' }, { kind: 'shake-off', buff: 'marked.hurried' }], PLAYER);

    expect(buffsOf(state, PLAYER).map((buff) => buff.source)).toEqual(['marked.dazed']);
  });
});
