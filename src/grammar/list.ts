import { filledBy, writtenFrom } from './codec';
import { Cursor, Parser, Written, parseWhole } from './parser';
import { RawLine } from './structure';

export interface ListParser<E> extends Parser<E[]> {
  element: Parser<E>;
  parseBlock(lines: RawLine[]): E[];
  printBlock(values: readonly E[]): string[];
  lines(): readonly Written[];
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
  const examples = [...element.examples, element.examples.join(', ')];
  const forms = element.forms.map((form) => `${form}, …`);
  const line: Parser<E[]> = { parse: parseInline, print, forms, examples };

  // A list is its element written over and over, so what its element's placeholders hold is what the list's do.
  return {
    ...filledBy(element),
    element,
    parse: parseInline,
    print,
    forms,
    examples,
    lines: () => writtenFrom(element),
    parseBlock: (lines) => lines.flatMap((raw) => parseWhole(line, raw.text, raw.span.start, 'a list item')),
    printBlock: (values) => values.map((value) => element.print(value)),
  };
}
