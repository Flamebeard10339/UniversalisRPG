import type { EngineKey } from '../content/locale';
import type { Registry } from '../content/registry';
import type { ModalOption } from './modalOption';
import { journal } from './journal';
import { type Answer, localizerOf } from './localized';
import type { GameState, ModalFrame } from './state';

export const LEAVE: Answer = 'close';
const LEAVE_SHOWN: EngineKey = 'engine.journal.close';

export type QuestFrame = Extract<ModalFrame, { name: 'quest-journal' }>;

export const questFrame = (quest = ''): QuestFrame => ({ name: 'quest-journal', answers: {}, quest });

export const questFocus = (frame: { quest: string }): { kind: 'quest'; quest: Answer } | undefined => (frame.quest === '' ? undefined : { kind: 'quest', quest: frame.quest as Answer });

export function questOptions(frame: { quest: string }, state: GameState, registry: Registry): readonly ModalOption[] {
  const localizer = localizerOf(registry, state);
  if (frame.quest !== '') return [{ key: LEAVE, label: localizer.engine('engine.journal.reading'), values: [{ value: LEAVE, shown: localizer.engine(LEAVE_SHOWN) }] }];
  const quests = journal(registry, state).map((entry) => ({ value: entry.quest, shown: entry.title }));
  return [{ key: 'quest', label: localizer.engine('engine.journal.which'), values: [...quests, { value: LEAVE, shown: localizer.engine(LEAVE_SHOWN) }] }];
}

export function questSubmit(frame: { quest: string; answers: Record<string, unknown> }): ModalFrame | null {
  if (frame.quest !== '') return null;
  const asked = String(frame.answers.quest ?? '');
  return asked === LEAVE || asked === '' ? null : questFrame(asked);
}

export const sameQuest = (a: { quest: string }, b: { quest: string }): boolean => a.quest === b.quest;

export const holdsQuest = (value: Record<string, unknown>): boolean => typeof value.quest === 'string';
