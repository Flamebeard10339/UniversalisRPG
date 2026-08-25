import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { startSession, view, type SettingRow } from '../runtime/session';
import { A_CHARACTER, LEAST_A_LINE_HOLDS, MOST_A_LINE_HOLDS, revealDelays, revealing } from './reveal';
import { SHIPPED_SOURCES } from './shippedContent';

const ROWS: readonly SettingRow[] = view(startSession(loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry)).settings;

// One preference on its own, so what a row answers is about that row and not about what its
// neighbours happen to stand at.
const standingAt = (row: SettingRow, written: string): readonly SettingRow[] => [{ ...row, standing: written }];

const TURNS_IT_ON = ROWS.filter((row) => row.choices.some((choice) => revealing(standingAt(row, choice.written))));

const said = (of: number): string => 'x'.repeat(of);

// The subjects are the preferences the engine publishes rather than words written down here: the
// page knows one setting by name and one of its choices by name, and both have to still be on offer.
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

  it('reads no pace where the setting is not published, so a page handed no rows waits for nothing', () => {
    expect(revealing([])).toBe(false);
    expect(revealDelays([said(40), said(40)], revealing([]))).toEqual([0, 0]);
  });

  it('lands a beat whole when the run is not read at a pace', () => {
    expect(revealDelays([said(10), said(400), said(3)], false)).toEqual([0, 0, 0]);
  });

  it('starts the first line straight away and never sends a line back behind the one before it', () => {
    const delays = revealDelays([said(10), said(90), said(4), said(300)], true);

    expect(delays[0]).toBe(0);
    for (let at = 1; at < delays.length; at += 1) expect(delays[at], `line ${at}`).toBeGreaterThan(delays[at - 1]);
  });

  it('holds the floor for as long as there is to read, between a shortest and a longest', () => {
    const brief = revealDelays([said(1), said(1)], true)[1];
    const middling = revealDelays([said(Math.round(MOST_A_LINE_HOLDS / A_CHARACTER / 2)), said(1)], true)[1];
    const endless = revealDelays([said(10000), said(1)], true)[1];

    expect(brief).toBe(LEAST_A_LINE_HOLDS);
    expect(middling).toBeGreaterThan(brief);
    expect(middling).toBeLessThan(endless);
    expect(endless).toBe(MOST_A_LINE_HOLDS);
  });

  it('waits on nothing for a beat of one line, whatever pace it is read at', () => {
    expect(revealDelays([said(500)], true)).toEqual([0]);
    expect(revealDelays([], true)).toEqual([]);
  });
});
