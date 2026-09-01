import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../../src/content/load';
import { fixtureSources } from '../../src/content/worldFixture';
import { xpForLevel } from '../../src/runtime/skills';
import { activitiesIn, activitiesPaidBy, poolForTier } from './tiers';

const world = loadUniverseWithDiagnostics(fixtureSources()).registry;

describe('an activity is a module that declares skills', () => {
  // Subjects from the corpus rather than from a list here, so a module added next month is covered
  // by existing.
  it('accounts for every skill the world declares, once', () => {
    const activities = activitiesIn(world);
    expect(activities.flatMap((activity) => activity.skills).sort()).toEqual([...world.skills.keys()].sort());
  });

  it('names each activity for the module that declares it, so a skill and its activity cannot drift', () => {
    for (const activity of activitiesIn(world)) {
      for (const skill of activity.skills) expect(skill.startsWith(`${activity.id}.`)).toBe(true);
    }
  });

  // Not which module is wide — that is a fact about a world and moves as one is written — but that
  // a world is read as having one at all, which is what the pool below is a claim about.
  it('reads a module declaring two skills as one activity of two, and one declaring one as one of one', () => {
    const counts = activitiesIn(world).map((activity) => activity.skills.length).sort();
    expect(counts).toContain(1);
    expect(counts.some((held) => held > 1)).toBe(true);
  });
});

describe('what a tier has earned', () => {
  it('is one skill climb per skill the activity uses, so a two-skill activity costs twice a one-skill one', () => {
    const [wide] = activitiesIn(world).filter((activity) => activity.skills.length > 1);
    const [narrow] = activitiesIn(world).filter((activity) => activity.skills.length === 1);
    expect(poolForTier(wide!, 10)).toBe(2 * xpForLevel(10));
    expect(poolForTier(narrow!, 10)).toBe(xpForLevel(10));
  });

  it('is nothing at the level every skill starts on, because nothing has been climbed', () => {
    for (const activity of activitiesIn(world)) expect(poolForTier(activity, 1)).toBe(0);
  });
});

describe('which activity an offer is for', () => {
  it('is read off what it paid into, so an offer paying two activities is for both', () => {
    const activities = activitiesIn(world);
    // The skills the world declares, taken off it rather than named: a wide activity to pay into
    // twice over, and a second one so paying both reads as both.
    const wide = activities.find((activity) => activity.skills.length > 1)!;
    const narrow = activities.find((activity) => activity.skills.length === 1)!;

    expect(activitiesPaidBy([wide.skills[0]!], activities)).toEqual([wide.id]);
    expect(activitiesPaidBy(wide.skills, activities)).toEqual([wide.id]);
    expect(activitiesPaidBy([wide.skills[0]!, narrow.skills[0]!], activities).sort()).toEqual([wide.id, narrow.id].sort());
  });

  it('is nothing for an offer that paid no experience at all, which a door and a counter both are', () => {
    expect(activitiesPaidBy([], activitiesIn(world))).toEqual([]);
  });
});
