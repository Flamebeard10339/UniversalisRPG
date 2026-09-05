import { filledBy, writtenFrom } from './codec';
import { Cursor, Parser, Written, parseWhole } from './parser';
import { RawLine } from './structure';

export interface ListParser<E> extends Parser<E[]> {
  element: Parser<E>;
  parseBlock(lines: RawLine[]): E[];
  printBlock(values: readonly E[]): string[];
  lines(): readonly Written[];
}

export const isList = (parser: unknown): parser is ListParser<unknown> => typeof parser === 'object' && parser !== null && 'element' in parser;

export const elementOf = (parser: Parser<unknown>): Parser<unknown> => (isList(parser) ? parser.element : parser);

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
  const examples = [...element.examples, element.examples.slice(0, 2).join(', ')];
  const forms = element.forms.map((form) => `${form}, …`);
  const line: Parser<E[]> = { parse: parseInline, print, forms, examples };

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
