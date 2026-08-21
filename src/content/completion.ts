import { formPattern } from '../grammar/codec';
import type { ListParser } from '../grammar/list';
import { DslError, type Parser, type Written } from '../grammar/parser';
import { isPositionalField } from '../grammar/section';
import { indentLines, splitSections } from '../grammar/structure';
import { Section, sectionFor, sectionKinds } from './sections';

export interface Addressed {
  kind: string;
  address: string;
}

export interface Offer {
  form: string;
  insert: string;
  family?: string;
  note?: string;
  kind?: string;
}

export interface Offering {
  from: number;
  to: number;
  where: readonly string[];
  reads: string | null;
  refused: string | null;
  undeclared: readonly string[];
  offers: readonly Offer[];
}

const NOTHING: Offering = { from: 0, to: 0, where: [], reads: null, refused: null, undeclared: [], offers: [] };

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

function linesAt(owner: Section, text: string, lineStart: number, indent: number): { lines: readonly Written[]; where: string[] } {
  let lines = owner.grammar;
  const where = [`# ${owner.kind}`];
  for (const above of enclosing(text, lineStart, indent)) {
    const found = opened(lines, above.text);
    if (found === undefined) return { lines: [], where };
    where.push(found.form);
    lines = found.block!();
  }
  return { lines, where };
}

// What the engine makes of the line as it stands: the shape it fits that spells out the most of itself.
function readAs(lines: readonly Written[], line: string): string | null {
  let best: string | null = null;
  let longest = -1;
  for (const written of lines) {
    if (!formPattern(written.form).test(line) || literalOf(written.form).length <= longest) continue;
    best = written.form;
    longest = literalOf(written.form).length;
  }
  return best;
}

const opens = (line: string): string | undefined => HEADING.exec(line)?.groups?.kind;

function headingAbove(text: string, lineStart: number): string | undefined {
  const above = text.slice(0, lineStart).split('\n');
  for (let at = above.length - 1; at >= 0; at--) {
    if (above[at]!.startsWith('#')) return above[at];
  }
  return undefined;
}

// What the engine says when it is handed this line where it sits, which is the only honest account of whether it took.
function refusalAt(owner: Section, heading: string, above: readonly Enclosing[], line: string, held: readonly Written[] | undefined): string | null {
  if (line.trim() === '') return null;
  const indent = INDENT.exec(line)![0].length;
  const opened = held === undefined ? [] : indentLines([held[0]!.example], indent + 2);
  const written = [heading, ...above.map((each) => `${' '.repeat(each.indent)}${each.text}`), line, ...opened].join('\n');
  try {
    owner.parse(splitSections(written)[0]!);
    return null;
  } catch (error) {
    return error instanceof DslError ? error.message : null;
  }
}

const declares = (known: readonly Addressed[], kind: string, id: string): boolean =>
  known.some((each) => each.kind === kind && (each.address === id || each.address.endsWith(`.${id}`) || id.endsWith(`.${each.address}`)));

