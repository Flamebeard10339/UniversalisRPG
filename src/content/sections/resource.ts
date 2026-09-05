import { decimal, id, oneOf } from '../../grammar/values';
import { section } from './define';
import { TITLE_FIELD } from './info';

export type ResourceDisplay = 'full' | 'minimal';

export interface Resource {
  id: string;
  title: string;
  rate?: string;
  max: string;
  start?: number;
  display: ResourceDisplay;
}

const RESOURCE_DISPLAYS = ['full', 'minimal'] as const;

const displayValue = oneOf('display', RESOURCE_DISPLAYS, { complaint: 'a resource display' });

export const resource = section<Resource>()({
  kind: 'resource',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'resources',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    rate: { parser: id, names: { id: 'stat' }, note: 'the stat holding how much of this pool comes back per minute, or falls away per minute where it reads below nothing' },
    max: { parser: id, names: { id: 'stat' } },
    start: { parser: decimal },
    display: { parser: displayValue, default: () => 'full', printed: 'always' },
  },
  validate: (value) => (value.max ? undefined : 'requires a max: stat'),
});
