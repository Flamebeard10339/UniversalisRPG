import { describe, expect, it } from 'vitest';
import { Cursor, DslError } from '../grammar/parser';
import { addRanges, isPoint, midpoint, point, range, type Range, scaleRange } from '../grammar/range';
import { ActiveAction, createGameState, equip, GameState, grantBuff, hitDamage, initResources, minDamage, PLAYER, sampleStat, statRange, statValue } from './runtime';
import { restorePools } from './effects';
import { endAction } from './actionEnd';
import type { Localized } from './localized';

const TEST_REASON = 'because the test said so' as Localized;
import { requiresMet } from './actions';
import { actorEntity, seatedAction } from './actionLookup';
import { xpForLevel } from './skills';
import { performable } from './roster';
import { handOver, HandOver, receiveItem } from './itemInstance';
import { IMPLICIT_TARGET_FULL, newCadence } from './encounter';
import { Registry } from '../content/registry';
import { loadModule, loadUniverse } from '../content/load';
import { loadSave } from './save';
import { statBreakdown, type StatBreakdown } from './stats';
import { fixtureSources } from '../content/worldFixture';
import type { Skill } from '../content/sections/skill';
import { tagClause } from '../grammar/tagClause';
import { toMilliUnits } from './units';

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

const striking = (): ActiveAction => ({ ownerRef: 'entity.dummy', actionSlug: 'strike', repeating: false, implicitTarget: IMPLICIT_TARGET_FULL, cadences: { [PLAYER]: newCadence() }, roster: { [PLAYER]: { ownerRef: 'entity.dummy', actionSlug: 'strike', target: 'dummy' } } });

function withStrike(): GameState {
  const state = createGameState('nowhere');
  state.activeAction = striking();
  return state;
}

const clause = (source: string) => tagClause.parse(new Cursor(source));

function movedByLevels(registry: Registry, skillId: string, level: number): Record<string, number> {
  const state = createGameState('');
  const before = [...registry.stats.keys()].map((statId) => [statId, statValue(statId, state, registry)] as const);
  state.xp[skillId] = xpForLevel(level);
  return Object.fromEntries(
    before.flatMap(([statId, was]) => {
      const by = statValue(statId, state, registry) - was;
      return by === 0 ? [] : [[statId, by] as const];
    }),
  );
}

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
      actionSlug: 'swing',
      repeating: false,
      implicitTarget: IMPLICIT_TARGET_FULL,
      cadences: { ogre: newCadence() },
      roster: { ogre: { ownerRef: 'entity.ogre', actionSlug: 'swing', target: PLAYER } },
      actors: { ogre: { resources: { fury: toMilliUnits(4) }, rateRemainders: {} } },
    };

    expect(statValue('attack', state, registry, 'ogre')).toBe(24);
    expect(statValue('attack', state, registry)).toBe(4);
  });
});

const SEATED_MODULE = `
# stat attack
base: 4

# stat guard
base: 2

# item whetstone

# entity duelist
flags: winded
sharpen:
  requires: has whetstone
  time: 1
  +5 attack
press:
  hidden if: winded
  time: 1
  +3 guard

# entity gambler
surge:
  requires: stat.attack >= 6
  time: 1
  +5 attack
overreach:
  requires: stat.attack >= 20
  time: 1
  +5 attack
`;

