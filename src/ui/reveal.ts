import type { SettingRow } from '../runtime/session';

// How long the words of a beat take to arrive. The engine publishes which word the run is played by
// and never how long that word is — a terminal reveals nothing, and a published modal says only what
// is left to answer — so the word costs its milliseconds here, beside what draws it, the way a manner
// costs its pixels in `modalManner.ts`.
//
// These three are the whole rate: what a character of a line is worth, and the least and the most a
// line may hold the floor for however few or many it turns out to have.
export const A_CHARACTER = 24;

export const LEAST_A_LINE_HOLDS = 260;

export const MOST_A_LINE_HOLDS = 2400;

// The preference this reads, named where a run declares it rather than mirrored. These are the only
// two words of the declaration the app knows, and `reveal.test.ts` holds them to the words the
// engine still publishes.
const PACED = 'reveal';

const AT_A_PACE = 'on';

export const revealing = (settings: readonly SettingRow[]): boolean => settings.find((row) => row.name === PACED)?.standing === AT_A_PACE;

const holds = (line: string): number => Math.min(MOST_A_LINE_HOLDS, Math.max(LEAST_A_LINE_HOLDS, line.length * A_CHARACTER));

// How long each line of a beat waits on the ones before it. A beat read at a pace lands a line at a
// time; a beat not read at a pace waits for nothing, which is what landing whole means.
export function revealDelays(lines: readonly string[], paced: boolean): number[] {
  if (!paced) return lines.map(() => 0);

  const delays: number[] = [];
  let waited = 0;
  for (const line of lines) {
    delays.push(waited);
    waited += holds(line);
  }
  return delays;
}
