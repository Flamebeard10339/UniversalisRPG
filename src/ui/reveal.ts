import type { SettingRow } from '../runtime/session';

export const A_CHARACTER = 50;

const PACED = 'reveal';

const AT_A_PACE = 'on';

export const revealing = (settings: readonly SettingRow[]): boolean => settings.find((row) => row.name === PACED)?.standing === AT_A_PACE;

export interface Reading {
  at: number;
  typed: number;
}

export const OPENS: Reading = { at: 0, typed: 0 };

const charactersOf = (line: string): string[] => [...line];

export const lettersIn = (line: string): number => charactersOf(line).length;

export const cutTo = (line: string, letters: number): string => charactersOf(line).slice(0, Math.max(0, letters)).join('');

const lineAt = (lines: readonly string[], at: number): string => lines[at] ?? '';

export interface Arriving {
  shown: readonly string[];
  typing: boolean;
  awaits: boolean;
}

export function arriving(lines: readonly string[], reading: Reading, paced: boolean): Arriving {
  if (!paced || lines.length === 0) return { shown: lines, typing: false, awaits: false };

  const at = Math.min(Math.max(0, reading.at), lines.length - 1);
  const whole = lettersIn(lineAt(lines, at));
  const typed = Math.min(Math.max(0, reading.typed), whole);

  return {
    shown: [...lines.slice(0, at), cutTo(lineAt(lines, at), typed)],
    typing: typed < whole,
    awaits: typed === whole && at < lines.length - 1,
  };
}

export const typedOn = (lines: readonly string[], reading: Reading): Reading => ({
  at: reading.at,
  typed: Math.min(reading.typed + 1, lettersIn(lineAt(lines, reading.at))),
});

export const landed = (lines: readonly string[], reading: Reading): Reading => ({ at: reading.at, typed: lettersIn(lineAt(lines, reading.at)) });

export function pressed(lines: readonly string[], reading: Reading): Reading {
  if (reading.typed < lettersIn(lineAt(lines, reading.at))) return landed(lines, reading);
  return reading.at + 1 < lines.length ? { at: reading.at + 1, typed: 0 } : reading;
}
