import type { Parser } from '../grammar/parser';
import { DEFAULT_CONTEXT, isPositionalField } from '../grammar/section';
import { splitSections } from '../grammar/structure';
import { Section, sectionFor, sectionKinds } from './sections';

export interface Addressed {
  kind: string;
  address: string;
}

export interface Offer {
  insert: string;
  label: string;
  kind?: string;
}

export interface Offering {
  from: number;
  to: number;
  offers: readonly Offer[];
}

const NOTHING: Offering = { from: 0, to: 0, offers: [] };

const HEADING = /^#[ \t]*(?<kind>[a-z][a-z0-9-]*)?(?<gap>[ \t]+)?(?<id>[a-z0-9.-]*)?/;
const INDENT = /^[ \t]*/;
const CLAUSE = /(?:^|,)[ \t]*(?=[^,]*$)/;
const TRAILING_ID = /[a-z0-9.-]*$/;
const LEADING_ID = /^[a-z0-9.-]*/;

const PROBE = 'zzprobezz';

export function namesFrom(address: string, typed: string): boolean {
  if (address.startsWith(typed)) return true;
  for (let at = address.indexOf('.'); at >= 0; at = address.indexOf('.', at + 1)) {
    if (address.startsWith(typed, at + 1)) return true;
  }
  return false;
}

const opens = (line: string): string | undefined => HEADING.exec(line)?.groups?.kind;

function kindAbove(text: string, lineStart: number): string | undefined {
  const above = text.slice(0, lineStart).split('\n');
  for (let at = above.length - 1; at >= 0; at--) {
    if (above[at]!.startsWith('#')) return opens(above[at]!);
  }
  return undefined;
}

function referencedKinds(text: string, from: number, to: number): Set<string> {
  const found = new Set<string>();
  try {
    const raw = splitSections(`${text.slice(0, from)}${PROBE}${text.slice(to)}`)[0];
    const owner = raw === undefined ? undefined : sectionFor(raw.kind);
    if (raw === undefined || owner === undefined) return found;
    owner.visit(owner.build(owner.parse(raw), DEFAULT_CONTEXT), '', (kind, id) => {
      if (id === PROBE || id.endsWith(`.${PROBE}`)) found.add(kind);
      return id;
    });
  } catch {
    return found;
  }
  return found;
}

const addressOffers = (known: readonly Addressed[], kinds: ReadonlySet<string>, before: string, typed: string): Offer[] =>
  known
    .filter((each) => kinds.has(each.kind) && namesFrom(each.address, typed))
    .map((each) => ({ insert: `${before}${each.address}`, label: each.address, kind: each.kind }))
    .sort((a, b) => a.label.localeCompare(b.label));

const KEYED = /^(?<key>[a-z][a-z0-9 -]*?):[ \t]*/;

function fieldNamed(owner: Section, written: string): { key: string | null; examples: readonly string[] } {
  const schema = owner.schema;
  if (schema === undefined) return { key: null, examples: [] };
  const key = KEYED.exec(written)?.groups?.key;
  const found = Object.entries(schema.fields).find(([name, spec]) => (key === undefined ? name === schema.clauses : !isPositionalField(schema, name) && (spec.keyword ?? name) === key));
  if (found === undefined) return { key: null, examples: [] };
  return { key: key ?? null, examples: (found[1].parser as Parser<unknown>).examples };
}

function deduped(offers: readonly Offer[]): Offer[] {
  const held = new Map<string, Offer>();
  for (const offer of offers) if (!held.has(offer.insert)) held.set(offer.insert, offer);
  return [...held.values()];
}

function headingOffering(text: string, at: number, before: string, lineEnd: number, known: readonly Addressed[]): Offering {
  const groups = HEADING.exec(before)?.groups;
  if (groups === undefined) return NOTHING;
  const kind = groups.kind ?? '';
  if (groups.gap === undefined) {
    return {
      from: at - kind.length,
      to: at + LEADING_ID.exec(text.slice(at, lineEnd))![0].length,
      offers: sectionKinds()
        .filter((each) => each.startsWith(kind))
        .map((each) => ({ insert: `${each} `, label: each })),
    };
  }
  const typed = groups.id ?? '';
  return {
    from: at - typed.length,
    to: lineEnd,
    offers: addressOffers(known, new Set(kind === '' ? [] : [kind]), '', typed),
  };
}

export function offeringAt(text: string, cursor: number, known: readonly Addressed[]): Offering {
  const at = Math.max(0, Math.min(cursor, text.length));
  const lineStart = text.lastIndexOf('\n', at - 1) + 1;
  const broken = text.indexOf('\n', at);
  const lineEnd = broken < 0 ? text.length : broken;
  const before = text.slice(lineStart, at);

  if (text.slice(lineStart, lineStart + 1) === '#') return headingOffering(text, at, before, lineEnd, known);

  const kind = kindAbove(text, lineStart);
  const owner = kind === undefined ? undefined : sectionFor(kind);
  if (owner === undefined) return NOTHING;

  const indent = INDENT.exec(before)![0].length;
  const opening = CLAUSE.exec(before.slice(indent));
  const from = lineStart + indent + (opening === null ? 0 : opening.index + opening[0].length);
  const typed = text.slice(from, at);
  const tail = text.slice(at, lineEnd);
  const to = at + (tail.indexOf(',') < 0 ? tail.length : tail.indexOf(','));

  const token = TRAILING_ID.exec(typed)![0];
  const kinds = referencedKinds(text, at - token.length, at + LEADING_ID.exec(tail)![0].length);
  const continuing = opening !== null && opening[0].startsWith(',');
  const named = fieldNamed(owner, continuing ? text.slice(lineStart + indent, from) : typed);
  const written = owner.examples;
  const lines = continuing
    ? named.examples
    : [...(indent === 0 ? written.lines : (written.block?.lines ?? [])), ...named.examples.map((example) => (named.key === null ? example : `${named.key}: ${example}`))];

  return {
    from,
    to,
    offers: deduped([
      ...addressOffers(known, kinds, typed.slice(0, typed.length - token.length), token),
      ...lines.filter((line) => line.startsWith(typed)).map((line) => ({ insert: line, label: line })),
    ]),
  };
}

export const applied = (text: string, offering: Offering, offer: Offer): { text: string; cursor: number } => ({
  text: `${text.slice(0, offering.from)}${offer.insert}${text.slice(offering.to)}`,
  cursor: offering.from + offer.insert.length,
});
