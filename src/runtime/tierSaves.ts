import { activitiesIn } from '../content/activities';
import type { Registry } from '../content/registry';
import { skillLevel } from './skills';
import { createGameState } from './state';
import { loadSave } from './save';
import { itemInstance, itemLevel, itemTemplate } from './itemInstance';
import { pointsSpent } from './clusterPlane';
import { wearable } from './equipment';

const TIER = /^(?:.+\.)?(.+)-tier-(\d+)$/;

export const tierSaveId = (activity: string, level: number): string => `${activity}-tier-${String(level)}`;

export interface TierSave {
  id: string;
  activity: string;
  level: number;
}

export const tierSavesIn = (registry: Registry): TierSave[] =>
  [...registry.saves.keys()].flatMap((id) => {
    const found = TIER.exec(id);
    return found ? [{ id, activity: found[1]!, level: Number(found[2]) }] : [];
  });

export interface StaleTier {
  save: string;
  says: string;
}

export function staleTiers(registry: Registry): StaleTier[] {
  const held = new Map(activitiesIn(registry).map((each) => [each.id, each.skills]));
  return tierSavesIn(registry).flatMap(({ id, activity, level }) => {
    const skills = held.get(activity);
    if (skills === undefined) return [{ save: id, says: `is filed as a tier of ${activity}, and no module declares a skill under that name.` }];
    const state = createGameState();
    loadSave(state, registry.saves.get(id)!, registry);

    const short = skills.flatMap((skill) => {
      const stands = skillLevel(state.xp[skill] ?? 0);
      return stands === level ? [] : [`stands ${stands} in ${skill} and says ${level}`];
    });
    const idle = Object.keys(state.inventory).flatMap((carried) => {
      const slot = registry.items.get(carried)?.slot;
      return slot === undefined || state.equipped[slot] !== undefined || !wearable(state, registry, carried) ? [] : [`could wear ${carried} in the empty ${slot}`];
    });
    const unspent = Object.values(state.equipped).flatMap((worn) => {
      const payload = itemInstance(state, worn);
      const item = registry.items.get(itemTemplate(state, worn));
      if (!payload || !item || itemLevel(payload, item) === 0 || pointsSpent(payload.plane) > 0) return [];
      return [`wears ${itemTemplate(state, worn)} with nothing spent on its plane`];
    });

    const wrong = [...short, ...idle, ...unspent];
    return wrong.length === 0 ? [] : [{ save: id, says: `${wrong.join('; ')}. Write it again with \`npm run tier-build\`.` }];
  });
}
