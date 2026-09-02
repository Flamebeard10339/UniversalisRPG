import { BUNDLE } from '../../grammar/actionResult';
import { section } from './define';

export interface Flag {
  id: string;
  bundle: boolean;
}

export const flag = section<Flag, 'bundle'>()({
  kind: 'flag',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'flags',
  fields: {},
  keywords: [BUNDLE],
});
