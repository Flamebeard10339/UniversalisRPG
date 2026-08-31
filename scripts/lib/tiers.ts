import type { Registry } from '../../src/content/registry';
import { xpForLevel } from '../../src/runtime/skills';

// An activity is a module that declares skills, and its skills are the ones it declares. Nothing
// says so anywhere but here, and nothing has to: a module added next month is an activity by having
// a `# skill` in it, and one whose skills move between modules moves with them. The alternative --
// a list of activities and what each is made of -- is the one shape this repository has undone most
// often.
export interface Activity {
  id: string;
  skills: string[];
}

const moduleOf = (skillId: string): string => skillId.slice(0, skillId.indexOf('.'));

export function activitiesIn(registry: Registry): Activity[] {
  const by = new Map<string, string[]>();
  for (const id of registry.skills.keys()) {
    const module = moduleOf(id);
    by.set(module, [...(by.get(module) ?? []), id]);
  }
  return [...by].map(([id, skills]) => ({ id, skills: skills.sort() })).sort((one, other) => one.id.localeCompare(other.id));
}

// What a tier at this level has earned, across everything the activity is: one skill's worth of the
// climb for each skill the activity uses. It is a pool and not a split -- the search spends it
// wherever it likes -- so "the best tier-4 combat build ignores health" is a finding rather than
// something ruled out by how the tier was written down.
//
// An activity whose skills grant no stat gets a pool it can do nothing with, which is the honest
// answer rather than a case written here: the search simply never wins by spending there.
export const poolForTier = (activity: Activity, level: number): number => activity.skills.length * xpForLevel(level);

// Which activity an offer belongs to, read off what it actually paid rather than off where it is
// written. An offer paying into two activities belongs to both, and one paying into none belongs to
// nothing -- a door, a bench, a purchase. So the question "which offers is this build for" is
// answered by having run the world, and a mechanic added next month is sorted with no edit here.
export function activitiesPaidBy(paidInto: Iterable<string>, activities: readonly Activity[]): string[] {
  const skills = new Set(paidInto);
  return activities.filter((activity) => activity.skills.some((skill) => skills.has(skill))).map((activity) => activity.id);
}
