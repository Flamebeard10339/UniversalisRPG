import { xpForLevel } from '../../src/runtime/skills';

// How long a level is meant to take, in minutes. The shape is ruled -- time-to-level rises linearly
// under an optimal activity pattern -- and these two numbers are the instantiation of it. They are a
// designer's assumption and nothing shipped reads them, which is why they live here and not under
// `src/`: the engine has no opinion about how fast a player should climb.
export const MINUTES_AT_LEVEL_ONE = 2;
export const MINUTES_PER_LEVEL = 3;

export const minutesForLevel = (level: number): number => MINUTES_PER_LEVEL * level + MINUTES_AT_LEVEL_ONE;

const MINUTES_PER_HOUR = 60;

// What the best offer within reach at this level has to pay, in experience an hour, for the level to
// take the time above. Both halves come from somewhere that already owns them -- the cost of the
// level from the engine's curve, the time from the assumption above -- so a re-tune of either moves
// this with no edit here.
export const rateAtLevel = (level: number): number => ((xpForLevel(level + 1) - xpForLevel(level)) * MINUTES_PER_HOUR) / minutesForLevel(level);

// The level the target is cheapest at. Below it the first level's cost is spread over too little
// time, above it the curve outruns the clock -- so the frontier is not a rising line and a rate
// cannot be read against a neighbouring level's by eye.
export function slackestLevel(upTo: number): number {
  let slackest = 1;
  for (let level = 1; level <= upTo; level += 1) if (rateAtLevel(level) < rateAtLevel(slackest)) slackest = level;
  return slackest;
}
