import { SectionSchema } from './section';
import { decimal } from './values';

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
