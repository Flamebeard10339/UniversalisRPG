import { Action, actionBody } from './action';
import { list } from './list';
import { Parser } from './parser';
import { Range, range } from './range';
import { SectionSchema } from './section';
import { humanize, id, text } from './values';

export type { Action } from './action';

export interface Entity {
  id: string;
  title: string;
  examine?: string;
  capabilities: string[];
  // This actor's own base for each named stat, replacing the global `# stat`
  // default. Anything it doesn't name falls back to that default — which is how
  // the player, naming nothing, goes on working unchanged.
  stats: Record<string, Range>;
  actions: Action[];
}

// `attack 4-7` — an assignment, not the `+4-7 attack` bonus tag clauses carry.
// An actor states what its stat IS; a bonus states how much something shifts it.
const statAssignment: Parser<[string, Range]> = {
  parse(cursor) {
    const statId = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return [statId, range.parse(cursor)];
  },
};

const statBlock: Parser<Record<string, Range>> = {
  parse: (cursor) => Object.fromEntries(list(statAssignment).parse(cursor)),
};

export const entitySchema: SectionSchema<Entity, never, 'actions'> = {
  kind: 'entity',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text },
    capabilities: { parser: list(id), keyword: 'stations', default: () => [] },
    stats: { parser: statBlock, default: () => ({}) },
  },
  entries: { into: 'actions', body: actionBody },
};
