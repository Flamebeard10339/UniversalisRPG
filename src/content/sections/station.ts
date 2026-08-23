import { section } from './define';

export interface Station {
  id: string;
}

export const station = section<Station>()({
  kind: 'station',
  ids: 'owned',
  map: 'stations',
  fields: {},
});
