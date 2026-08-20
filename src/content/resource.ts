import { TITLE_FIELD } from './info';
import { DslError, Parser } from '../grammar/parser';
import { SectionSchema } from '../grammar/section';
import { id, decimal } from '../grammar/values';

export type ResourceDisplay = 'full' | 'minimal';

export interface Resource {
  id: string;
  title: string;
  // One NET signed rate: regeneration and drain are the same stat.
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
  examples: [...RESOURCE_DISPLAYS],
};

export const resourceSchema: SectionSchema<Resource> = {
  kind: 'resource',
  fields: {
    title: TITLE_FIELD,
    rate: { parser: id },
    max: { parser: id },
    start: { parser: decimal },
    display: { parser: displayValue, default: () => 'full', printed: 'always' },
  },
};
