import { align, exampleOf, holesIn, standingIn, valueIn, type Alignment, type Hole } from '../grammar/form';
import type { ListParser } from '../grammar/list';
import { DslError, type Parser, type Written } from '../grammar/parser';
import { isPositionalField } from '../grammar/section';
import { indentLines, splitSections } from '../grammar/structure';
import { Section, sectionFor, sectionKinds } from './sections';
import { REFERENCE } from '../grammar/values';

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

// The placeholder the cursor stands in, what one line of this shape puts there, and the kind of thing that may be named there where the engine names one.
export interface Filling {
  form: string;
  hole: string;
  like?: string;
  kind?: string;
}

const BARE = new RegExp(`^${REFERENCE.source}$`);

// A hole whose own line puts an id there is that kind of thing; a hole that puts something else there, as `<weight>` puts `3x`, takes an id as well, and the line it puts there is the half an author will more often want.
export function fillingWords(filling: Filling): string {
  const named = filling.kind === undefined ? '' : `a # ${filling.kind}`;
  if (filling.like === undefined) return `<${filling.hole}>${named === '' ? '' : ` — ${named}`}`;
  if (named === '' ) return `<${filling.hole}> — like ${filling.like}`;
  return BARE.test(filling.like) ? `<${filling.hole}> — ${named}` : `<${filling.hole}> — like ${filling.like}, or ${named}`;
}

// An id a line names that nothing declares, and the kind it was looked for under, since an id that is wrong is only wrong against one of them.
export interface Undeclared {
  kind: string;
  id: string;
}

export interface Offering {
  from: number;
  to: number;
  where: readonly string[];
  reads: string | null;
  filling: Filling | null;
  refused: string | null;
  undeclared: readonly Undeclared[];
  offers: readonly Offer[];
}

const NOTHING: Offering = { from: 0, to: 0, where: [], reads: null, filling: null, refused: null, undeclared: [], offers: [] };

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

