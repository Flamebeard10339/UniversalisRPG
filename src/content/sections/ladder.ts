import { decimal } from '../../grammar/values';
import { section } from './define';

export interface Ladder {
  id: string;
  atLevelOne: number;
  growthPerLevel: number;
  minutesAtLevelOne: number;
  minutesGrowthPerLevel: number;
  secondsToFellAnEvenMatch?: number;
}

const WHAT_A_LADDER_IS = 'what a character of a given level is assumed to stand at, which every figure the world is audited against is read off';

export const ladder = section<Ladder>()({
  kind: 'ladder',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'ladders',
  fields: {
    atLevelOne: {
      parser: decimal,
      keyword: 'at level one',
      default: () => 0,
      printed: 'always',
      note: `${WHAT_A_LADDER_IS} — this is the bottom of it, where a character of level one stands in the stat this section is named for`,
    },
    growthPerLevel: {
      parser: decimal,
      keyword: 'growth per level',
      default: () => 0,
      printed: 'always',
      note: 'how much the line rises for each level above the first, added rather than multiplied, so a stat that climbs 7 a level stands at 7 more at every rung. A ladder that grows by nothing says the stat is not meant to climb, and is read that way rather than as an omission',
    },
    minutesAtLevelOne: {
      parser: decimal,
      keyword: 'minutes at level one',
      default: () => 0,
      printed: 'always',
      note: 'how long the first level is meant to take, in game-minutes. This is the other half of a ladder: what a character stands at, and how long they took to get there — a payout is read against this, so a skill that pays double the rate this asks climbs at twice the pace it was cut for',
    },
    minutesGrowthPerLevel: {
      parser: decimal,
      keyword: 'minutes growth per level',
      default: () => 1,
      printed: 'always',
      note: 'what each level multiplies the last one by, so 1.07 makes every level seven percent longer than the one under it and 1 makes them all the same length. Multiplied rather than added, which is what makes the curve a curve',
    },
    secondsToFellAnEvenMatch: {
      parser: decimal,
      keyword: 'seconds to fell an even match',
      standsWithout: true,
      note: 'how long this pool takes to empty against something of the same level, which is the line that ties what a character can lose to what one deals. A ladder naming this is the world\'s toughness line: every stat carrying `deals:` climbs this same line divided by these seconds, so damage a second is derived here rather than declared anywhere, and one ladder in a world may say it',
    },
  },
});
