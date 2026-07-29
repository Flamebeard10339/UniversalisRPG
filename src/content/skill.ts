import { SectionSchema } from '../grammar/section';
import { humanize, id, text } from '../grammar/values';

export interface Skill {
  id: string;
  title: string;
  'stat-id'?: string;
}

export const skillSchema: SectionSchema<Skill> = {
  kind: 'skill',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    // Nothing reads it yet — skill levels are designed in docs/combat — but it
    // names a stat, so it resolves and is checked like every other reference.
    'stat-id': { parser: id },
  },
};
