import { Codec, Cursor } from './codec';
import { RawLine } from './structure';

export interface ListCodec<E> extends Codec<E[]> {
  element: Codec<E>;
  parseBlock(lines: RawLine[]): E[];
}

export function list<E>(element: Codec<E>): ListCodec<E> {
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
    print: (items) => items.map((item) => element.print(item)).join(', '),
    parseBlock: (lines) => lines.flatMap((line) => parseInline(new Cursor(line.text, 0, line.span.start))),
  };
}
