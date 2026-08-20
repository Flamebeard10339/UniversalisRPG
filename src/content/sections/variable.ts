import { decimal } from '../../grammar/values';
import { section } from './define';

export interface Variable {
  id: string;
  value?: number;
}

export const variable = section<Variable>()({
  kind: 'variable',
  ids: 'global',
  map: 'variables',
  fields: {
    value: { parser: decimal },
  },
});
