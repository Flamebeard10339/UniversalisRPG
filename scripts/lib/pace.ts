import { LEVELS_PER_DOUBLING, xpForLevel } from '../../src/runtime/skills';

// How long a level is meant to take, in minutes. A designer's assumption that nothing shipped reads,
// which is why it lives here and not under `src/`: the engine has no opinion about how fast a player
// should climb.
//
// The growth is the one number here that is not free. The frontier is what the best offer within
// reach pays, and a stronger character can never earn less at an offer than a weaker one did — so
// the pace a world can hold never falls with level. A time function growing faster than the cost of
// a level therefore asks for a target that falls, which nothing monotone can meet. The linear
// `3L + 2` did exactly that: it grew sixty per cent between the first two levels against the curve's
// ten, so the target fell from 1,200 an hour at the first level to 457 at the ninth and asked the
// impossible of every skill under it.
//
// So the ceiling is the curve's own doubling, and any growth at or under it is a shape somebody may
// choose. At the ceiling the target is flat; under it the target rises, which is what better gear and
// better rooms are for. Seven per cent against a ceiling of ten and a half puts the first level at
// five minutes, the twentieth at eighteen, and the whole climb to seventy at about 123 hours.
export const MINUTES_AT_LEVEL_ONE = 5;
export const MINUTES_GROWTH_PER_LEVEL = 1.07;

// The fastest a level's time may grow with the target still reachable, which is the rate the cost of
// a level grows at. Read off the curve rather than written down beside it, so a re-tune of the
// doubling span moves the ceiling with it.
export const GROWTH_CEILING = 2 ** (1 / LEVELS_PER_DOUBLING);

export const minutesForLevel = (level: number): number => MINUTES_AT_LEVEL_ONE * MINUTES_GROWTH_PER_LEVEL ** (level - 1);

const MINUTES_PER_HOUR = 60;

// What the best offer within reach at this level has to pay, in experience an hour, for the level to
// take the time above. Both halves come from somewhere that already owns them -- the cost of the
// level from the engine's curve, the time from the assumption above -- so a re-tune of either moves
// this with no edit here.
export const rateAtLevel = (level: number): number => ((xpForLevel(level + 1) - xpForLevel(level)) * MINUTES_PER_HOUR) / minutesForLevel(level);
