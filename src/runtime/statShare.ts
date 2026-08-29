import type { Range } from '../grammar/range';
import type { Localized } from './localized';

// One named share of a stat, in the two channels a bonus lands on. `increased` is a percentage, and
// a share is drawn as it stands rather than resolved into the total, because *what is adding to
// this* is the question and a resolved figure has stopped answering it.
export interface StatShare {
  title: Localized;
  added: Range;
  increased: number;
}
