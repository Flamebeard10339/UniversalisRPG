import type { EngineKey } from '../content/locale';
import type { Registry } from '../content/registry';
import type { ModalOption } from './modalOption';
import { journal } from './journal';
import { type Answer, localizerOf } from './localized';
import type { GameState, ModalFrame } from './state';

export const LEAVE: Answer = 'close';
const LEAVE_SHOWN: EngineKey = 'engine.journal.close';

export const questFrame = (quest = ''): ModalFrame => ({ name: 'quest-journal', answers: {}, quest });

// Which quest the open journal is reading, where it is reading one. The list itself reads none, and publishes nothing for a page to draw beside it.
export const questFocus = (frame: { quest: string }): { kind: 'quest'; quest: Answer } | undefined => (frame.quest === '' ? undefined : { kind: 'quest', quest: frame.quest as Answer });

// The journal opened on nothing asks which quest; opened on one it asks only to be closed, and what it is showing is published on the view for a page to draw.
export function questOptions(frame: { quest: string }, state: GameState, registry: Registry): readonly ModalOption[] {
  const localizer = localizerOf(registry, state);
  if (frame.quest !== '') return [{ key: LEAVE, label: localizer.engine('engine.journal.reading'), values: [{ value: LEAVE, shown: localizer.engine(LEAVE_SHOWN) }] }];
  return [{ key: 'quest', label: localizer.engine('engine.journal.which'), values: journal(registry, state).map((entry) => ({ value: entry.quest, shown: entry.title })) }];
}

export const questSubmit = (frame: { quest: string; answers: Record<string, unknown> }): ModalFrame | null => (frame.quest === '' ? questFrame(String(frame.answers.quest ?? '')) : null);

export const sameQuest = (a: { quest: string }, b: { quest: string }): boolean => a.quest === b.quest;

export const holdsQuest = (value: Record<string, unknown>): boolean => typeof value.quest === 'string';
