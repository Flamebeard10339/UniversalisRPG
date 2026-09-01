import type { Registry } from './registry';

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

