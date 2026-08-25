import { holeNames } from './form';
import { Cursor, DslError, Parser } from './parser';

const WRITTEN = /#[0-9a-f]{6}/;

export const colour: Parser<string> = {
  parse(cursor: Cursor) {
    const start = cursor.pos;
    const raw = cursor.take(WRITTEN);
    if (raw === null)
      throw new DslError(`expected a colour written as #rrggbb, got ${JSON.stringify(cursor.rest().trim())}`, {
        start: cursor.abs(start),
        end: cursor.abs(cursor.pos),
      });
    return raw;
  },
  print: (value) => value,
  forms: ['<colour>'],
  examples: ['#22d3ee'],
};

// The placeholder a colour fills, read off the parser's own form. A surface that can draw a colour
// asks here which hole to draw it in, so any field written with this parser gets that surface
// without naming itself to it.
export const COLOUR_HOLE = holeNames(colour.forms[0]!)[0]!;

export const isColourHole = (hole: string | undefined): boolean => hole === COLOUR_HOLE;

// What a picker opens on: the colour already written where it is standing, or one to start from
// where nothing readable is written there, since a picker has no way to show no colour at all.
const OPENS_ON = '#808080';

export const colourStanding = (written: string): string => {
  const held = written.trim();
  return new RegExp(`^${WRITTEN.source}$`).test(held) ? held : OPENS_ON;
};
