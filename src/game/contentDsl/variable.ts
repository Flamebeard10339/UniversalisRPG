import { SectionSchema } from './section';
import { decimal } from './values';

// A named numeric constant authored in content rather than baked into the
// engine — e.g. `travel-seconds-per-unit`, which paces real-time travel. An
// empty `value:` is the same as an absent one (DSL's absent==empty rule): the
// consumer supplies its own fallback, so `# variable foo` alone means "leave it
// at the engine default".
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
