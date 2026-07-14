import { Codec } from './codec';
import { Condition, condition } from './condition';
import { list } from './list';
import { SectionSchema } from './section';
import { humanize, id, number, text } from './values';

export interface Edge {
  target: string;
  condition?: Condition;
}

export interface Location {
  id: string;
  x: number;
  y: number;
  z: number;
  title: string;
  examine?: string;
  entities: string[];
  adjacent: Edge[];
  starting: boolean;
}

const edge: Codec<Edge> = {
  parse(cursor) {
    const target = id.parse(cursor);
    if (cursor.take(/[ \t]+while[ \t]+/) !== null) {
      return { target, condition: condition.parse(cursor) };
    }
    return { target };
  },
  print: (value) => (value.condition ? `${value.target} while ${condition.print(value.condition)}` : value.target),
};

export const locationSchema: SectionSchema<Location, 'starting'> = {
  kind: 'location',
  fields: {
    x: { codec: number, default: () => 0 },
    y: { codec: number, default: () => 0 },
    z: { codec: number, default: () => 0 },
    title: { codec: text, default: (self) => humanize(self.id) },
    examine: { codec: text },
    entities: { codec: list(id), default: () => [] },
    adjacent: { codec: list(edge), default: () => [] },
  },
  flags: ['starting'],
};
