import type { SettingRow } from '../runtime/session';

// What one character of a beat costs to arrive. The engine publishes which word the run is played by
// and never how long that word is — a terminal reveals nothing, and a published modal says only what
// is left to answer — so the word costs its time here, beside what draws it, the way a manner costs
// its pixels in `modalManner.ts`. Twenty characters a second, which is quick enough to read along
// with rather than wait on.
export const A_CHARACTER = 50;

// The preference this reads, named where a run declares it rather than mirrored. These are the only
// two words of the declaration the app knows, and `reveal.test.ts` holds them to the words the
// engine still publishes.
const PACED = 'reveal';

const AT_A_PACE = 'on';

export const revealing = (settings: readonly SettingRow[]): boolean => settings.find((row) => row.name === PACED)?.standing === AT_A_PACE;

// How far into a beat the reading has got: which line is arriving, and how much of it has.
export interface Reading {
  at: number;
  typed: number;
}

export const OPENS: Reading = { at: 0, typed: 0 };

// Characters, never code units. A line cut between the halves of one is a line ending in a broken
// character, which is what a player would be looking at for a twentieth of a second every time.
const charactersOf = (line: string): string[] => [...line];

export const lettersIn = (line: string): number => charactersOf(line).length;

export const cutTo = (line: string, letters: number): string => charactersOf(line).slice(0, Math.max(0, letters)).join('');

const lineAt = (lines: readonly string[], at: number): string => lines[at] ?? '';

export interface Arriving {
  // The lines to draw, the last of them cut to where the typing has got.
  shown: readonly string[];
  // A line still coming, so what the beat waits on is the clock.
  typing: boolean;
  // A line standing behind the one that has arrived, so what the beat waits on is the player.
  awaits: boolean;
}

// What a beat draws now. A beat not read at a pace lands whole and waits for nothing, which is what
// landing whole means.
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

// One character more. A line that has all of them stays where it is: what carries a beat on from
// there is the player, and nothing else.
export const typedOn = (lines: readonly string[], reading: Reading): Reading => ({
  at: reading.at,
  typed: Math.min(reading.typed + 1, lettersIn(lineAt(lines, reading.at))),
});

// The whole line at once, for a reader who asked for less motion. What is left of the pace for them
// is a line at a time, which is pacing and not motion.
export const landed = (lines: readonly string[], reading: Reading): Reading => ({ at: reading.at, typed: lettersIn(lineAt(lines, reading.at)) });

// The press that carries a beat on. It finishes the line still arriving, or takes the next one, so
// one control both hurries a line and acknowledges it and a player never has to find a second.
export function pressed(lines: readonly string[], reading: Reading): Reading {
  if (reading.typed < lettersIn(lineAt(lines, reading.at))) return landed(lines, reading);
  return reading.at + 1 < lines.length ? { at: reading.at + 1, typed: 0 } : reading;
}
