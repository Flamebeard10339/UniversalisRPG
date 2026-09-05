import { listedToPlayer } from '../content/sections';
import { listedScreen } from './listedScreen';
import { localizerOf } from './localized';
import type { ModalFrame } from './state';

export type SkillFrame = Extract<ModalFrame, { name: 'skill-breakdown' }>;

export const skillScreen = listedScreen({
  name: 'skill-breakdown',
  field: 'skill',
  which: 'engine.skill.which',
  reading: 'engine.skill.reading',
  close: 'engine.skill.close',
  choices: (registry, state) => {
    const localizer = localizerOf(registry, state);
    return listedToPlayer(registry.skills.values()).map((skill) => ({ value: skill.id, shown: localizer.title('skill', skill.id) }));
  },
  known: (registry, chosen) => registry.skills.has(chosen),
});
