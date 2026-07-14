import { SectionSchema } from './section';
import { humanize, text } from './values';

export interface Skill {
  id: string;
  title: string;
  'stat-id'?: string;
}

export const skillSchema: SectionSchema<Skill> = {
  kind: 'skill',
  fields: {
    title: { codec: text, default: (self) => humanize(self.id) },
    'stat-id': { codec: text },
  },
};
