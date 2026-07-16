import { Condition, condition } from './condition';
import { list } from './list';
import { DslError, Parser } from './parser';
import { SectionSchema } from './section';
import { humanize, id, number, text } from './values';

export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

export interface Relative {
  direction: Direction;
  of: string;
}

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
  relative?: Relative;
}

const edge: Parser<Edge> = {
  parse(cursor) {
    const target = id.parse(cursor);
    if (cursor.take(/[ \t]+while[ \t]+/) !== null) {
      return { target, condition: condition.parse(cursor) };
    }
    return { target };
  },
};

const DIRECTION = /north|south|east|west|up|down/;

const relative: Parser<Relative> = {
  parse(cursor) {
    const direction = cursor.take(DIRECTION);
    if (direction === null) throw new DslError('expected a direction', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    if (cursor.take(/[ \t]+of[ \t]+/) === null) throw new DslError("expected 'of' after a direction", { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return { direction: direction as Direction, of: id.parse(cursor) };
  },
};

export const locationSchema: SectionSchema<Location, 'starting'> = {
  kind: 'location',
  fields: {
    x: { parser: number, default: () => 0 },
    y: { parser: number, default: () => 0 },
    z: { parser: number, default: () => 0 },
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text },
    entities: { parser: list(id), default: () => [] },
    adjacent: { parser: list(edge), default: () => [] },
    relative: { parser: relative },
  },
  flags: ['starting'],
  bare: 'relative',
  exclusive: [
    ['x', 'y', 'z'],
    ['relative'],
  ],
};
