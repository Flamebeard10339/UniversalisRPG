import { describe, expect, it } from 'vitest';
import { loadUniverse } from '../content/load';
import { fixtureSources } from '../content/worldFixture';
import { midpoint } from '../grammar/range';
import type { TagClause } from '../grammar/tagClause';
import { ladderForStat } from './pace';
import { grantOf, passiveTags, roundedFor } from './passiveGrant';

const registry = loadUniverse(fixtureSources());

const budgeted = () => [...registry.passives.values()].filter((each) => each.grants !== undefined);

const bonusIn = (statId: string, tags: readonly TagClause[]): number | undefined => {
  const found = tags.find((tag) => tag.kind === 'stat-bonus' && tag.statId === statId);
  return found === undefined || found.kind !== 'stat-bonus' || found.percent ? undefined : midpoint(found.amount);
};

describe('what a point of a passive is worth is read off the ladder its stat climbs', () => {
  it('has a budgeted passive to read, or the claims under it are vacuous', () => {
    expect(budgeted().length).toBeGreaterThan(0);
  });

  it('is one level of that ladder divided by the budget, for every passive that names one', () => {
    for (const passive of budgeted()) {
      const ladder = ladderForStat(registry, passive.grants)!;
      const exact = ladder.addedGrowthPerLevel / passive.budget!;
      expect(grantOf(registry, passive)).toBe(roundedFor(registry, passive.grants!, exact));
    }
  });

  it('rounds to the nearest step the stat declares, so a passive moves in fives where the stat says fives', () => {
    const passive = budgeted().find((each) => registry.stats.get(each.grants!)?.roundsTo !== undefined)!;
    expect(passive).toBeDefined();
    const step = registry.stats.get(passive.grants!)!.roundsTo!;
    const exact = ladderForStat(registry, passive.grants)!.addedGrowthPerLevel / passive.budget!;
    expect(exact % step, 'the fixture would round to itself, so this claim would hold vacuously').not.toBe(0);
    expect(grantOf(registry, passive)! % step).toBe(0);
  });

  it('never rounds a worth that is more than nothing away to nothing, bringing it up a step instead', () => {
    const stepped = [...registry.stats.values()].find((each) => each.roundsTo !== undefined)!;
    expect(roundedFor(registry, stepped.id, stepped.roundsTo! / 100)).toBe(stepped.roundsTo);
    expect(roundedFor(registry, stepped.id, 0)).toBe(0);
  });

  it('mints the bonus onto the tags it is read through, so nothing has to read the budget twice', () => {
    for (const passive of budgeted()) {
      expect(bonusIn(passive.grants!, passive.tags)).toBeUndefined();
      expect(bonusIn(passive.grants!, passiveTags(registry, passive))).toBe(grantOf(registry, passive));
    }
  });

  it('says nothing for a passive that names no budget, leaving the tags it was written with', () => {
    for (const passive of registry.passives.values()) {
      if (passive.grants !== undefined) continue;
      expect(grantOf(registry, passive)).toBeUndefined();
      expect(passiveTags(registry, passive)).toBe(passive.tags);
    }
  });

  it('moves every budgeted passive at once when the ladder moves, which is the whole of why it is declared there', () => {
    const steeper = loadUniverse(fixtureSources().map((each) => ({ ...each, text: each.text.replace('added growth per level: 15', 'added growth per level: 30') })));
    for (const passive of budgeted()) {
      const was = grantOf(registry, passive)!;
      const now = grantOf(steeper, steeper.passives.get(passive.id)!)!;
      const ladder = ladderForStat(steeper, passive.grants)!;
      const exact = ladder.addedGrowthPerLevel / passive.budget!;
      expect(now, passive.id).toBe(roundedFor(steeper, passive.grants!, exact));
      expect(now, `${passive.id} did not move with the ladder`).toBeGreaterThan(was);
    }
  });
});
