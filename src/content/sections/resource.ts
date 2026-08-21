import { DslError, Parser } from '../../grammar/parser';
import { decimal, id } from '../../grammar/values';
import { put } from '../refs';
import { section } from './define';
import { TITLE_FIELD } from './info';

export type ResourceDisplay = 'full' | 'minimal';

export interface Resource {
  id: string;
  title: string;
  // Signed and net: regeneration and drain are one stat, not two fields.
  rate?: string;
  max: string;
  start?: number;
  display: ResourceDisplay;
}

const RESOURCE_DISPLAYS = ['full', 'minimal'] as const;

const displayValue: Parser<ResourceDisplay> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = id.parse(cursor);
    if (!(RESOURCE_DISPLAYS as readonly string[]).includes(raw)) {
      throw new DslError(`resource display must be one of ${RESOURCE_DISPLAYS.join(', ')}, got ${JSON.stringify(raw)}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    }
    return raw as ResourceDisplay;
  },
  print: (value) => value,
  forms: [...RESOURCE_DISPLAYS],
  examples: [...RESOURCE_DISPLAYS],
};

export const resource = section<Resource>()({
  kind: 'resource',
  ids: 'owned',
  map: 'resources',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    rate: { parser: id, names: { id: 'stat' } },
    max: { parser: id, names: { id: 'stat' } },
    start: { parser: decimal },
    display: { parser: displayValue, default: () => 'full', printed: 'always' },
  },
  validate: (value) => (value.max ? undefined : 'requires a max: stat'),
  visit: (value, where, visit) => {
    put(value, 'max', 'stat', `${where} max:`, visit);
    put(value, 'rate', 'stat', `${where} rate:`, visit);
  },
});
