import { decimal } from '../../grammar/values';
import { section } from './define';

export interface Tier {
  id: string;
  secondsToFell: number;
  damageShare: number;
  experienceShare: number;
}

const AGAINST_AN_EVEN_MATCH = 'read against a player standing where the ladder puts one of the same level';

export const tier = section<Tier>()({
  kind: 'tier',
  ids: 'global',
  vocabulary: 'declared',
  map: 'tiers',
  fields: {
    secondsToFell: {
      parser: decimal,
      keyword: 'seconds to fell',
      default: () => 0,
      printed: 'always',
      note: `how long something of this tier stands before it goes down, ${AGAINST_AN_EVEN_MATCH}. It is the whole of what the tier says about toughness: a health pool, a resistance and a flat reduction are three ways of spending it, and a body that spends it three times over is not of this tier whatever it declares`,
    },
    damageShare: {
      parser: decimal,
      keyword: 'damage share',
      default: () => 0,
      printed: 'always',
      note: `what something of this tier deals a second, as a share of the incoming a player of the same level can stand — 1 empties them over the window the ladder is cut against, and 0.8 takes four fifths as long to do it. It is per body rather than per room, so a room of six is six times this`,
    },
    experienceShare: {
      parser: decimal,
      keyword: 'experience share',
      default: () => 0,
      printed: 'always',
      note: 'what an hour spent on things of this tier pays, as a share of what the curve asks at that level. It is an hour rather than a kill, so what one body pays falls out of this beside how long it takes to fell and how long the room takes to put another one up: a room that cannot be killed fast enough to reach this share is under-populated rather than under-paying',
    },
  },
});
