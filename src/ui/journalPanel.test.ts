import { describe, expect, it } from 'vitest';
import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import { journalRows } from './journalPanel';

const entry = (quest: string, complete: boolean, hint: string | null = 'Go and see.'): PlayView['journal'][number] => ({
  quest: quest as Answer,
  title: quest as Localized,
  stage: 'a-stage' as Answer,
  log: `${quest} stands here.` as Localized,
  hint: hint as Localized | null,
  complete,
});

describe('the journal as a page reads it', () => {
  it("puts what is still being done above what is finished, and keeps the world's order within each", () => {
    const rows = journalRows([entry('first', true), entry('second', false), entry('third', true), entry('fourth', false)]);

    expect(rows.map((row) => row.id)).toEqual(['second', 'fourth', 'first', 'third']);
  });

  // A hint says what to do next, and there is nothing next about a quest that is over.
  it('drops the hint from a finished quest and keeps the line that says how it ended', () => {
    const [done] = journalRows([entry('over', true)]);

    expect(done).toEqual({ id: 'over', title: 'over', log: 'over stands here.', hint: null, done: true });
  });

  it('carries the hint of a quest still going, and says nothing where the author wrote none', () => {
    expect(journalRows([entry('going', false)])[0]!.hint).toBe('Go and see.');
    expect(journalRows([entry('going', false, null)])[0]!.hint).toBeNull();
  });

  it('is empty for an empty journal, which is what a page shows nothing for', () => {
    expect(journalRows([])).toEqual([]);
  });
});
