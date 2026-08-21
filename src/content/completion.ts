import type { ListParser } from '../grammar/list';
import type { Parser, Written } from '../grammar/parser';
import { DEFAULT_CONTEXT, isPositionalField } from '../grammar/section';
import { splitSections } from '../grammar/structure';
import { Section, sectionFor, sectionKinds } from './sections';

export interface Addressed {
  kind: string;
  address: string;
}

export interface Offer {
  form: string;
  insert: string;
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
const PLACEHOLDER = /[<[]/;

const PROBE = 'zzprobezz';

export function namesFrom(address: string, typed: string): boolean {
  if (address.startsWith(typed)) return true;
  for (let at = address.indexOf('.'); at >= 0; at = address.indexOf('.', at + 1)) {
    if (address.startsWith(typed, at + 1)) return true;
  }
  return false;
}

// Everything a form spells out before its first placeholder is what an author can be handed; a form that opens with one is handed over whole, to edit in place.
export const literalOf = (form: string): string => {
  const at = form.search(PLACEHOLDER);
  return at < 0 ? form : form.slice(0, at);
};

// The line that opened a block names the shape whose block it is: the one spelling out the longest prefix of it, or else the one that spells out nothing.
function opened(lines: readonly Written[], line: string): Written | undefined {
  let best: Written | undefined;
  let longest = -1;
  for (const written of lines) {
    if (written.block === undefined) continue;
    const literal = literalOf(written.form).trimEnd();
    if (literal !== '' && !line.startsWith(literal)) continue;
    if (literal.length > longest) {
      best = written;
      longest = literal.length;
    }
  }
  return best;
}

interface Enclosing {
  text: string;
  indent: number;
}

function enclosing(text: string, lineStart: number, indent: number): Enclosing[] {
  const above = text.slice(0, lineStart).split('\n');
  const held: Enclosing[] = [];
  let inner = indent;
  for (let at = above.length - 1; at >= 0 && inner > 0; at--) {
    const written = above[at]!;
    if (written.trim() === '' || written.startsWith('#')) continue;
    const deep = INDENT.exec(written)![0].length;
    if (deep >= inner) continue;
    held.unshift({ text: written.trim(), indent: deep });
    inner = deep;
  }
  return held;
}

function linesAt(owner: Section, text: string, lineStart: number, indent: number): readonly Written[] {
  let lines = owner.grammar;
  for (const above of enclosing(text, lineStart, indent)) {
    const found = opened(lines, above.text);
    if (found === undefined) return [];
    lines = found.block!();
  }
  return lines;
}

const opens = (line: string): string | undefined => HEADING.exec(line)?.groups?.kind;

function kindAbove(text: string, lineStart: number): string | undefined {
  const above = text.slice(0, lineStart).split('\n');
  for (let at = above.length - 1; at >= 0; at--) {
    if (above[at]!.startsWith('#')) return opens(above[at]!);
  }
  return undefined;
}

function readSection(text: string): { owner: Section; authored: Record<string, unknown> } | undefined {
  try {
    const raw = splitSections(text)[0];
    const owner = raw === undefined ? undefined : sectionFor(raw.kind);
    if (raw === undefined || owner === undefined) return undefined;
    return { owner, authored: owner.parse(raw) as Record<string, unknown> };
  } catch {
    return undefined;
  }
}

function referencedKinds(text: string, from: number, to: number): Set<string> {
  const found = new Set<string>();
  const read = readSection(`${text.slice(0, from)}${PROBE}${text.slice(to)}`);
  if (read === undefined) return found;
  try {
    read.owner.visit(read.owner.build(read.authored, DEFAULT_CONTEXT), '', (kind, id) => {
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
    .map((each) => ({ form: each.address, insert: `${before}${each.address}`, kind: each.kind }))
    .sort((a, b) => a.form.localeCompare(b.form));

const KEYED = /^(?<key>[a-z][a-z0-9 -]*?):[ \t]*/;

const oneOf = (parser: Parser<unknown>): Parser<unknown> => ('element' in parser ? (parser as ListParser<unknown>).element : parser);

function fieldNamed(owner: Section, written: string, alone: boolean): { key: string | null; parser: Parser<unknown> | null } {
  const schema = owner.schema;
  if (schema === undefined) return { key: null, parser: null };
  const key = KEYED.exec(written)?.groups?.key;
  const found = Object.entries(schema.fields).find(([name, spec]) => (key === undefined ? name === schema.clauses : !isPositionalField(schema, name) && (spec.keyword ?? name) === key));
  if (found === undefined) return { key: null, parser: null };
  const parser = found[1].parser as Parser<unknown>;
  return { key: key ?? null, parser: alone ? oneOf(parser) : parser };
}

const shows = (form: string, typed: string): boolean => {
  const literal = literalOf(form);
  return typed === '' || literal.startsWith(typed) || (literal !== '' && typed.startsWith(literal));
};

const offerFor = (form: string): Offer => ({ form, insert: literalOf(form) === '' ? form : literalOf(form) });

function deduped(offers: readonly Offer[]): Offer[] {
  const held = new Map<string, Offer>();
  for (const offer of offers) if (!held.has(offer.form)) held.set(offer.form, offer);
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
        .map((each) => ({ form: each, insert: `${each} ` })),
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
  const named = fieldNamed(owner, continuing ? text.slice(lineStart + indent, from) : typed, continuing);
  const values = named.parser === null ? [] : named.parser.forms.map((form) => (continuing || named.key === null ? form : `${named.key}: ${form}`));
  // Read the section around the line being written, which is the half of it that stands whole while this one is still being typed.
  const held = readSection(`${text.slice(0, lineStart)}${text.slice(lineEnd)}`)?.authored;
  const lines = continuing ? [] : linesAt(owner, text, lineStart, indent).filter((written) => written.needs === undefined || held === undefined || held[written.needs] !== undefined);

  return {
    from,
    to,
    offers: deduped([
      ...addressOffers(known, kinds, typed.slice(0, typed.length - token.length), token),
      ...[...lines.map((written) => written.form), ...values].filter((form) => shows(form, typed)).map(offerFor),
    ]),
  };
}

export const applied = (text: string, offering: Offering, offer: Offer): { text: string; cursor: number } => ({
  text: `${text.slice(0, offering.from)}${offer.insert}${text.slice(offering.to)}`,
  cursor: offering.from + offer.insert.length,
});
