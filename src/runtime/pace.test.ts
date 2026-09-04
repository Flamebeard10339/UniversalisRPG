import { describe, expect, it } from 'vitest';
import { loadModule, loadUniverse } from '../content/load';
import { midpoint, point, scaleRange } from '../grammar/range';
import { FIXTURE_WORLD, fixtureSources } from '../content/worldFixture';
import { xpForLevel } from './skills';
import { abilityAtLevelIn, abilityOn, addedOn, increasedOn, climbsDps, dpsLadder, GROWTH_CEILING, ladderFor, ladderForStat, minutesOn, minutesToReachOn, rateOn, secondsToFellAnEvenMatch, toughnessLadder } from './pace';

const registry = loadUniverse(fixtureSources());

const ladders = () => [...registry.ladders.values()];

const costOfLevel = (level: number): number => xpForLevel(level + 1) - xpForLevel(level);

describe('what the world declares a ladder of', () => {
  it('has a ladder of each shape to read, or the claims under it are vacuous', () => {
    expect(ladders().length).toBeGreaterThan(1);
    expect(ladders().filter((each) => each.secondsToFellAnEvenMatch !== undefined)).toHaveLength(1);
    expect(ladders().some((each) => each.secondsToFellAnEvenMatch === undefined)).toBe(true);
  });

  it('names the toughness line by the one ladder that says how long a pool takes to empty', () => {
    expect(toughnessLadder(registry)).toBe(ladders().find((each) => each.secondsToFellAnEvenMatch !== undefined));
    expect(secondsToFellAnEvenMatch(registry)).toBe(toughnessLadder(registry)?.secondsToFellAnEvenMatch);
  });

  it('says nothing about a stat no ladder is declared for, rather than falling back on another stat\'s line', () => {
    const unladdered = [...registry.stats.values()].filter((stat) => !registry.ladders.has(stat.id) && stat.deals === undefined);
    expect(unladdered.length).toBeGreaterThan(0);
    for (const stat of unladdered) {
      expect(ladderFor(registry, stat.id)).toBeUndefined();
      expect(abilityAtLevelIn(registry, 10, stat.id)).toBeUndefined();
    }
  });

  it('stands a world that declares no ladder at all up anyway, saying nothing about any of it', () => {
    const bare = loadModule(FIXTURE_WORLD);
    expect(bare.ladders.size).toBe(0);
    expect(toughnessLadder(bare)).toBeUndefined();
    expect(dpsLadder(bare)).toBeUndefined();
    for (const stat of bare.stats.values()) expect(abilityAtLevelIn(bare, 10, stat.id)).toBeUndefined();
  });
});

describe('the pace a level is meant to take', () => {
  it('grows no faster than the cost of a level does, which is the whole of what keeps the target reachable', () => {
    for (const ladder of ladders()) {
      expect(ladder.minutesGrowthPerLevel).toBeLessThanOrEqual(GROWTH_CEILING);
      for (let level = 1; level < 100; level += 1) {
        expect(minutesOn(ladder, level + 1) / minutesOn(ladder, level)).toBeLessThanOrEqual(costOfLevel(level + 1) / costOfLevel(level));
      }
    }
  });

  it('asks a target that never falls, because a stronger character never earns less at the same offer', () => {
    for (const ladder of ladders()) {
      for (let level = 1; level < 100; level += 1) expect(rateOn(ladder, level + 1)).toBeGreaterThanOrEqual(rateOn(ladder, level));
    }
  });

  it('leaves the first level where the ladder it belongs to puts it', () => {
    for (const ladder of ladders()) {
      expect(minutesOn(ladder, 1)).toBe(ladder.minutesAtLevelOne);
      expect(rateOn(ladder, 1)).toBeCloseTo((costOfLevel(1) * 60) / ladder.minutesAtLevelOne, 6);
    }
  });

  it('reaches a level by the sum of every level before it, and level one by nothing at all', () => {
    for (const ladder of ladders()) {
      expect(minutesToReachOn(ladder, 1)).toBe(0);
      expect(minutesToReachOn(ladder, 2)).toBe(minutesOn(ladder, 1));
      expect(minutesToReachOn(ladder, 5)).toBeCloseTo(minutesOn(ladder, 1) + minutesOn(ladder, 2) + minutesOn(ladder, 3) + minutesOn(ladder, 4), 9);
    }
  });

  it('asks for exactly the level cost over the level time, so a re-tune of either moves it', () => {
    for (const ladder of ladders()) {
      for (const level of [1, 9, 30, 70]) expect(rateOn(ladder, level)).toBeCloseTo((costOfLevel(level) * 60) / minutesOn(ladder, level), 6);
    }
  });
});

