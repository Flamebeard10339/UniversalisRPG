import { Cursor, Parser, parseWhole } from './parser';
import { RawLine, requireNoBlock } from './structure';

export interface ListParser<E> extends Parser<E[]> {
  element: Parser<E>;
  parseBlock(lines: RawLine[]): E[];
}

export function list<E>(element: Parser<E>): ListParser<E> {
  const parseInline = (cursor: Cursor): E[] => {
    const items: E[] = [];
    do {
      cursor.take(/[ \t]*/);
      items.push(element.parse(cursor));
    } while (cursor.take(/[ \t]*,[ \t]*/) !== null);
    return items;
  };

  const line: Parser<E[]> = { parse: parseInline };

  return {
    element,
    parse: parseInline,
    parseBlock: (lines) =>
      lines.flatMap((raw) => {
        const items = parseWhole(line, raw.text, raw.span.start, 'a list item');
        requireNoBlock(raw);
        return items;
      }),
  };
}
