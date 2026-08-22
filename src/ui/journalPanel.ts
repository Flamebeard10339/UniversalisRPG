import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

// The journal as the engine publishes it. A page reads what the view carries and reaches no further into the runtime than the view.
type JournalEntry = PlayView['journal'][number];

export interface JournalRow {
  id: Answer;
  title: Localized;
  log: Localized | null;
  // What to do next, which a finished quest has none of however its last stage was written.
  hint: Localized | null;
  done: boolean;
}

// What is still being done, then what is finished, each keeping the order the world declared it in. A journal is read from the top for what to do next, so what there is nothing left to do about settles under it.
export const journalRows = (entries: readonly JournalEntry[]): JournalRow[] =>
  [...entries.filter((entry) => !entry.complete), ...entries.filter((entry) => entry.complete)].map((entry) => ({
    id: entry.quest,
    title: entry.title,
    log: entry.log,
    hint: entry.complete ? null : entry.hint,
    done: entry.complete,
  }));
