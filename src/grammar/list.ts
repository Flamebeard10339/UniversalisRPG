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
  // One example of a comma list, which is two values and not every value the element has: a list of
  // nine shapes joined end to end is not a line anybody would write.
  const examples = [...element.examples, element.examples.slice(0, 2).join(', ')];
  const forms = element.forms.map((form) => `${form}, …`);
  const line: Parser<E[]> = { parse: parseInline, print, forms, examples };

  // A list is its element written over and over, so what its element's placeholders hold is what the list's do, and what the element's grammar is called is what the list's is called.
  return {
    ...filledBy(element),
    ...(element.called === undefined ? {} : { called: element.called }),
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
