import { section } from './define';

export interface Flag {
  id: string;
}

export const flag = section<Flag>()({
  kind: 'flag',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'flags',
  fields: {},
});
