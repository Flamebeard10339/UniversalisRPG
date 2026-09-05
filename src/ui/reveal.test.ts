import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { startSession, view, type SettingRow } from '../runtime/session';
import { arriving, BEAT_LINES_KEPT, cutTo, landed, lettersIn, opensOn, OPENS, pressed, revealing, spokenUnder, typedOn, type Reading } from './reveal';
import { fixtureSources } from '../content/worldFixture';

const ROWS: readonly SettingRow[] = view(startSession(loadUniverseWithDiagnostics(fixtureSources()).registry)).settings;

const standingAt = (row: SettingRow, written: string): readonly SettingRow[] => [{ ...row, standing: written }];

const TURNS_IT_ON = ROWS.filter((row) => row.choices.some((choice) => revealing(standingAt(row, choice.written))));

describe('the pace a beat is read at', () => {
  it('is one of the preferences the run is played by, and only one of them', () => {
    expect(ROWS.length, 'the shipped session publishes no settings at all').toBeGreaterThan(0);
    expect(TURNS_IT_ON.map((row) => row.name), 'no setting the engine publishes turns a pace on').toHaveLength(1);
  });

  it('stands at exactly one of the words that setting offers, so a word it stopped offering is caught', () => {
    const row = TURNS_IT_ON[0];

    expect(row.choices.filter((choice) => revealing(standingAt(row, choice.written))), row.name).toHaveLength(1);
  });

  it('reads a pace off that setting alone, and off no other preference the run is played by', () => {
    for (const row of ROWS) {
      if (row === TURNS_IT_ON[0]) continue;
      for (const choice of row.choices) expect(revealing(standingAt(row, choice.written)), `${row.name} ${choice.written}`).toBe(false);
    }
  });

  it('reads no pace where the setting is not published, so a page handed no rows lands its beat whole', () => {
    const lines = ['first', 'second'];

    expect(revealing([])).toBe(false);
    expect(arriving(lines, OPENS, revealing([])).shown).toEqual(lines);
  });
});

const PAIR = '𐐷';

describe('how much of a line has arrived', () => {
  it('counts and cuts by character, never by code unit', () => {
    expect(PAIR.length).toBe(2);
    expect(lettersIn(`${PAIR}${PAIR}`)).toBe(2);
    expect(cutTo(`${PAIR}${PAIR}`, 1)).toBe(PAIR);
  });

  it('cuts nothing away at the whole length, and hands back nothing at all before the first', () => {
    expect(cutTo('a word', lettersIn('a word'))).toBe('a word');
    expect(cutTo('a word', 0)).toBe('');
    expect(cutTo('a word', -3)).toBe('');
  });

  it('never hands back more of a line than there is, however long it is asked to go on', () => {
    expect(cutTo('ab', 40)).toBe('ab');
  });
});

const TWO = ['first line', 'second line'];

describe('a beat read at a pace', () => {
  it('opens on the first line with none of it arrived, and says the clock is what it waits on', () => {
    expect(arriving(TWO, OPENS, true)).toEqual({ shown: [''], typing: true, awaits: false });
  });

  it('shows the line it is on cut to where the typing has got, and nothing of the lines behind it', () => {
    expect(arriving(TWO, { at: 0, typed: 5 }, true).shown).toEqual(['first']);
  });

  it('waits on the player once the line is whole, and says so rather than saying it is still typing', () => {
    const read = arriving(TWO, landed(TWO, OPENS), true);

    expect(read.shown).toEqual(['first line']);
    expect(read.typing).toBe(false);
    expect(read.awaits).toBe(true);
  });

  it('keeps the lines already read whole above the one arriving', () => {
    expect(arriving(TWO, { at: 1, typed: 6 }, true).shown).toEqual(['first line', 'second']);
  });

  it('waits on nothing once the last line is whole, so a beat that is over asks for nothing', () => {
    const read = arriving(TWO, landed(TWO, { at: 1, typed: 0 }), true);

    expect(read.typing).toBe(false);
    expect(read.awaits).toBe(false);
  });

  it('lands whole and waits for nothing when the run is not read at a pace', () => {
    expect(arriving(TWO, OPENS, false)).toEqual({ shown: TWO, typing: false, awaits: false });
  });

  it('asks for nothing at all where there is nothing to say', () => {
    expect(arriving([], OPENS, true)).toEqual({ shown: [], typing: false, awaits: false });
  });

  it('draws the last line there is rather than nothing, if it is asked about a line past the end', () => {
    expect(arriving(TWO, { at: 9, typed: 99 }, true).shown).toEqual(['first line', 'second line']);
  });
});

describe('what carries a beat on', () => {
  const wound = (lines: readonly string[], from: Reading, times: number): Reading => {
    let reading = from;
    for (let each = 0; each < times; each += 1) reading = typedOn(lines, reading);
    return reading;
  };

  it('adds one character to the line arriving, and stops adding once it is whole', () => {
    expect(typedOn(TWO, OPENS)).toEqual({ at: 0, typed: 1 });
    expect(wound(TWO, OPENS, lettersIn(TWO[0]) + 20)).toEqual({ at: 0, typed: lettersIn(TWO[0]) });
  });

  it('never moves to the next line on its own, which is what an acknowledgement is for', () => {
    expect(wound(TWO, OPENS, 500).at).toBe(0);
  });

  it('finishes the line still arriving when the player presses, rather than skipping past it', () => {
    expect(pressed(TWO, { at: 0, typed: 2 })).toEqual({ at: 0, typed: lettersIn(TWO[0]) });
  });

  it('takes the next line when the player presses on a line that is already whole', () => {
    expect(pressed(TWO, landed(TWO, OPENS))).toEqual({ at: 1, typed: 0 });
  });

  it('stays where it is when there is no line behind the one that has arrived', () => {
    const last = landed(TWO, { at: 1, typed: 0 });

    expect(pressed(TWO, last)).toEqual(last);
  });

  it('needs two presses to get past a line nobody has read, and only two', () => {
    expect(pressed(TWO, pressed(TWO, OPENS))).toEqual({ at: 1, typed: 0 });
  });

  it('lands a line whole for a reader who asked for less motion, leaving the pacing in place', () => {
    const read = arriving(TWO, landed(TWO, OPENS), true);

    expect(read.typing).toBe(false);
    expect(read.awaits).toBe(true);
  });
});

describe('a beat the world keeps speaking under', () => {
  const saying = (count: number, from = 0): string[] => Array.from({ length: count }, (_, at) => `line ${from + at}`);

  it('takes what is said under it without losing the line being read', () => {
    const held = spokenUnder({ ...opensOn(['first', 'second']), reading: { at: 1, typed: 3 } }, ['third']);

    expect(held.lines).toEqual(['first', 'second', 'third']);
    expect(held.reading).toEqual({ at: 1, typed: 3 });
  });

  it('takes nothing from a tick that said nothing, so a quiet frame leaves the reader alone', () => {
    const opened = opensOn(['first']);

    expect(spokenUnder(opened, [])).toBe(opened);
  });

  it('stops growing, however long the modal stands open, and never reads past what it still holds', () => {
    let held = opensOn(saying(1));
    let widest = 0;
    for (let tick = 0; tick < BEAT_LINES_KEPT * 3; tick += 1) {
      held = spokenUnder(held, saying(1, tick + 1));
      widest = Math.max(widest, held.lines.length);
      expect(held.lines.length).toBeLessThanOrEqual(BEAT_LINES_KEPT);
      expect(held.reading.at).toBeLessThan(held.lines.length);
    }

    expect(widest, 'nothing said under the beat ever reached it').toBe(BEAT_LINES_KEPT);
  });
});
