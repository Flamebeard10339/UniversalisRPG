import type { Answer, Localized } from '../runtime/localized';
// The journal as the engine publishes it. A page reads what the session hands over and reaches no further into the runtime than that.
import type { JournalEntry, JournalLine, QuestStanding } from '../runtime/session';

export interface JournalRow {
  id: Answer;
  title: Localized;
  standing: QuestStanding;
  lines: readonly JournalLine[];
  hint: Localized | null;
}

// White for a quest nobody has touched, yellow for one under way, green for one finished. Every standing the engine publishes has a colour here, and the type says so, so a fourth added later cannot be quietly drawn as nothing.
export const TONES: Record<QuestStanding, string> = {
  unstarted: 'text-text',
  started: 'text-warning',
  complete: 'text-ok',
};

// Every quest, in the order the world declares them. Nothing is sorted or hidden: which are worth reading is what the colours say, and a list that reordered itself as the player played would not be a list they could learn.
export const journalRows = (entries: readonly JournalEntry[]): JournalRow[] =>
  entries.map((entry) => ({ id: entry.quest, title: entry.title, standing: entry.standing, lines: entry.lines, hint: entry.hint }));

export const rowNamed = (rows: readonly JournalRow[], id: Answer | null): JournalRow | null => rows.find((row) => row.id === id) ?? null;
