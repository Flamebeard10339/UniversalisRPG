import type { EngineKey } from '../content/locale';
import type { Registry } from '../content/registry';
import { listedToPlayer } from '../content/sections';
import type { ModalOption } from './modalOption';
import { type Answer, type Localized, localizerOf } from './localized';
import type { GameState, ModalFrame } from './state';

export const LEAVE: Answer = 'close';
const LEAVE_SHOWN: EngineKey = 'engine.skill.close';

export type SkillFrame = Extract<ModalFrame, { name: 'skill-breakdown' }>;

export const skillFrame = (skill = ''): SkillFrame => ({ name: 'skill-breakdown', answers: {}, skill });

export const skillFocus = (frame: { skill: string }): { kind: 'skill'; skill: Answer } | undefined =>
  frame.skill === '' ? undefined : { kind: 'skill', skill: frame.skill as Answer };

export function skillOptions(frame: { skill: string }, state: GameState, registry: Registry): readonly ModalOption[] {
  const localizer = localizerOf(registry, state);
  if (frame.skill !== '') return [{ key: LEAVE, label: localizer.engine('engine.skill.reading'), values: [{ value: LEAVE, shown: localizer.engine(LEAVE_SHOWN) }] }];
  const skills = listedToPlayer(registry.skills.values()).map((skill) => ({ value: skill.id as Answer, shown: localizer.title('skill', skill.id) }));
  return [{ key: 'skill', label: localizer.engine('engine.skill.which'), values: [...skills, { value: LEAVE, shown: localizer.engine(LEAVE_SHOWN) }] }];
}

export function skillSubmit(frame: { skill: string; answers: Record<string, unknown> }): ModalFrame | null {
  if (frame.skill !== '') return null;
  const asked = String(frame.answers.skill ?? '');
  return asked === LEAVE || asked === '' ? null : skillFrame(asked);
}

export const sameSkill = (a: { skill: string }, b: { skill: string }): boolean => a.skill === b.skill;

export const holdsSkill = (value: Record<string, unknown>): boolean => typeof value.skill === 'string';

export const skillStale = (frame: { skill: string }, state: GameState, registry: Registry): Localized | null =>
  frame.skill === '' || registry.skills.has(frame.skill) ? null : localizerOf(registry, state).engine('engine.modal.stale.unknown');
