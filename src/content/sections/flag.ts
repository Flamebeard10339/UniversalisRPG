import { section } from './define';

export interface Flag {
  id: string;
}

export const flag = section<Flag>()({
  kind: 'flag',
  ids: 'owned',
  map: 'flags',
  fields: {},
});
