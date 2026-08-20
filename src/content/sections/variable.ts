import { SectionSchema } from '../grammar/section';
import { decimal } from '../grammar/values';

export interface Variable {
  id: string;
  value?: number;
}

export const variableSchema: SectionSchema<Variable> = {
  kind: 'variable',
  fields: {
    value: { parser: decimal },
  },
};
