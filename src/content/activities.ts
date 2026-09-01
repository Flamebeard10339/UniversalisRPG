import type { Registry } from './registry';

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

