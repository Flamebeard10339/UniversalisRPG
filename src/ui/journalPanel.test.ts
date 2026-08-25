import { describe, expect, it } from 'vitest';
import type { Answer, Localized } from '../runtime/localized';
import type { JournalEntry } from '../runtime/session';
import { journalRows, rowNamed } from './journalPanel';

type Entry = JournalEntry;

const entry = (quest: string, standing: Entry['standing'], lines: Array<[string, boolean]> = []): Entry => ({
  quest: quest as Answer,
  title: quest as Localized,
  stage: 'a-stage' as Answer,
  standing,
  lines: lines.map(([said, struck]) => ({ stage: 'a-stage' as Answer, said: said as Localized, struck })),
});

describe('the journal as a page reads it', () => {
  it('lists every quest in the order the world declares them, touched or not', () => {
    const rows = journalRows([entry('third', 'complete'), entry('first', 'unstarted'), entry('second', 'started')]);

    expect(rows.map((row) => row.id)).toEqual(['third', 'first', 'second']);
    expect(rows.map((row) => row.standing)).toEqual(['complete', 'unstarted', 'started']);
  });

  it('carries the group the engine coloured the standing with, and holds none of its own', () => {
    const [row] = journalRows([{ ...entry('going', 'started'), group: { id: 'core.quest-started' as Answer, title: 'Under way' as Localized, colour: '#fbbf24' } }]);

    expect(row!.group).toEqual({ id: 'core.quest-started', title: 'Under way', colour: '#fbbf24' });
  });

  it('carries the lines and which of them are crossed off', () => {
    const [row] = journalRows([entry('going', 'started', [['done that', true], ['doing this', false]])]);

    expect(row!.lines).toEqual([
      { stage: 'a-stage', said: 'done that', struck: true },
      { stage: 'a-stage', said: 'doing this', struck: false },
    ]);
  });

  it('finds the quest a reader opened, and nothing for one that has gone', () => {
    const rows = journalRows([entry('here', 'started')]);

    expect(rowNamed(rows, 'here' as Answer)?.id).toBe('here');
    expect(rowNamed(rows, 'gone' as Answer)).toBeNull();
    expect(rowNamed(rows, null)).toBeNull();
  });
});