describe('the stat fold reads the seat, not offerability', () => {
  function seated(entityId: string, slug: string): { registry: Registry; state: GameState } {
    const registry = loadModule(SEATED_MODULE);
    const state = createGameState('nowhere');
    const ownerRef = `entity.${entityId}`;
    state.activeAction = {
      ownerRef,
      actionSlug: slug,
      repeating: false,
      implicitTarget: IMPLICIT_TARGET_FULL,
      cadences: { [PLAYER]: newCadence() },
      roster: { [PLAYER]: { ownerRef, actionSlug: slug, target: entityId } },
    };
    return { registry, state };
  }

  const inTheSeat = (state: GameState, registry: Registry) => seatedAction(state.activeAction!.roster![PLAYER], registry, PLAYER)!;

  it('keeps a seated action contributing after the item its requires: names has been spent', () => {
    const { registry, state } = seated('duelist', 'sharpen');
    receiveItem(state, registry, 'whetstone', 1);
    expect(statValue('attack', state, registry)).toBe(9);

    handOver(state, HandOver.asked(state, 'whetstone', 1)!);
    expect(performable(inTheSeat(state, registry), state, registry)).toBe(false);
    expect(statValue('attack', state, registry)).toBe(9);
  });

  it('keeps a seated action contributing after its hidden if: has become true', () => {
    const { registry, state } = seated('duelist', 'press');
    expect(statValue('guard', state, registry)).toBe(5);

    state.flags['duelist.winded'] = true;
    expect(performable(inTheSeat(state, registry), state, registry)).toBe(false);
    expect(statValue('guard', state, registry)).toBe(5);
  });

  it('drops the contribution when the cycle ends, so the fold is re-read and not frozen at its first answer', () => {
    const { registry, state } = seated('duelist', 'sharpen');
    receiveItem(state, registry, 'whetstone', 1);
    expect(statValue('attack', state, registry)).toBe(9);

    endAction(state, TEST_REASON);
    expect(statValue('attack', state, registry)).toBe(4);
  });

  it('computes rather than recurses where the seated action requires the stat its own tag grants', () => {
    const { registry, state } = seated('gambler', 'surge');
    expect(statValue('attack', state, registry)).toBe(9);
    expect(requiresMet(inTheSeat(state, registry), state, registry)).toBe(true);
  });

  it('still folds the tag of a seated action whose requires: the stat it grants can never satisfy', () => {
    const { registry, state } = seated('gambler', 'overreach');
    expect(statValue('attack', state, registry)).toBe(9);
    expect(requiresMet(inTheSeat(state, registry), state, registry)).toBe(false);
  });
});

describe('a skill of the shipped player', () => {
  const SHIPPED = loadUniverse(fixtureSources());
  const HELD = (actorEntity(SHIPPED, PLAYER)?.skills ?? []).map((id) => SHIPPED.skills.get(id)!);
  const LEVEL = 9;

  it('is more than one skill against more than a handful of stats, so nothing below is vacuous', () => {
    expect(HELD.length).toBeGreaterThan(1);
    expect(SHIPPED.stats.size).toBeGreaterThan(5);
  });

  it.each(HELD)('$id raises the stat it names and no other stat at all', (skill) => {
    expect(Object.keys(movedByLevels(SHIPPED, skill.id, LEVEL))).toEqual(skill.stat === undefined ? [] : [skill.stat]);
  });

  const NAMED = HELD.filter((skill) => skill.stat !== undefined);

  const impliedBase = (skill: Skill, level: number): number => {
    const state = createGameState('');
    state.xp[skill.id] = xpForLevel(level);
    const alongside = NAMED.filter((other) => other.id !== skill.id && other.stat === skill.stat).length;
    const levels = level + alongside;
    return statValue(skill.stat!, state, SHIPPED) / (1 + levels / 100) - levels;
  };

  it.each(NAMED)('$id raises it by one and by one percent for every level it gains', (skill) => {
    const base = impliedBase(skill, 1);
    for (const level of [2, 9, 20, 45]) expect(impliedBase(skill, level)).toBeCloseTo(base, 6);
  });

  it.each(NAMED)('$id leaves it standing higher at nine than at one, so neither reading above is vacuous', (skill) => {
    const at = (level: number): number => {
      const state = createGameState('');
      state.xp[skill.id] = xpForLevel(level);
      return statValue(skill.stat!, state, SHIPPED);
    };
    expect(at(LEVEL)).toBeGreaterThan(at(1));
  });

  it('shifts both ends of a stat the player swings unevenly, and widens it by nothing', () => {
    const at = (skillId: string, statId: string, level: number): Range => {
      const state = createGameState('');
      state.xp[skillId] = xpForLevel(level);
      return statRange(statId, state, SHIPPED);
    };
    const spread = HELD.filter((skill) => skill.stat !== undefined && !isPoint(statRange(skill.stat, createGameState(''), SHIPPED)));
    expect(spread.length).toBeGreaterThan(0);

    for (const skill of spread) {
      const first = at(skill.id, skill.stat!, 1);
      const raised = at(skill.id, skill.stat!, LEVEL);

      expect(raised.min).toBeGreaterThan(first.min);
      expect(raised.max).toBeGreaterThan(first.max);
      expect(raised.max - raised.min).toBeGreaterThanOrEqual(first.max - first.min);
    }
  });
});

