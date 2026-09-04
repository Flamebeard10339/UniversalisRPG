import { decimal } from '../../grammar/values';
import { section } from './define';

export interface Profile {
  id: string;
  damage: number;
  rate: number;
  accuracy: number;
  pool: number;
  evasion: number;
  reduction: number;
}

const AGAINST_THE_EVEN = 'read against what the tier alone would have given this body at its level, so 1 leaves that alone and is what every unwritten line here means';

const factor = (keyword: string, note: string) => ({
  parser: decimal,
  keyword,
  default: () => 1,
  printed: 'always' as const,
  note: `${note} ${AGAINST_THE_EVEN}`,
});

export const profile = section<Profile>()({
  kind: 'profile',
  ids: 'global',
  vocabulary: 'declared',
  map: 'profiles',
  fields: {
    damage: factor('damage', 'how hard one blow of this lands.'),
    rate: factor('rate', 'how often it swings.'),
    accuracy: factor('accuracy', 'how often a swing of its own finds the mark.'),
    pool: factor('pool', 'how much it has to lose before it goes down.'),
    evasion: factor('evasion', 'how hard it is to land a blow on.'),
    reduction: factor('reduction', 'how much it takes off every blow that does land.'),
  },
});
