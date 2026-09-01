import { activitiesIn } from '../content/activities';
import type { Registry } from '../content/registry';
import { skillLevel } from './skills';
import { createGameState } from './state';
import { loadSave } from './save';
import { itemInstance, itemLevel, itemTemplate } from './itemInstance';
import { pointsSpent } from './clusterPlane';
import { wearable } from './equipment';

// A reference build: a `# save` written to stand for what a character of a given activity looks like
// at a given tier, which `npm run tier-build` writes and a balance pass measures against. The name
// is the corpus's convention rather than the engine's — `tiers.dsl` files them this way — and it is
// read here rather than declared anywhere, so a world that files none has none of these.
//
// A trailing word names what the pool was grown toward rather than a second activity:
// `combat-tier-20-sustain` is the combat tier at twenty that bought recovery instead of a bigger
// swing, so it is read off and dropped.
const TIER = /^(?:.+\.)?(.+)-tier-(\d+)(?:-[a-z]+)?$/;

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

// The three ways a stored build goes stale while the file on disk reads exactly as it did: the curve
// under it moved, so it no longer stands where it says; a slot it left empty is one it is already
// carrying something for; or it wears a thing with the whole of its plane untouched, which is a
// character at a fraction of what its own gear allows and a rate measured for somebody who never
// spent a point.
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
