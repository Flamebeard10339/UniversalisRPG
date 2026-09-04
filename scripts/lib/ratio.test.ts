import { describe, expect, it } from 'vitest';
import { skillLevel, xpForLevel } from '../../src/runtime/skills';
import { rateAtLevel } from '../../src/runtime/pace';
import { frontiers, levelOf, levelsIn, meanRate, ratioFor, ratioOf, WITHIN, type Paid } from './ratio';

const paid = (skill: string, use: string, rate: number, at = 'somewhere'): Paid => ({ skill, use, at, rate });

describe('the level a rate is read against', () => {
  it('is the level of the skill that was paid, not the highest the run has reached', () => {
    const levels = levelsIn({ 'combat.attack': xpForLevel(12), 'fishing.fishing': xpForLevel(3) });
    expect(levelOf(levels, 'fishing.fishing')).toBe(3);
    expect(levelOf(levels, 'combat.attack')).toBe(12);
  });

  it('is the level every skill starts on for one nothing has been earned in', () => {
    expect(levelOf(levelsIn({}), 'cooking.cooking')).toBe(skillLevel(0));
  });

  it('asks of the offer exactly what the curve asks at that level', () => {
    const levels = levelsIn({ 'combat.attack': xpForLevel(9) });
    expect(ratioFor('combat.attack', rateAtLevel(9), levels)).toMatchObject({ level: 9, target: rateAtLevel(9) });
    expect(ratioOf(ratioFor('combat.attack', rateAtLevel(9), levels))).toBe(1);
  });
});

describe('an offer speaks for itself with one number across its seeds', () => {
  it('is their mean and not the best of them', () => {
    expect(meanRate([10, 20, 30])).toBe(20);
    expect(meanRate([10])).toBe(10);
    expect(meanRate([])).toBe(0);
  });

  it('does not move when the same offer is sampled more times around the same middle', () => {
    const few = frontiers([paid('a', 'one', meanRate([90, 110]))], {});
    const many = frontiers([paid('a', 'one', meanRate([70, 90, 110, 130]))], {});
    expect(many[0]!.paid).toBe(few[0]!.paid);
  });
});

describe('the frontier, and how crowded it is underneath', () => {
  it('is the best-paying offer for each skill, kept apart from every other skill', () => {
    const found = frontiers([paid('a', 'small', 10), paid('a', 'big', 100), paid('b', 'other', 5)], {});
    expect(found.map((each) => [each.skill, each.best, each.paid])).toEqual([
      ['a', 'big', 100],
      ['b', 'other', 5],
    ]);
  });

  it('counts the frontier itself among what comes within reach of it, and the rest by where they fall', () => {
    const found = frontiers([paid('a', 'best', 100), paid('a', 'half', 50), paid('a', 'just-under', 49.9), paid('a', 'nowhere', 1)], {});
    expect(found[0]).toMatchObject({ within: 2, offers: 4 });
  });

  it('says a level has one thing to do by counting one, which the frontier ruling alone permits', () => {
    const found = frontiers([paid('a', 'best', 1000), paid('a', 'other', 1), paid('a', 'another', 2)], {});
    expect(found[0]!.within).toBe(1);
  });

  it('takes nothing to be within reach that pays less than one over the cut of the best', () => {
    const found = frontiers([paid('a', 'best', 100), paid('a', 'edge', 100 / WITHIN)], {});
    expect(found[0]!.within).toBe(2);
  });

  it('has nothing to say where nothing paid into any skill', () => {
    expect(frontiers([], {})).toEqual([]);
  });
});