// The line that opened a block names the shape whose block it is: the one that reads the whole of it and spells out the most of itself, or, failing that, the one whose words it begins with.
function opened(lines: readonly Written[], line: string): Written | undefined {
  let best: Written | undefined;
  let read = -1;
  let longest = -1;
  for (const written of lines) {
    if (written.block === undefined) continue;
    const found = align(written.form, line);
    if (found?.complete === true && found.spelt > read) {
      best = written;
      read = found.spelt;
    }
    if (read >= 0) continue;
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

// What the engine makes of the line as it stands: the whole shape it fits that spells out the most of itself.
function readAs(lines: readonly Written[], line: string): string | null {
  let best: string | null = null;
  let longest = -1;
  for (const written of lines) {
    const read = align(written.form, line);
    if (read === null || !read.complete || read.spelt <= longest) continue;
    best = written.form;
    longest = read.spelt;
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

// The heading and the blocks a line sits in, which is the half of a draft that stands whole while the line itself is still being written.
export const beneath = (heading: string, above: readonly Enclosing[]): string => [heading, ...above.map((each) => `${' '.repeat(each.indent)}${each.text}`)].join('\n');

const around = (heading: string, above: readonly Enclosing[], line: string, opened: readonly string[] = []): string => [beneath(heading, above), line, ...opened].join('\n');

// Where the line itself begins in what `around` builds, so a span the engine reports can be told apart from the ground the cursor has not reached.
const openingOf = (heading: string, above: readonly Enclosing[]): number => above.reduce((sum, each) => sum + each.indent + each.text.length + 1, heading.length + 1);

// What the engine says when it is handed this line where it sits, which is the only honest account of whether it took. A complaint about ground past the cursor is about what is unwritten, not about what is wrong.
function refusalAt(owner: Section, written: string, held: readonly Written[] | undefined, indent: number, cursor: number): string | null {
  const opened = held === undefined ? [] : indentLines([held[0]!.example], indent + 2);
  try {
    owner.parse(splitSections([written, ...opened].join('\n'))[0]!);
    return null;
  } catch (error) {
    if (!(error instanceof DslError)) return null;
    return error.span !== undefined && error.span.start >= cursor ? null : error.message;
  }
}

const declares = (known: readonly Addressed[], kind: string, id: string): boolean =>
  known.some((each) => each.kind === kind && (each.address === id || each.address.endsWith(`.${id}`) || id.endsWith(`.${each.address}`)));

// Every id a section names, paired with the kind the engine reads it as.
function namedIn(written: string): { kind: string; id: string }[] {
  const read = readSection(written);
  if (read === undefined) return [];
  const found: { kind: string; id: string }[] = [];
  try {
    read.owner.visit(read.authored as { id: string }, '', (kind, id) => {
      found.push({ kind, id });
      return id;
    });
  } catch {
    return [];
  }
  return found;
}

// The ids a line names that no module in the universe declares. A thing written before the thing it names is normal, so this is a remark rather than a refusal.
function undeclaredIn(written: string, known: readonly Addressed[]): Undeclared[] {
  const held = new Map<string, Undeclared>();
  for (const each of namedIn(written)) if (!declares(known, each.kind, each.id)) held.set(`${each.kind} ${each.id}`, each);
  return [...held.values()];
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

// The kinds a stand-in is read as where it was put, which is the engine's own answer to what may be named there.
const kindsStanding = (written: string): Set<string> => new Set(namedIn(written).filter((each) => each.id === PROBE || each.id.endsWith(`.${PROBE}`)).map((each) => each.kind));

const only = (kinds: ReadonlySet<string>): string | undefined => (kinds.size === 1 ? [...kinds][0] : undefined);

export const said = (...parts: (string | undefined)[]): string | undefined => {
  const held = parts.filter((part) => part !== undefined);
  return held.length === 0 ? undefined : held.join(' — ');
};

// Asking the engine costs a parse, and a page asks again at every keystroke; what it is asked about changes as an author moves, so the answers are kept but not hoarded.
const RECALL = 2000;
const recalled = new Map<string, string | undefined>();

// What a line names beyond what its own placeholders say: the kind the engine reads at each hole, asked by standing a probe there in the line's own example. A hole already called after its kind has nothing to add.
export function saysKind(under: string, indent: number, written: Written): string | undefined {
  const key = [under, indent, written.form].join(' ');
  if (recalled.has(key)) return recalled.get(key);
  const named = (holesIn(written.form, written.example) ?? [])
    .map((hole) => ({ hole, kind: only(kindsStanding([under, `${' '.repeat(indent)}${standingIn(written.example, hole, PROBE)}`].join('\n'))) }))
    .filter((each): each is { hole: Hole; kind: string } => each.kind !== undefined && !each.hole.name.split(' ').includes(each.kind));
  // A hole whose own line puts an id there names one; a hole that puts something else there, as `<weight>` puts `3x`, takes an id as well as what it shows, and saying it names one would be a lie about the common case.
  const said = named.length === 0 ? undefined : named.map((each) => `${BARE.test(valueIn(written.example, each.hole)) ? 'names' : 'may instead name'} a # ${each.kind}`).join(', ');
  if (recalled.size >= RECALL) recalled.clear();
  recalled.set(key, said);
  return said;
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

// One shape a line could still turn into, read against the text written under the keyword it sits after.
interface Shape {
  form: string;
  example: string;
  under: string;
  against: string;
  family?: string;
  note?: string;
}

const shapeOf = (written: Written, under: string, against: string, family?: string): Shape => ({ form: written.form, example: written.example, under, against, ...((family ?? written.family) === undefined ? {} : { family: family ?? written.family }), ...(written.note === undefined ? {} : { note: written.note }) });

const worth = (found: Alignment): number => (found.complete ? 1000 : 0) + found.spelt;

// Once a line spells out the words of some shape, the shapes it spells out nothing of are no longer what is being written.
function narrowed(read: readonly { shape: Shape; read: Alignment }[]): { shape: Shape; read: Alignment }[] {
  const most = Math.max(0, ...read.map((each) => each.read.spelt));
  return read.filter((each) => each.read.spelt === most);
}

// Of the shapes the written text could still take, the one that accounts for the most of it — which is the one an author is writing.
const standing = (read: readonly { shape: Shape; read: Alignment }[]): { shape: Shape; read: Alignment } | undefined =>
  read.reduce<{ shape: Shape; read: Alignment } | undefined>((best, each) => (best === undefined || worth(each.read) > worth(best.read) ? each : best), undefined);

const reading = (shapes: readonly Shape[]): { shape: Shape; read: Alignment }[] =>
  shapes.flatMap((shape) => {
    const read = align(shape.form, shape.against);
    return read === null ? [] : [{ shape, read }];
  });

// Where the cursor stands. What one line of this shape puts in that hole is the only thing the engine can be asked what the hole names, and a hole the shape's own example leaves out has nothing but its name to give.
function fillingHole(found: { shape: Shape; read: Alignment }): { form: string; hole: string; like?: string; probe?: string } | undefined {
  const open = found.read.open;
  if (open === null) return undefined;
  const holes = holesIn(found.shape.form, found.shape.example) ?? [];
  const hole = holes[found.read.holes.length - 1]?.name === open.name ? holes[found.read.holes.length - 1] : holes.find((each) => each.name === open.name);
  if (hole === undefined) return { form: found.shape.form, hole: open.name };
  return { form: found.shape.form, hole: hole.name, like: valueIn(found.shape.example, hole), probe: `${found.shape.under}${standingIn(found.shape.example, hole, PROBE)}` };
}

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
      filling: { form: '# <kind> <id>', hole: 'kind', like: 'item' },
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
    filling: { form: `# ${kind} <id>`, hole: 'id', like: `${kind}-of-your-own` },
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
  const continuing = opening !== null && opening[0].startsWith(',');
  const written = continuing ? text.slice(lineStart + indent, from) : typed;
  const named = fieldNamed(owner, written, true);
  const under = named.key === null || continuing ? '' : (KEYED.exec(written)?.[0] ?? '');
  const left = typed.slice(under.length);
  const above = enclosing(text, lineStart, indent);
  const held = readSection(`${text.slice(0, lineStart)}${text.slice(lineEnd)}`)?.authored;
  const here = linesAt(owner, text, lineStart, indent);
  const alongside = continuing ? 'one more value' : named.key === null ? 'what goes here' : `what ${named.key}: takes`;
  const lines = here.lines.filter((written) => written.needs === undefined || held === undefined || held[written.needs] !== undefined);

  const shapes: Shape[] = [
    ...(continuing || under !== '' ? [] : lines).map((line) => shapeOf(line, '', typed)),
    ...(named.parser === null ? [] : named.parser.forms).map((form) => shapeOf({ form, example: exampleOf(form, named.parser!.examples) ?? form }, under, left, alongside)),
  ];
  const shown = narrowed(reading(shapes));
  const stood = standing(shown);
  const filling = stood === undefined ? undefined : fillingHole(stood);

  const line = text.slice(lineStart, lineEnd);
  const spliced = (stood: string): string => around(heading, above, `${text.slice(lineStart, from)}${stood}${text.slice(to, lineEnd)}`);
  // What the hole under the cursor names is asked of the engine by standing a probe in that hole of a whole line of this shape, which is the only account of the hole rather than of whatever the token happens to be part of.
  const holds = filling?.probe === undefined ? new Set<string>() : kindsStanding(spliced(filling.probe));
  // The ids on offer are whatever kind the engine reads where the cursor stands: the token it is on, or, where that leaves too little to parse, the hole around it.
  const kinds = kindsStanding(around(heading, above, `${text.slice(lineStart, at - token.length)}${PROBE}${text.slice(past, lineEnd)}`));
  if (kinds.size === 0) for (const each of holds) kinds.add(each);

  const reads = readAs(here.lines, line.trim());
  // A shape the line has spelt out but not finished is being written, not broken; anything else is handed to the engine, whose word on it is the only honest one.
  const refused =
    line.trim() === '' || (stood !== undefined && !stood.read.complete && stood.read.spelt > 0)
      ? null
      : refusalAt(owner, around(heading, above, line), here.lines.find((line) => line.form === reads)?.block?.(), indent, openingOf(heading, above) + at - lineStart);
  // A shape a refused line has spelt none of is not what it is being written as; saying so would be guessing over the engine's own word.
  const filled = filling === undefined || (refused !== null && stood!.read.spelt === 0) ? undefined : filling;
  return {
    from,
    to,
    where: here.where,
    reads,
    filling: filled === undefined ? null : { form: filled.form, hole: filled.hole, ...(filled.like === undefined ? {} : { like: filled.like }), ...(only(holds) === undefined ? {} : { kind: only(holds)! }) },
    refused,
    undeclared: undeclaredIn(around(heading, above, line), known),
    // A shape whose words are the ones already written would put back what it replaced, and an author who has written them is being offered nothing.
    offers: deduped([
      ...addressOffers(known, kinds, typed.slice(0, typed.length - token.length), token),
      ...shown
        .map(({ shape }) => offerFor(shape.form, shape.family, said(shape.note, saysKind(beneath(heading, above), indent, { form: `${shape.under}${shape.form}`, example: `${shape.under}${shape.example}` }))))
        .filter((offer) => offer.insert !== text.slice(from, to)),
      ...(continuing || under !== '' ? [] : lines).flatMap((line) => namedOffers(line, known, typed)),
    ]),
  };
}

export const applied = (text: string, offering: Offering, offer: Offer): { text: string; cursor: number } => ({
  text: `${text.slice(0, offering.from)}${offer.insert}${text.slice(offering.to)}`,
  cursor: offering.from + offer.insert.length,
});