describe('the ability a level is assumed to stand at', () => {
  it('never falls, because a character does not get weaker for having levelled', () => {
    for (const ladder of ladders()) {
      for (let level = 1; level < 100; level += 1) expect(abilityOn(ladder, level + 1)).toBeGreaterThanOrEqual(abilityOn(ladder, level));
    }
  });

  it('stands the first level on what its own ladder declares, both halves of it', () => {
    for (const ladder of ladders()) {
      expect(addedOn(ladder, 1)).toBe(ladder.addedAtLevelOne);
      expect(increasedOn(ladder, 1)).toBe(ladder.increasedAtLevelOne);
      expect(abilityOn(ladder, 1)).toBeCloseTo(ladder.addedAtLevelOne * (1 + ladder.increasedAtLevelOne / 100), 9);
    }
  });

  it('puts exactly one growth between one level and the next on each half, whatever their product does', () => {
    for (const ladder of ladders()) {
      for (let level = 1; level < 100; level += 1) {
        expect(addedOn(ladder, level + 1) - addedOn(ladder, level)).toBeCloseTo(ladder.addedGrowthPerLevel, 9);
        expect(increasedOn(ladder, level + 1) - increasedOn(ladder, level)).toBeCloseTo(ladder.increasedGrowthPerLevel, 9);
      }
    }
  });

  it('asks what the engine would work out for a character standing there, which is the whole reason there are two halves', () => {
    for (const ladder of ladders()) {
      for (const level of [1, 10, 30]) {
        expect(abilityOn(ladder, level)).toBeCloseTo(midpoint(scaleRange(point(addedOn(ladder, level)), 1 + increasedOn(ladder, level) / 100)), 9);
      }
    }
  });

  it('climbs on both halves in the world it ships, or the claim above holds by one of them being nothing', () => {
    const both = ladders().filter((each) => each.addedGrowthPerLevel !== 0 && each.increasedGrowthPerLevel !== 0);
    expect(both.length).toBeGreaterThan(0);
  });

  it('would tell two declared ladders apart at every rung, so a declaration that moves is a reading that moves', () => {
    const [one, other] = ladders();
    for (let level = 2; level < 100; level += 1) expect(abilityOn(one!, level)).not.toBeCloseTo(abilityOn(other!, level), 6);
  });
});

describe('a stat that deals a damage type climbs a ladder of damage a second, not of damage a blow', () => {
  const deals = (): string[] => [...registry.stats.values()].filter((stat) => stat.deals !== undefined).map((stat) => stat.id);
  const dealsNothing = (): string[] => [...registry.stats.values()].filter((stat) => stat.deals === undefined).map((stat) => stat.id);

  it('has something of each kind to read, or the claims under it are vacuous', () => {
    expect(deals().length).toBeGreaterThan(0);
    expect(dealsNothing().length).toBeGreaterThan(0);
  });

  it('reads every dealing stat off the damage line, whichever type it deals, under its own name', () => {
    const pool = toughnessLadder(registry)!;
    for (const statId of deals()) {
      expect(climbsDps(registry, statId)).toBe(true);
      expect(registry.ladders.has(statId)).toBe(false);
      const line = ladderForStat(registry, statId)!;
      expect(line).toEqual(dpsLadder(registry, statId));
      expect(line.id, 'a derived line answers to the stat it is for, not to the pool it came off').toBe(statId);
      expect(line.secondsToFellAnEvenMatch, 'the seconds belong to the pool line and are stale on a copy of it').toBeUndefined();
      expect(line.addedGrowthPerLevel * pool.secondsToFellAnEvenMatch!).toBeCloseTo(pool.addedGrowthPerLevel, 9);
    }
  });

  it('lets a stat that declares its own ladder keep it, dealing or not, so a declaration is never quietly ignored', () => {
    const dealt = deals()[0]!;
    const bare = dealt.slice(dealt.indexOf('.') + 1);
    const was = `# stat ${bare}`;
    const line = ['', `# ladder ${bare}`, 'added at level one: 3', 'added growth per level: 9', 'minutes at level one: 5', 'minutes growth per level: 1.07', ''].join('\n');
    const declared = loadUniverse(fixtureSources().map((each) => ({ ...each, text: each.text.replace(was, `${line}${was}`) })));
    expect(declared.ladders.has(dealt), 'the fixture did not take the declaration, so this claim proves nothing').toBe(true);
    expect(ladderForStat(declared, dealt)).toBe(declared.ladders.get(dealt));
    expect(ladderForStat(declared, dealt)!.addedGrowthPerLevel).toBe(9);
  });

  it('reads every stat that deals nothing off the line its own id names', () => {
    for (const statId of dealsNothing()) expect(ladderForStat(registry, statId)).toBe(ladderFor(registry, statId));
  });

  it('asks the damage a second that empties an even match in the seconds the toughness line names, at every rung', () => {
    const pool = toughnessLadder(registry)!;
    const seconds = secondsToFellAnEvenMatch(registry)!;
    for (let level = 1; level < 100; level += 1) {
      for (const statId of deals()) {
        expect(abilityAtLevelIn(registry, level, statId)! * seconds).toBeCloseTo(abilityOn(pool, level), 9);
      }
    }
  });
});
