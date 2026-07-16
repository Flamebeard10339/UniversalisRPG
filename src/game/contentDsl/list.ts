import { Cursor, Parser } from './parser';
import { RawLine } from './structure';

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

  return {
    element,
    parse: parseInline,
    parseBlock: (lines) => lines.flatMap((line) => parseInline(new Cursor(line.text, 0, line.span.start))),
  };
}
