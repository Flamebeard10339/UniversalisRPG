import { Condition, condition, printReference, Reference } from './condition';
import { DslError, parseWhole } from './parser';
import { REFERENCE } from './values';

// Interpolated prose: the grammar every player-visible line is written in, not
// one section kind's own. A dialogue line, a `# locale` translation of it and
// the walk that resolves what it names all read the same segments.
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

export function parseSegments(text: string, base: number): TextSegment[] {
  const segments: TextSegment[] = [];
  let literalStart = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '{') {
      i++;
      continue;
    }
    if (i > literalStart) segments.push({ kind: 'literal', text: text.slice(literalStart, i) });
    const close = text.indexOf('}', i + 1);
    if (close === -1)
      throw new DslError(`unterminated fragment: ${text.slice(i)}`, {
        start: base + i,
        end: base + text.length,
      });
    segments.push(parseFragment(text.slice(i + 1, close), base + i + 1));
    i = close + 1;
    literalStart = i;
  }
  if (literalStart < text.length) segments.push({ kind: 'literal', text: text.slice(literalStart) });
  return segments;
}

// The spelling a translator reads back and writes beside, which is why the load
// path records a spoken line's authored words through this and not through any
// other rendering of them.
export function printSegments(values: readonly TextSegment[] | undefined): string {
  return (values ?? [])
    .map((segment) => {
      if (segment.kind === 'literal') return segment.text;
      if (segment.kind === 'interpolate') return `{${printReference(segment.reference)}}`;
      return `{${condition.print(segment.condition)}: ${segment.text}}`;
    })
    .join('');
}