// The ids this line names that no module in the universe declares. A thing written before the thing it names is normal, so this is a remark rather than a refusal.
function undeclaredOn(owner: Section, heading: string, line: string, known: readonly Addressed[]): string[] {
  if (line.trim() === '') return [];
  const read = readSection([heading, line.trim()].join('\n'));
  if (read === undefined) return [];
  const missing: string[] = [];
  try {
    read.owner.visit(read.authored as { id: string }, '', (kind, id) => {
      if (!declares(known, kind, id)) missing.push(id);
      return id;
    });
  } catch {
    return [];
  }
  void owner;
  return [...new Set(missing)];
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

const LEADING_WORD = /[a-z][a-z0-9-]*/;

// An element that takes more than an id refuses a bare probe, so stand its own first example in, with the id swapped out.
const wholeValue = (parser: Parser<unknown> | null): string | undefined => {
  const example = parser?.examples[0];
  return example === undefined || !LEADING_WORD.test(example) ? undefined : example.replace(LEADING_WORD, PROBE);
};

function referencedKinds(text: string, from: number, to: number, stood = PROBE): Set<string> {
  const found = new Set<string>();
  const read = readSection(`${text.slice(0, from)}${stood}${text.slice(to)}`);
  if (read === undefined) return found;
  try {
    read.owner.visit(read.authored as { id: string }, '', (kind, id) => {
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

const FIRST_PLACEHOLDER = /<[^>]*>/;

// A form that says which kind its placeholder names is worth one line per thing of that kind.
const namedOffers = (written: Written, known: readonly Addressed[], typed: string): Offer[] => {
  const literal = literalOf(written.form);
  if (written.names === undefined || !typed.startsWith(literal)) return [];
  const after = typed.slice(literal.length);
  return known
    .filter((each) => each.kind === written.names && namesFrom(each.address, after))
    .map((each) => ({ form: written.form.replace(FIRST_PLACEHOLDER, each.address), insert: written.form.replace(FIRST_PLACEHOLDER, each.address), family: written.family, kind: each.kind }))
    .sort((a, b) => a.form.localeCompare(b.form));
};

const shows = (form: string, typed: string): boolean => {
  const literal = literalOf(form);
  return typed === '' || literal.startsWith(typed) || (literal !== '' && typed.startsWith(literal));
};

const offerFor = (form: string, family?: string, note?: string): Offer => ({ form, insert: literalOf(form) === '' ? form : literalOf(form), ...(family === undefined ? {} : { family }), ...(note === undefined ? {} : { note }) });

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
      where: ['# <kind>'],
      reads: kind === '' ? null : '# <kind>',
      refused: null,
      undeclared: [],
        offers: sectionKinds()
        .filter((each) => each.startsWith(kind))
        .map((each) => ({ form: each, insert: `${each} `, family: 'a kind' })),
    };
  }
  const typed = groups.id ?? '';
  return {
    from: at - typed.length,
    to: lineEnd,
    where: [`# ${kind}`],
    reads: typed === '' ? null : `# ${kind} <id>`,
    refused: null,
    undeclared: [],
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

  const heading = headingAbove(text, lineStart);
  const kind = heading === undefined ? undefined : opens(heading);
  const owner = kind === undefined ? undefined : sectionFor(kind);
  if (owner === undefined || heading === undefined) return NOTHING;

  const indent = INDENT.exec(before)![0].length;
  const opening = CLAUSE.exec(before.slice(indent));
  const from = lineStart + indent + (opening === null ? 0 : opening.index + opening[0].length);
  const typed = text.slice(from, at);
  const tail = text.slice(at, lineEnd);
  const to = at + (tail.indexOf(',') < 0 ? tail.length : tail.indexOf(','));

  const token = TRAILING_ID.exec(typed)![0];
  const past = at + LEADING_ID.exec(tail)![0].length;
  const kinds = referencedKinds(text, at - token.length, past);
  const continuing = opening !== null && opening[0].startsWith(',');
  const written = continuing ? text.slice(lineStart + indent, from) : typed;
  const named = fieldNamed(owner, written, true);
  const under = named.key === null ? '' : (KEYED.exec(written)?.[0] ?? '');
  const left = continuing ? typed : typed.slice(under.length);
  const values = named.parser === null ? [] : named.parser.forms;
  // Read the section around the line being written, which is the half of it that stands whole while this one is still being typed.
  if (kinds.size === 0 && token === '' && text.slice(past, lineEnd).trim() === '') {
    const whole = wholeValue(named.parser);
    if (whole !== undefined) for (const each of referencedKinds(text, at, past, whole)) kinds.add(each);
  }
  const held = readSection(`${text.slice(0, lineStart)}${text.slice(lineEnd)}`)?.authored;
  const here = linesAt(owner, text, lineStart, indent);
  const alongside = continuing ? 'one more value' : named.key === null ? 'what goes here' : `what ${named.key}: takes`;
  const lines = here.lines.filter((written) => written.needs === undefined || held === undefined || held[written.needs] !== undefined);

  const reads = readAs(here.lines, text.slice(lineStart, lineEnd).trim());
  return {
    from,
    to,
    where: here.where,
    reads,
    refused: refusalAt(owner, heading, enclosing(text, lineStart, indent), text.slice(lineStart, lineEnd), here.lines.find((line) => line.form === reads)?.block?.()),
    undeclared: indent === 0 ? undeclaredOn(owner, heading, text.slice(lineStart, lineEnd), known) : [],
    offers: deduped([
      ...addressOffers(known, kinds, typed.slice(0, typed.length - token.length), token),
      ...(continuing || under !== '' ? [] : lines).flatMap((line) => [...(shows(line.form, typed) ? [offerFor(line.form, line.family, line.note)] : []), ...namedOffers(line, known, typed)]),
      ...values.filter((form) => literalOf(form) === '' || shows(form, left)).map((form) => offerFor(form, alongside)),
    ]),
  };
}

export const applied = (text: string, offering: Offering, offer: Offer): { text: string; cursor: number } => ({
  text: `${text.slice(0, offering.from)}${offer.insert}${text.slice(offering.to)}`,
  cursor: offering.from + offer.insert.length,
});
