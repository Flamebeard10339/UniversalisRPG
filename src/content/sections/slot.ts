import { Cursor, DslError, Parser } from '../../grammar/parser';
import { number } from '../../grammar/values';
import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Place {
  column: number;
  row: number;
}

function counted(cursor: Cursor, what: string): number {
  const start = cursor.pos;
  const value = number.parse(cursor);
  if (value < 1) throw new DslError(`a ${what} is counted from 1`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
  return value;
}

export const place: Parser<Place> = {
  parse(cursor) {
    const column = counted(cursor, 'column');
    if (cursor.take(/[ \t]+/) === null) throw new DslError('expected a row after the column', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return { column, row: counted(cursor, 'row') };
  },
  print: (value) => `${value.column} ${value.row}`,
  forms: ['<column> <row>'],
  examples: ['1 1', '3 2'],
};

export interface Slot {
  id: string;
  title: string;
  at?: Place;
}

export const slot = section<Slot>()({
  kind: 'slot',
  ids: 'global',
  vocabulary: 'open',
  map: 'slots',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    at: { parser: place, note: 'where the equipment page draws this slot on the body; a slot that leaves it out draws in a row beneath, as does a slot no # slot describes at all' },
  },
});
