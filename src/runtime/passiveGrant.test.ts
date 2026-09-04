import { describe, expect, it } from 'vitest';
import { loadUniverse } from '../content/load';
import { fixtureSources } from '../content/worldFixture';
import { midpoint } from '../grammar/range';
import type { TagClause } from '../grammar/tagClause';
import { addedOn, increasedOn, ladderForStat } from './pace';
import { grantsOf, passiveTags, roundedFor, worthOf } from './passiveGrant';

const registry = loadUniverse(fixtureSources());

const granting = () => [...registry.passives.values()].filter((each) => grantsOf(each).length > 0);

const bonusIn = (statId: string, percent: boolean, tags: readonly TagClause[]): number | undefined => {
  const found = tags.find((tag) => tag.kind === 'stat-bonus' && tag.statId === statId && tag.percent === percent);
  if (found === undefined || found.kind !== 'stat-bonus') return undefined;
  return found.percent ? found.amount : midpoint(found.amount);
};

describe('a passive says what it is worth as a multiple of a level, and the engine writes the number', () => {
  it('has a granting passive to read, or the claims under it are vacuous', () => {
    expect(granting().length).toBeGreaterThan(0);
  });

  it('is that multiple of what one level is worth on the half of the ladder the grant names', () => {
    for (const passive of granting()) {
      for (const grant of grantsOf(passive)) {
        const ladder = ladderForStat(registry, grant.statId)!;
        const exact = grant.times * (grant.axis === 'increased' ? ladder.increasedGrowthPerLevel : ladder.addedGrowthPerLevel);
        expect(worthOf(registry, grant), `${passive.id} ${grant.statId}`).toBe(grant.axis === 'increased' ? exact : roundedFor(registry, grant.statId, exact));
      }
    }
  });

  it('lands an added grant as a flat bonus and an increased one as a percent, which is how the engine tells them apart', () => {
    for (const passive of granting()) {
      for (const grant of grantsOf(passive)) {
        expect(bonusIn(grant.statId, grant.axis === 'increased', passiveTags(registry, passive))).toBe(worthOf(registry, grant));
      }
    }
  });

  it('rounds an added grant to the step its stat declares, and leaves a percent alone, a percent being no quantity of the stat', () => {
    const stepped = [...registry.stats.values()].find((each) => each.roundsTo !== undefined)!;
    const step = stepped.roundsTo!;
    expect(roundedFor(registry, stepped.id, step * 1.4)).toBe(step);
    expect(roundedFor(registry, stepped.id, step * 1.6)).toBe(step * 2);
    expect(worthOf(registry, { times: 1, axis: 'increased', statId: stepped.id })).toBe(ladderForStat(registry, stepped.id)!.increasedGrowthPerLevel);
  });

  it('never rounds a worth away to nothing in either direction, bringing it up to a step instead', () => {
    const stepped = [...registry.stats.values()].find((each) => each.roundsTo !== undefined)!;
    expect(roundedFor(registry, stepped.id, stepped.roundsTo! / 100)).toBe(stepped.roundsTo);
    expect(roundedFor(registry, stepped.id, -stepped.roundsTo! / 100)).toBe(-stepped.roundsTo!);
    expect(roundedFor(registry, stepped.id, 0)).toBe(0);
  });

  it('leaves a passive that grants nothing relative with exactly the tags it was written with', () => {
    for (const passive of registry.passives.values()) {
      if (grantsOf(passive).length > 0) continue;
      expect(passiveTags(registry, passive)).toBe(passive.tags);
    }
  });

  it('moves every granting passive at once when the ladder moves, which is the whole of why it is declared there', () => {
    const steeper = loadUniverse(fixtureSources().map((each) => ({ ...each, text: each.text.replace('added growth per level: 15', 'added growth per level: 30') })));
    for (const passive of granting()) {
      for (const grant of grantsOf(passive)) {
        if (grant.axis === 'increased' || ladderForStat(registry, grant.statId)!.addedGrowthPerLevel !== 15) continue;
        expect(worthOf(steeper, grant), passive.id).toBe(worthOf(registry, grant)! * 2);
      }
    }
  });

  it('reads the ladder the same way the engine reads a character, so a grant is a share of a real rung', () => {
    for (const ladder of registry.ladders.values()) {
      for (const level of [1, 10, 30]) {
        expect(addedOn(ladder, level)).toBeCloseTo(ladder.addedAtLevelOne + ladder.addedGrowthPerLevel * (level - 1), 9);
        expect(increasedOn(ladder, level)).toBeCloseTo(ladder.increasedAtLevelOne + ladder.increasedGrowthPerLevel * (level - 1), 9);
      }
    }
  });
});
