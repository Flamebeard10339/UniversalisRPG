import type { Range } from '../grammar/range';
import type { Localized } from './localized';

export interface StatShare {
  title: Localized;
  added: Range;
  increased: number;
}
