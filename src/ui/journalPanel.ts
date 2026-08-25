import type { Answer, Localized } from '../runtime/localized';
// The journal as the engine publishes it. A page reads what the session hands over and reaches no further into the runtime than that.
import type { GroupRow, JournalEntry, JournalLine, QuestStanding } from '../runtime/session';

export interface JournalRow {
  id: Answer;
  title: Localized;
  standing: QuestStanding;
  group?: GroupRow;
  lines: readonly JournalLine[];
}

// Every quest, in the order the world declares them. Nothing is sorted or hidden: which are worth reading is what the colours say, and a list that reordered itself as the player played would not be a list they could learn.
export const journalRows = (entries: readonly JournalEntry[]): JournalRow[] =>
  entries.map((entry) => ({ id: entry.quest, title: entry.title, standing: entry.standing, ...(entry.group === undefined ? {} : { group: entry.group }), lines: entry.lines }));

export const rowNamed = (rows: readonly JournalRow[], id: Answer | null): JournalRow | null => rows.find((row) => row.id === id) ?? null;
