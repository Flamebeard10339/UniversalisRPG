import { describe, expect, it } from 'vitest';
import { Cursor, DslError } from '../grammar/parser';
import { point, range } from '../grammar/range';
import { ActiveAction, createGameState, equip, GameState, grantBuff, hitDamage, initResources, minDamage, PLAYER, sampleStat, statRange, statValue } from './runtime';
import { restorePools } from './effects';
import { IMPLICIT_TARGET_FULL, newCadence } from './encounter';
import { loadModule, Registry } from '../content/registry';
import { tagClause } from '../grammar/tagClause';
import { toMilliUnits } from './units';

// `dummy.strike` carries both a ranged flat bonus and a percent one, so the
// action-tag half of statRange is exercised alongside the buff half.
const MODULE = `
# stat attack
base: 4-7

# stat dr

# stat chop-power
base: 3

# stat spread
base: 0-2

# item trail-ration
food, +2 chop-power, 60s

# item honing-oil
food, +50% chop-power, 60s

# item war-brew
food, +1-2 attack, 60s

# item battle-hymn
food, +100% attack, 60s

# entity dummy
strike:
  time: 1
  +2-3 attack, +10% dr
`;

function loaded(): Registry {
  return loadModule(MODULE);
}

const striking = (): ActiveAction => ({ ownerRef: 'entity.dummy', actionLabel: 'strike', repeating: false, implicitTarget: IMPLICIT_TARGET_FULL, cadences: { [PLAYER]: newCadence() }, roster: { [PLAYER]: { ownerRef: 'entity.dummy', actionLabel: 'strike', target: 'dummy' } } });

function withStrike(): GameState {
  const state = createGameState('nowhere');
  state.activeAction = striking();
  return state;
}

const clause = (source: string) => tagClause.parse(new Cursor(source));

describe('range values in the grammar', () => {
  it('parses a bare number as a point range and a hyphenated pair as an interval', () => {
    expect(range.parse(new Cursor('5'))).toEqual(point(5));
    expect(range.parse(new Cursor('4-7'))).toEqual({ min: 4, max: 7 });
    expect(range.parse(new Cursor('-7--4'))).toEqual({ min: -7, max: -4 });
    expect(range.parse(new Cursor('0.5-1.5'))).toEqual({ min: 0.5, max: 1.5 });
  });

  it('rejects a descending range rather than silently normalizing it', () => {
    expect(() => range.parse(new Cursor('7-4'))).toThrow(DslError);
  });

  it('keeps a stat base as a range instead of collapsing it at authoring time', () => {
    const registry = loaded();
    expect(registry.stats.get('attack')!.base).toEqual({ min: 4, max: 7 });
    expect(registry.stats.get('chop-power')!.base).toEqual(point(3));
    expect(registry.stats.get('dr')!.base).toEqual(point(0));
  });

  it('accepts a ranged flat stat bonus, applying the leading sign to both bounds', () => {
    expect(clause('+3-6 attack')).toEqual({ kind: 'stat-bonus', statId: 'attack', amount: { min: 3, max: 6 }, percent: false });
    expect(clause('-3-6 attack')).toEqual({ kind: 'stat-bonus', statId: 'attack', amount: { min: -6, max: -3 }, percent: false });
  });

  it('rejects a ranged percent bonus and a bonus range that descends in magnitude', () => {
    expect(() => clause('+3-6% attack')).toThrow(/percent stat bonus cannot be a range/);
    expect(() => clause('+6-3 attack')).toThrow(/must ascend in magnitude/);
  });
});

describe('statRange', () => {
  it('leaves an unranged stat exactly where it was: base + added, then × (1 + increased)', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    grantBuff(state, PLAYER, registry.items.get('trail-ration')!, 60);
    grantBuff(state, PLAYER, registry.items.get('honing-oil')!, 60);
    expect(statRange('chop-power', state, registry)).toEqual(point(7.5));
    expect(statValue('chop-power', state, registry)).toBe(7.5);
  });

  it('sums flat bonuses endpoint-wise onto a ranged base, from buffs and the active action alike', () => {
    const registry = loaded();
    const state = withStrike();
    // base 4-7, the action's +2-3, and a +1-2 buff.
    grantBuff(state, PLAYER, registry.items.get('war-brew')!, 60);
    expect(statRange('attack', state, registry)).toEqual({ min: 7, max: 12 });
  });

  it('scales both endpoints by the increased factor', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    grantBuff(state, PLAYER, registry.items.get('battle-hymn')!, 60);
    expect(statRange('attack', state, registry)).toEqual({ min: 8, max: 14 });
  });

  it('makes a percent bonus over no flat bonus do nothing at all', () => {
    const registry = loaded();
    // `dummy.strike` carries +10% dr and nothing adds flat dr: 0 × 1.1 = 0.
    expect(statRange('dr', withStrike(), registry)).toEqual(point(0));
  });

  it('reports the midpoint as the stat value, so nothing deterministic jitters', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    expect(statValue('attack', state, registry)).toBe(5.5);
    expect(state.rng).toBe(createGameState().rng);
  });
});

