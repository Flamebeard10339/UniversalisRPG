import type { Condition } from '../../grammar/condition';
import { point, Range, range } from '../../grammar/range';
import { hiddenIf, section } from './define';
import { GROUP_FIELD } from './group';
import { TITLE_FIELD } from './info';

export interface Stat {
  id: string;
  title: string;
  base: Range;
  group?: string;
  hiddenIf?: Condition;
}

export const stat = section<Stat>()({
  kind: 'stat',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'stats',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    base: { parser: range, default: () => point(0), printed: 'always' },
    group: GROUP_FIELD,
    hiddenIf: hiddenIf(
      'the stat is kept off the sheet the player reads while this holds, which is how a stat the world keeps for itself stays off it — `hidden if: always` never shows, and `hidden if: not changed.<this stat>` shows it only once something has moved it off the base it was declared with',
    ),
  },
});
