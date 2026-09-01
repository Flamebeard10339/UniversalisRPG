import { activitiesIn, type Activity } from '../../src/content/activities';
import { xpForLevel } from '../../src/runtime/skills';

export { activitiesIn, type Activity };

export const poolForTier = (activity: Activity, level: number): number => activity.skills.length * xpForLevel(level);

export function activitiesPaidBy(paidInto: Iterable<string>, activities: readonly Activity[]): string[] {
  const skills = new Set(paidInto);
  return activities.filter((activity) => activity.skills.some((skill) => skills.has(skill))).map((activity) => activity.id);
}
