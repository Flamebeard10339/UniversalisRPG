import { activitiesIn, type Activity } from '../../src/content/activities';
import { xpForLevel } from '../../src/runtime/skills';

export { activitiesIn, type Activity };

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
