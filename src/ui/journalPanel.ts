import type { Answer, Localized } from '../runtime/localized';
import type { GroupRow, JournalEntry, JournalLine, QuestStanding } from '../runtime/session';

export interface JournalRow {
  id: Answer;
  title: Localized;
  standing: QuestStanding;
  group?: GroupRow;
  lines: readonly JournalLine[];
}

export const journalRows = (entries: readonly JournalEntry[]): JournalRow[] =>
  entries.map((entry) => ({ id: entry.quest, title: entry.title, standing: entry.standing, ...(entry.group === undefined ? {} : { group: entry.group }), lines: entry.lines }));

export const rowNamed = (rows: readonly JournalRow[], id: Answer | null): JournalRow | null => rows.find((row) => row.id === id) ?? null;
