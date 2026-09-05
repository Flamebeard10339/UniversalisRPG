import { journal } from './journal';
import { listedScreen } from './listedScreen';
import type { ModalFrame } from './state';

export type QuestFrame = Extract<ModalFrame, { name: 'quest-journal' }>;

const screen = listedScreen({
  name: 'quest-journal',
  field: 'quest',
  which: 'engine.journal.which',
  reading: 'engine.journal.reading',
  close: 'engine.journal.close',
  choices: (registry, state) => journal(registry, state).map((entry) => ({ value: entry.quest, shown: entry.title })),
  known: (registry, chosen) => registry.quests.has(chosen),
});

export const questFrame = screen.frame;
export const questFocus = screen.focus;
export const questOptions = screen.options;
export const questSubmit = screen.submit;
export const sameQuest = screen.same;
export const holdsQuest = screen.holds;
export const questStale = screen.stale;
