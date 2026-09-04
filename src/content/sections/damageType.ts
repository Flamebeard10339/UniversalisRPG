import { section } from './define';

export interface DamageType {
  id: string;
}

export const damageType = section<DamageType>()({
  kind: 'damage-type',
  ids: 'global',
  vocabulary: 'declared',
  map: 'damageTypes',
  fields: {},
});
