import { Condition, condition, printReference, Reference } from './condition';
import { Cursor, DslError, Parser, parseWhole } from './parser';
import { REFERENCE } from './structure';

export type TextSegment = { kind: 'literal'; text: string } | { kind: 'interpolate'; reference: Reference } | { kind: 'conditional'; condition: Condition; text: string };

function parseFragment(raw: string, base: number): TextSegment {
  const colon = raw.indexOf(':');
  if (colon === -1) {
    const match = REFERENCE.exec(raw);
    if (!match || match[0] !== raw)
      throw new DslError(`malformed interpolation: {${raw}}`, {
        start: base,
        end: base + raw.length,
      });
    return { kind: 'interpolate', reference: { path: raw.split('.') } };
  }
  const parsedCondition = parseWhole(condition, raw.slice(0, colon), base, 'a conditional fragment');
  return {
    kind: 'conditional',
    condition: parsedCondition,
    text: raw.slice(colon + 1).replace(/^[ \t]/, ''),
  };
}

export const OPENS_A_FRAGMENT = '{';

export const A_LITERAL_BRACE = '{{';

export function parseSegments(text: string, base: number): TextSegment[] {
  const segments: TextSegment[] = [];
  let literal = '';
  let i = 0;
  const flush = (): void => {
    if (literal !== '') segments.push({ kind: 'literal', text: literal });
    literal = '';
  };
  while (i < text.length) {
    if (text[i] !== OPENS_A_FRAGMENT) {
      literal += text[i];
      i++;
      continue;
    }
    if (text.startsWith(A_LITERAL_BRACE, i)) {
      literal += OPENS_A_FRAGMENT;
      i += A_LITERAL_BRACE.length;
      continue;
    }
    flush();
    const close = text.indexOf('}', i + 1);
    if (close === -1)
      throw new DslError(`unterminated fragment: ${text.slice(i)}`, {
        start: base + i,
        end: base + text.length,
      });
    segments.push(parseFragment(text.slice(i + 1, close), base + i + 1));
    i = close + 1;
  }
  flush();
  return segments;
}

export function printSegments(values: readonly TextSegment[] | undefined): string {
  return (values ?? [])
    .map((segment) => {
      if (segment.kind === 'literal') return segment.text.split(OPENS_A_FRAGMENT).join(A_LITERAL_BRACE);
      if (segment.kind === 'interpolate') return `{${printReference(segment.reference)}}`;
      return `{${condition.print(segment.condition)}: ${segment.text}}`;
    })
    .join('');
}

const FRAGMENT = /\{[^}]*\}/;

export const fragment: Parser<TextSegment> = {
  parse: (cursor: Cursor) => {
    const at = cursor.pos;
    const raw = cursor.take(FRAGMENT);
    if (raw === null) throw new DslError('a fragment is written {…}', { start: cursor.abs(at), end: cursor.abs(cursor.pos) });
    return parseFragment(raw.slice(1, -1), cursor.abs(at) + 1);
  },
  print: (value) => printSegments([value]),
  called: 'fragment',
  holds: () => ({ condition }),
  forms: ['{<held>}', '{<condition>: <words>}'],
  examples: ['{player.name}', '{has-key: The key is heavy in my pocket.}'],
  notes: {
    '{<held>}':
      'whatever the run holds under that name is put into the line here — an `<engine state>` path, a # flag or a # variable — and a thing the world declares arrives as its title. A fragment may stand in any line the game says to a player, whether that is a dialogue line, a `say:` or an `examine:`, and in none of the `title:` lines that name a section. Write `{{` for a brace of its own',
    '{<condition>: <words>}': 'those words are said only while the condition holds, and nothing stands in their place while it does not',
  },
};
