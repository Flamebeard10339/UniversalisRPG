import { describe, expect, it } from 'vitest';
import type { Answer, Localized } from '../runtime/localized';
import type { JournalEntry } from '../runtime/session';
import { journalRows, rowNamed, TONES } from './journalPanel';

type Entry = JournalEntry;

const entry = (quest: string, standing: Entry['standing'], lines: Array<[string, boolean]> = []): Entry => ({
  quest: quest as Answer,
  title: quest as Localized,
  stage: 'a-stage' as Answer,
  standing,
  lines: lines.map(([said, struck]) => ({ stage: 'a-stage' as Answer, said: said as Localized, struck })),
  hint: standing === 'started' ? ('Go and see.' as Localized) : null,
});

describe('the journal as a page reads it', () => {
  it('lists every quest in the order the world declares them, touched or not', () => {
    const rows = journalRows([entry('third', 'complete'), entry('first', 'unstarted'), entry('second', 'started')]);

    expect(rows.map((row) => row.id)).toEqual(['third', 'first', 'second']);
    expect(rows.map((row) => row.standing)).toEqual(['complete', 'unstarted', 'started']);
  });

  // The subjects are every standing the engine can publish, taken from the rows themselves, so one added later is held to having a colour.
  it('has a colour for every standing a quest can be in', () => {
    const standings = journalRows([entry('a', 'unstarted'), entry('b', 'started'), entry('c', 'complete')]).map((row) => row.standing);

    expect(new Set(Object.keys(TONES))).toEqual(new Set(standings));
    for (const standing of standings) expect(TONES[standing]).toBeTruthy();
  });

  it('carries the lines and which of them are crossed off, and the hint only while there is one', () => {
    const [row] = journalRows([entry('going', 'started', [['done that', true], ['doing this', false]])]);

    expect(row!.lines).toEqual([
      { stage: 'a-stage', said: 'done that', struck: true },
      { stage: 'a-stage', said: 'doing this', struck: false },
    ]);
    expect(row!.hint).toBe('Go and see.');
    expect(journalRows([entry('over', 'complete')])[0]!.hint).toBeNull();
  });

  it('finds the quest a reader opened, and nothing for one that has gone', () => {
    const rows = journalRows([entry('here', 'started')]);

    expect(rowNamed(rows, 'here' as Answer)?.id).toBe('here');
    expect(rowNamed(rows, 'gone' as Answer)).toBeNull();
    expect(rowNamed(rows, null)).toBeNull();
  });
});
