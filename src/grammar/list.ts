import { Cursor, Parser, parseWhole } from './parser';
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

  const print = (values: readonly E[]): string => values.map((value) => element.print(value)).join(', ');
  // Derived from the element's, so a list never states a spelling of its own
  // and a new element example is a new list example with no edit here.
  const examples = [...element.examples, element.examples.join(', ')];
  const line: Parser<E[]> = { parse: parseInline, print, examples };

  return {
    element,
    parse: parseInline,
    print,
    examples,
    parseBlock: (lines) => lines.flatMap((raw) => parseWhole(line, raw.text, raw.span.start, 'a list item')),
  };
}