describe('a skill weighed against one that names no stat', () => {
  const REGISTRY = loadModule(['# stat guile', 'base: 2', '', '# skill lockpicking', 'stat: guile', '', '# skill whistling', '', '# entity player', 'skills: lockpicking, whistling'].join('\n'));

  it('raises the stat it names on both channels, from the first level and once more for each after it', () => {
    const at = (level: number): number => (2 + level) * (1 + level / 100);
    expect(statValue('guile', createGameState(''), REGISTRY)).toBeCloseTo(at(1), 6);
    expect(movedByLevels(REGISTRY, 'lockpicking', 4).guile).toBeCloseTo(at(4) - at(1), 6);
  });

  it('raises nothing at any level where it names no stat', () => {
    expect(movedByLevels(REGISTRY, 'whistling', 4)).toEqual({});
    expect(movedByLevels(REGISTRY, 'whistling', 40)).toEqual({});
  });
});

describe('the shares a stat publishes', () => {
  const SHIPPED = loadUniverse(fixtureSources());

  const standing = (): Array<{ save: string; state: GameState }> =>
    [...SHIPPED.saves.entries()].map(([id, saved]) => {
      const state = createGameState('');
      loadSave(state, saved, SHIPPED);
      return { save: id, state };
    });

  const byHand = (breakdown: StatBreakdown): number => {
    let added = breakdown.base;
    let increased = 0;
    for (const part of breakdown.parts) {
      added = addRanges(added, part.added);
      increased += part.increased;
    }
    return midpoint(scaleRange(added, 1 + increased / 100));
  };

  const everyBreakdown = (): Array<{ save: string; stat: string; breakdown: StatBreakdown; state: GameState }> =>
    standing().flatMap(({ save, state }) => [...SHIPPED.stats.keys()].map((stat) => ({ save, stat, state, breakdown: statBreakdown(stat, state, SHIPPED) })));

  it('is asked of a corpus that carries carriers, so nothing below is vacuous', () => {
    const carried = everyBreakdown().filter((each) => each.breakdown.parts.length > 0);
    expect(SHIPPED.saves.size).toBeGreaterThan(2);
    expect(carried.length).toBeGreaterThan(2);
    expect(new Set(carried.flatMap((each) => each.breakdown.parts.map((part) => part.source.kind))).size).toBeGreaterThan(1);
  });

  it('folds back to the number it explains, save for save and stat for stat', () => {
    for (const { save, stat, state, breakdown } of everyBreakdown()) {
      expect(byHand(breakdown), `${save} / ${stat}`).toBe(statValue(stat, state, SHIPPED));
    }
  });

  it('holds no share that leaves the number where it found it', () => {
    for (const { save, stat, breakdown } of everyBreakdown()) {
      for (const part of breakdown.parts) {
        expect(byHand({ ...breakdown, parts: breakdown.parts.filter((each) => each !== part) }), `${save} / ${stat} / ${part.source.id}`).not.toBe(byHand(breakdown));
      }
    }
  });

  it('names one thing once, however many times the player is carrying it', () => {
    for (const { save, stat, breakdown } of everyBreakdown()) {
      const named = breakdown.parts.map((part) => [part.source.kind, part.source.id, part.source.field].join(' '));
      expect(named, `${save} / ${stat}`).toEqual([...new Set(named)]);
    }
  });
});
