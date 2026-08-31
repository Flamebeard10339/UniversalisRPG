import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../../src/content/load';
import { shippedSources } from '../../src/content/shipped';
import { xpForLevel } from '../../src/runtime/skills';
import { activitiesIn, activitiesPaidBy, poolForTier } from './tiers';

const shipped = loadUniverseWithDiagnostics(shippedSources()).registry;

describe('an activity is a module that declares skills', () => {
  // Subjects from the corpus rather than from a list here, so a module added next month is covered
  // by existing.
  it('accounts for every skill the world declares, once', () => {
    const activities = activitiesIn(shipped);
    expect(activities.flatMap((activity) => activity.skills).sort()).toEqual([...shipped.skills.keys()].sort());
  });

  it('names each activity for the module that declares it, so a skill and its activity cannot drift', () => {
    for (const activity of activitiesIn(shipped)) {
      for (const skill of activity.skills) expect(skill.startsWith(`${activity.id}.`)).toBe(true);
    }
  });

  it('reads combat as the one activity of more than one skill, which is what makes its tier cost more', () => {
    const wide = activitiesIn(shipped).filter((activity) => activity.skills.length > 1);
    expect(wide.map((activity) => activity.id)).toEqual(['combat']);
  });
});

describe('what a tier has earned', () => {
  it('is one skill climb per skill the activity uses, so a two-skill activity costs twice a one-skill one', () => {
    const [wide] = activitiesIn(shipped).filter((activity) => activity.skills.length > 1);
    const [narrow] = activitiesIn(shipped).filter((activity) => activity.skills.length === 1);
    expect(poolForTier(wide!, 10)).toBe(2 * xpForLevel(10));
    expect(poolForTier(narrow!, 10)).toBe(xpForLevel(10));
  });

  it('is nothing at the level every skill starts on, because nothing has been climbed', () => {
    for (const activity of activitiesIn(shipped)) expect(poolForTier(activity, 1)).toBe(0);
  });
});

describe('which activity an offer is for', () => {
  it('is read off what it paid into, so an offer paying two activities is for both', () => {
    const activities = activitiesIn(shipped);
    expect(activitiesPaidBy(['combat.attack'], activities)).toEqual(['combat']);
    expect(activitiesPaidBy(['combat.attack', 'combat.health'], activities)).toEqual(['combat']);
    expect(activitiesPaidBy(['combat.attack', 'fishing.fishing'], activities).sort()).toEqual(['combat', 'fishing']);
  });

  it('is nothing for an offer that paid no experience at all, which a door and a counter both are', () => {
    expect(activitiesPaidBy([], activitiesIn(shipped))).toEqual([]);
  });
});
