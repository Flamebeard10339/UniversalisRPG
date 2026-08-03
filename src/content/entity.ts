import { Action, actionBody } from '../grammar/action';
import { list } from '../grammar/list';
import { Parser } from '../grammar/parser';
import { Range, range } from '../grammar/range';
import { SectionSchema } from '../grammar/section';
import { humanize, id, text } from '../grammar/values';

export type { Action } from '../grammar/action';

export interface Entity {
  id: string;
  title: string;
  // The action template this entity inherits, compiled into `actions` at load.
  type?: string;
  examine?: string;
  capabilities: string[];
  // Replaces the global `# stat` default per name; the player names nothing.
  stats: Record<string, Range>;
  flags: string[];
  actions: Action[];
}

// An assignment, not the `+4-7 attack` shift a bonus tag clause carries.
const statAssignment: Parser<[string, Range]> = {
  parse(cursor) {
    const statId = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return [statId, range.parse(cursor)];
  },
};

export const entitySchema: SectionSchema<Entity, never, 'actions'> = {
  kind: 'entity',
  fields: {
    type: { parser: id },
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text },
    capabilities: { parser: list(id), keyword: 'stations', default: () => [] },
    stats: {
      parser: list(statAssignment),
      hydrate: (parsed) => Object.fromEntries(parsed as [string, Range][]),
      default: () => ({}),
    },
    flags: { parser: list(id), default: () => [] },
  },
  entries: { into: 'actions', body: actionBody },
};
