import { decimal } from '../../grammar/values';
import { section } from './define';

export interface Profile {
  id: string;
  damage?: number;
  rate?: number;
  accuracy: number;
  pool?: number;
  evasion: number;
  reduction?: number;
}

export const PROFILE_PAIRS = [
  ['rate', 'damage'],
  ['pool', 'reduction'],
] as const satisfies readonly (readonly (keyof Profile)[])[];

const AGAINST_THE_EVEN = 'read against what the tier alone would have given this body at its level, so 1 leaves that alone and is what every unwritten line here means';

const factor = (keyword: string, note: string) => ({
  parser: decimal,
  keyword,
  default: () => 1,
  printed: 'always' as const,
  note: `${note} ${AGAINST_THE_EVEN}`,
});

const half = (keyword: string, note: string, spent: string) => ({
  parser: decimal,
  keyword,
  printed: 'always' as const,
  note: `${note} It is one of the two ways ${spent}, and the tier fixes what the two come to between them, so writing this one solves the other rather than leaving it at 1.`,
});

const PAIRED = (pair: readonly string[]): string => `names neither ${pair.join(' nor ')}, so the tier's budget has nothing to hang on and both halves are unknown. Write one of them; the other is solved from the tier`;

export const profile = section<Profile>()({
  kind: 'profile',
  ids: 'global',
  vocabulary: 'declared',
  map: 'profiles',
  fields: {
    damage: half('damage', 'how hard one blow of this lands, as a multiple of what the player of its level deals.', 'a tier spends what a body deals a second'),
    rate: half('rate', 'how often it swings, as a multiple of how often the player of its level does.', 'a tier spends what a body deals a second'),
    accuracy: factor('accuracy', 'how often a swing of its own finds the mark.'),
    pool: half('pool', 'how much it has to lose before it goes down, as a multiple of what the player of its level can lose.', 'a tier spends how long a body stands'),
    evasion: factor('evasion', 'how hard it is to land a blow on.'),
    reduction: half('reduction', 'how much it takes off every blow that does land, as a multiple of what the player of its level takes off.', 'a tier spends how long a body stands'),
  },
  exclusive: PROFILE_PAIRS.map((pair) => pair.map((each) => [each])),
  validate: (value) => {
    const unanswered = PROFILE_PAIRS.find((pair) => pair.every((each) => value[each] === undefined));
    return unanswered === undefined ? undefined : PAIRED(unanswered);
  },
});
