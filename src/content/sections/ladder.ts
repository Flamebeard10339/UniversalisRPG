import { decimal } from '../../grammar/values';
import type { Loose } from '../refs';
import { section } from './define';

export interface Ladder {
  id: string;
  addedAtLevelOne: number;
  addedGrowthPerLevel: number;
  increasedAtLevelOne: number;
  increasedGrowthPerLevel: number;
  minutesAtLevelOne: number;
  minutesGrowthPerLevel: number;
  secondsToFellAnEvenMatch?: number;
}

const TWO_HALVES =
  'A stat is worked out the way the engine works one out: every flat grant summed into what is added, every percent summed into what is increased, and the first multiplied by the second. A ladder therefore climbs on two lines rather than one, and what it asks at a level is the added line times the increased line. How much of the climb each half carries is the choice this makes available: the same total can be reached by a stat that grows mostly by being added to and one that grows mostly by being multiplied, and they play differently.';

export function twoToughnessLines(ladders: ReadonlyMap<string, Ladder>): Ladder[] {
  const named = [...ladders.values()].filter((each) => each.secondsToFellAnEvenMatch !== undefined);
  return named.length > 1 ? named : [];
}

export const ladder = section<Ladder>()({
  kind: 'ladder',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'ladders',
  visit: (value, where, visit) => {
    (value as unknown as Loose).id = visit('stat', value.id, where);
  },
  fields: {
    addedAtLevelOne: {
      parser: decimal,
      keyword: 'added at level one',
      default: () => 0,
      printed: 'always',
      note: `what is added to this stat for a character of level one, before anything increases it. ${TWO_HALVES}`,
    },
    addedGrowthPerLevel: {
      parser: decimal,
      keyword: 'added growth per level',
      default: () => 0,
      printed: 'always',
      note: 'how much more is added for each level above the first, added rather than multiplied. A ladder that grows by nothing here climbs only by what increases it, which is a real shape rather than an omission',
    },
    increasedAtLevelOne: {
      parser: decimal,
      keyword: 'increased at level one',
      default: () => 0,
      printed: 'always',
      note: 'the percent this stat is increased by for a character of level one, which is nothing in most worlds: a level-one character has earned no increases, so the ladder asks exactly what it says is added',
    },
    increasedGrowthPerLevel: {
      parser: decimal,
      keyword: 'increased growth per level',
      default: () => 0,
      printed: 'always',
      note: 'how many more percent this stat is increased by for each level above the first. Percents sum before they multiply, exactly as the engine sums them, so three a level comes to eighty-seven percent by level thirty rather than compounding past it',
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
      note: 'how long this pool takes to empty against something of the same level, which is the line that ties what a character can lose to what one deals. A ladder naming this is the world toughness line: every stat carrying `deals:` climbs this same line with its added half divided by these seconds, so damage a second is derived here rather than declared anywhere, and one ladder in a world may say it',
    },
  },
});