describe('sampleStat', () => {
  it('consumes no randomness for a stat that is not ranged', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    const before = state.rng;
    expect(sampleStat('chop-power', state, registry)).toBe(3);
    expect(state.rng).toBe(before);
  });

  it('consumes exactly one draw however many ranged sources contribute', () => {
    const registry = loaded();
    // One ranged source versus three stacked: both must cost one RNG step.
    const one = createGameState('nowhere');
    sampleStat('spread', one, registry);

    const many = withStrike();
    grantBuff(many, PLAYER, registry.items.get('war-brew')!, 60);
    sampleStat('attack', many, registry);

    expect(many.rng).toBe(one.rng);
  });

  it('draws uniformly across the whole interval and never outside it', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    const rolls = Array.from({ length: 500 }, () => sampleStat('attack', state, registry));

    expect(Math.min(...rolls)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...rolls)).toBeLessThanOrEqual(7);
    // Loose bounds, so this stays a distribution check and not an LCG restatement.
    expect(rolls.reduce((sum, roll) => sum + roll, 0) / rolls.length).toBeCloseTo(5.5, 1);
    expect(Math.min(...rolls)).toBeLessThan(4.2);
    expect(Math.max(...rolls)).toBeGreaterThan(6.8);
  });

  it('is reproducible from a given rng cursor', () => {
    const registry = loaded();
    const a = createGameState('nowhere');
    const b = createGameState('nowhere');
    expect(sampleStat('attack', a, registry)).toBe(sampleStat('attack', b, registry));
  });
});

describe('hitDamage', () => {
  const registry = loaded();

  it('subtracts damage reduction flat and converts to milli-units without truncating', () => {
    expect(hitDamage(6.9, 2, registry)).toBe(toMilliUnits(4.9));
    expect(hitDamage(7, 0, registry)).toBe(toMilliUnits(7));
  });

  it('floors at the minimum rather than reaching zero, which would make a fight unendable', () => {
    expect(hitDamage(4, 10, registry)).toBe(toMilliUnits(1));
    expect(hitDamage(4, 4, registry)).toBe(toMilliUnits(1));
  });

  it('reads an authored min-damage but never lets it fall below 1', () => {
    expect(minDamage(registry)).toBe(1);
    expect(minDamage(loadModule('# variable min-damage\nvalue: 3'))).toBe(3);
    expect(minDamage(loadModule('# variable min-damage\nvalue: 0'))).toBe(1);
    expect(hitDamage(4, 10, loadModule('# variable min-damage\nvalue: 3'))).toBe(toMilliUnits(3));
  });

  it('when ability is below min-damage, deals the ability value not the floor', () => {
    expect(hitDamage(0.5, 0, registry)).toBe(toMilliUnits(0.5));
  });
});

// A counter-scaled bonus needs a pool to read, which the module above has none
// of. `plain-blade` is the control: the same shape without `per`.
const COUNTER_MODULE = `
# stat attack
base: 4

# stat dr
base: 10

# stat max-fury
base: 10

# resource fury
max: max-fury
start: 0

# item fury-blade
slot: mainhand
+2 attack per fury

# item fury-guard
slot: body
+10% dr per fury

# item plain-blade
slot: head
+2 attack

# entity ogre
swing:
  time: 1
  +5 attack per fury
`;

describe('a stat bonus scaled by a counter', () => {
  function wearing(...itemIds: string[]): { registry: Registry; state: GameState } {
    const registry = loadModule(COUNTER_MODULE);
    const state = createGameState('nowhere');
    initResources(state, registry);
    for (const itemId of itemIds) {
      state.inventory[itemId] = 1;
      equip(state, registry, itemId);
    }
    return { registry, state };
  }

  it('reads a resource level as the count, and leaves a bonus naming no counter alone', () => {
    const { registry, state } = wearing('fury-blade', 'plain-blade');
    expect(statValue('attack', state, registry)).toBe(6);

    restorePools(state, { fury: toMilliUnits(3) });
    expect(statValue('attack', state, registry)).toBe(12);
  });

  it('floors the level before it multiplies, because a counter counts points', () => {
    const { registry, state } = wearing('fury-blade');
    restorePools(state, { fury: toMilliUnits(3.7) });
    expect(statValue('attack', state, registry)).toBe(10);
  });

  it('scales the percent form through the same fold', () => {
    const { registry, state } = wearing('fury-guard');
    expect(statValue('dr', state, registry)).toBe(10);

    restorePools(state, { fury: toMilliUnits(3) });
    expect(statValue('dr', state, registry)).toBe(13);
  });

  it('grants nothing at all where the counter is empty, rather than a flat bonus', () => {
    const { registry, state } = wearing('fury-blade');
    expect(statRange('attack', state, registry)).toEqual(point(4));
  });

  it('reads the counter off the character being evaluated, not off the player', () => {
    const { registry, state } = wearing();
    restorePools(state, { fury: toMilliUnits(3) });
    state.activeAction = {
      ownerRef: 'entity.ogre',
      actionLabel: 'swing',
      repeating: false,
      implicitTarget: IMPLICIT_TARGET_FULL,
      cadences: { ogre: newCadence() },
      roster: { ogre: { ownerRef: 'entity.ogre', actionLabel: 'swing', target: PLAYER } },
      actors: { ogre: { resources: { fury: toMilliUnits(4) }, rateRemainders: {} } },
    };

    // The ogre's own swing carries the bonus and the ogre's own pool is the
    // count: 4 + 5 x 4, and never 4 + 5 x the player's 3.
    expect(statValue('attack', state, registry, 'ogre')).toBe(24);
    expect(statValue('attack', state, registry)).toBe(4);
  });
});
