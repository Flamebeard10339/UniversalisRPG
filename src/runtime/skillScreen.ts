import { listedToPlayer } from '../content/sections';
import { listedScreen } from './listedScreen';
import { localizerOf } from './localized';
import type { ModalFrame } from './state';

export type SkillFrame = Extract<ModalFrame, { name: 'skill-breakdown' }>;

const screen = listedScreen({
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

export const skillFrame = screen.frame;
export const skillFocus = screen.focus;
export const skillOptions = screen.options;
export const skillSubmit = screen.submit;
export const sameSkill = screen.same;
export const holdsSkill = screen.holds;
export const skillStale = screen.stale;
