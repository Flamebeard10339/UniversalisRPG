import { align, bare, exampleOf, holeNames, holesIn, valueIn, type Alignment } from '../grammar/form';
import type { ListParser } from '../grammar/list';
import { DslError, type Filled, type Parser, type Span, type Written } from '../grammar/parser';
import { DEFAULT_CONTEXT, isPositionalField, typoOf } from '../grammar/section';
import { indentLines, splitSections } from '../grammar/structure';
import { EVERY_SECTION, parseSectionOf, Section, sectionFor, sectionKinds } from './sections';
import { filledBy } from '../grammar/codec';
import { REFERENCE } from '../grammar/values';

export interface Addressed {
  kind: string;
  address: string;
  // The module that declared it, where one did. An id declared at the root belongs to no module and stands on its own.
  module?: string | null;
}

export interface Offer {
  form: string;
  insert: string;
  family?: string;
  note?: string;
  kind?: string;
  module?: string | null;
}

// The placeholder the cursor stands in, what one line of this shape puts there, and the kind of thing that may be named there where the engine names one.
export interface Filling {
  form: string;
  hole: string;
  like?: string;
  kind?: string;
  // What a value of this hole is written with, where the hole holds a grammar of its own that nothing else on the page is showing.
  holds?: Held;
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
  // A declared id of that kind one letter away, since a name nobody declares is far more often a slip than a plan.
  meant?: string;
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
  // What every section takes stands beside what this kind declares, and only at the top of one: nothing of it opens a block, so a line written inside one is answered by that block's own grammar and nothing else.
  let lines: readonly Written[] = [...owner.grammar, ...EVERY_SECTION];
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

function headingAbove(text: string, lineStart: number): { at: number; line: string } | undefined {
  let found;
  let at = 0;
  for (const line of text.slice(0, lineStart).split('\n')) {
    if (line.startsWith('#')) found = { at, line };
    at += line.length + 1;
  }
  return found;
}

// The heading and the blocks a line sits in, which is the half of a draft that stands whole while the line itself is still being written.
export const beneath = (heading: string, above: readonly Enclosing[]): string => [heading, ...above.map((each) => `${' '.repeat(each.indent)}${each.text}`)].join('\n');

const around = (heading: string, above: readonly Enclosing[], line: string, opened: readonly string[] = []): string => [beneath(heading, above), line, ...opened].join('\n');

// What the engine says when it is handed the whole section, which is the only honest account of whether it took. Where it says nothing the section is content, whatever any one line of it would read as pulled out of the others. Reading it is half of taking it: a section is built as well, since a kind refuses on what its lines say together as much as on how each one is written.
export function refusalOf(text: string): { at: number; refused: string } | null {
  try {
    for (const raw of splitSections(text)) {
      try {
        const parsed = parseSectionOf(raw);
        sectionFor(parsed.kind)?.build(parsed.value, DEFAULT_CONTEXT);
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        // A section refused for what its lines say together rather than for any one of them has no line of its own to be laid on, so it is laid on the heading it belongs to — which is this section's, not whatever the file opens with.
        throw error.span === undefined ? new DslError(error.message, raw.span) : error;
      }
    }
    return null;
  } catch (error) {
    if (!(error instanceof DslError)) throw error;
    return { at: error.span?.start ?? 0, refused: error.message };
  }
}

// Where in the section the engine laid its one word, and how far into that line.
export interface Refusal {
  line: number;
  column: number;
  refused: string;
}

const lineOf = (text: string, at: number): number => text.slice(0, at).split('\n').length;

const openingLineAt = (text: string, line: number): number => text.split('\n').slice(0, line - 1).reduce((sum, each) => sum + each.length + 1, 0);

const emptied = (text: string, line: number): string => text.split('\n').map((each, index) => (index + 1 === line ? '' : each)).join('\n');

// Whether the rest of the section hangs off this line: a heading, or a line whose block is written under it. Clearing one of those rewrites the section rather than getting it out of the way, and everything the engine then says is about the wreckage.
function bears(text: string, line: number): boolean {
  const lines = text.split('\n');
  const written = lines[line - 1]!;
  if (written.startsWith('#')) return true;
  const indent = /^\s*/.exec(written)![0].length;
  const under = lines.slice(line).find((each) => each.trim() !== '');
  return under !== undefined && /^\s*/.exec(under)![0].length > indent;
}

// The engine refuses a section once and stops, so it is asked again with the line it named cleared out of its way, and again, for as long as it keeps moving down the section on lines it can be cleared of. Everything it says past that is about what the clearing left behind rather than about what the author wrote, so the list ends there — the lines it did name are the author's to fix, and asking again once they are shows whatever stood behind them.
// Sections are read one at a time and a section is refused for its own lines, so a draft with three broken sections is three answers rather than one — the engine's word on one of them is not about any of the others.
export function refusalsIn(text: string): Refusal[] {
  // Where the file cannot even be cut into sections — a line standing above the first heading — there is one answer about the whole of it, and the engine gives it.
  const heads = headingsIn(text);
  if (heads === null) return refusalsWithin(text);
  return heads.flatMap((start, at) => {
    const above = lineOf(text, start) - 1;
    return refusalsWithin(text.slice(start, heads[at + 1] ?? text.length)).map((said) => ({ ...said, line: said.line + above }));
  });
}

const headingsIn = (text: string): number[] | null => {
  try {
    return splitSections(text).map((each) => each.span.start);
  } catch {
    return null;
  }
};

function refusalsWithin(text: string): Refusal[] {
  const found: Refusal[] = [];
  let asked = text;
  let after = 0;
  for (;;) {
    const said = refusalOf(asked);
    if (said === null) return found;
    const line = lineOf(asked, said.at);
    if (line <= after) return found;
    found.push({ line, column: said.at - openingLineAt(asked, line), refused: said.refused });
    if (bears(asked, line)) return found;
    asked = emptied(asked, line);
    after = line;
  }
}

// The engine's word about the line the cursor is on, kept only where the engine lays it there. A line is read by the lines beside it — a pace set below it, a pool depleted three lines down — so a complaint laid elsewhere belongs to that line, and one laid past the cursor is about ground the author has not written yet.
function refusalAt(text: string, within: Span, held: readonly Written[] | undefined, indent: number, cursor: number): string | null {
  const line = lineOf(text, within.start);
  const said = refusalsIn(text).find((each) => each.line === line);
  if (said === undefined || within.start + said.column >= cursor) return null;
  if (held === undefined) return said.refused;
  // A line that opens a block and is handed over without one is refused for holding nothing, so the block's own first line goes under it and says whether that was the whole of it.
  return refusalOf(`${text.slice(0, within.end)}\n${indentLines([held[0]!.example], indent + 2).join('\n')}${text.slice(within.end)}`) === null ? null : said.refused;
}

const declares = (known: readonly Addressed[], kind: string, id: string): boolean =>
  known.some((each) => each.kind === kind && (each.address === id || each.address.endsWith(`.${id}`) || id.endsWith(`.${each.address}`)));

const resolves = (known: readonly Addressed[], kind: string, id: string): string | undefined => {
  const matches = known.filter((each) => each.kind === kind && (each.address === id || each.address.endsWith(`.${id}`)));
  return matches.length === 1 ? matches[0]!.address : undefined;
};

// Every id a section names, paired with the kind the engine reads it as. Each is handed back resolved, because the engine resolves an id before anything built from it is read: `use: entity.mirror.look-in` names an action under the mirror, and the mirror's whole address is half of what that action is called.
function namedIn(written: string, known: readonly Addressed[] = []): { kind: string; id: string }[] {
  const read = readSection(written);
  if (read === undefined) return [];
  const found: { kind: string; id: string }[] = [];
  try {
    read.owner.visit(read.authored as { id: string }, '', (kind, id) => {
      found.push({ kind, id });
      return resolves(known, kind, id) ?? id;
    });
  } catch {
    return [];
  }
  return found;
}

// The ids a line names that no module in the universe declares. A thing written before the thing it names is normal, so this is a remark rather than a refusal.
function undeclaredIn(written: string, known: readonly Addressed[]): Undeclared[] {
  const held = new Map<string, Undeclared>();
  const answered = new Set(known.map((each) => each.kind));
  for (const each of namedIn(written, known)) {
    // A kind nothing in the universe declares is one this cannot rule on, and saying an id is undeclared because its whole kind is unheard of would be a remark about the universe rather than about the line.
    if (!answered.has(each.kind) || declares(known, each.kind, each.id)) continue;
    const meant = typoOf(each.id, known.filter((one) => one.kind === each.kind).map((one) => one.address));
    held.set(`${each.kind} ${each.id}`, meant === undefined ? each : { ...each, meant });
  }
  return [...held.values()];
}

// The section as far as the engine can read it. A draft is written a line at a time, so one line it cannot read yet must not take the rest of the section down with it and leave every question about the whole unanswerable.
const asRead = (text: string): Record<string, unknown> | undefined => {
  const whole = readSection(text)?.authored;
  if (whole !== undefined) return whole;
  const lines = text.split('\n');
  for (const said of refusalsIn(text)) lines[said.line - 1] = '';
  return readSection(lines.join('\n'))?.authored;
};

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

// The one word of a placeholder's name that is a kind, which is how a placeholder says what it names: `<item>` names a # item, and `<buff item>` names one too.
const kindWordIn = (hole: string): string | undefined => hole.split(' ').find((word) => sectionFor(word) !== undefined);

// A declaration standing for another placeholder of the same line, whose written value says which kind is named.
const POINTED = /^<(?<hole>[a-z][a-z0-9 -]*)>$/;

// A hole with a grammar of its own names what the plainest shape of that grammar names, where that shape is one placeholder and nothing else: a condition may be written as a flag alone, so standing in one offers flags.
function heldName(parser: Parser<unknown>): string | undefined {
  const alone = POINTED.exec(parser.forms[0] ?? '')?.groups?.hole;
  if (alone === undefined) return undefined;
  const said = parser.names?.[alone];
  return said === undefined ? kindWordIn(alone) : (said ?? undefined);
}

// The kind of thing a hole names, read off the line that writes it rather than found by standing something in it and seeing what the engine makes of it. A placeholder is called after what it names unless its line says otherwise; `wrote` reads what the author has put in another hole, for a line that says one hole names whatever another one holds.
export function kindNamed(filled: Filled, hole: string, wrote: (hole: string) => string | undefined = () => undefined): string | undefined {
  const said = filled.names?.[hole];
  if (said === null) return undefined;
  const pointed = said === undefined ? undefined : POINTED.exec(said)?.groups?.hole;
  if (pointed !== undefined) {
    const written = wrote(pointed);
    return written !== undefined && sectionFor(written) !== undefined ? written : undefined;
  }
  if (said !== undefined) return said;
  const held = filled.holds?.()[hole];
  return held === undefined ? kindWordIn(hole) : heldName(held);
}

const WORD = /[^<>[\]\s]+/g;

// The words a form spells out for itself, which are what an author types rather than fills in.
const wordsOf = (form: string): string[] => form.replace(/<[^>]*>/g, ' ').match(WORD) ?? [];

// A grammar with no placeholder anywhere in it is a set of words and nothing else. A lone `<` is an operator, not a placeholder, which is why this asks for the whole shape of one.
const closed = (parser: Parser<unknown>): boolean => parser.forms.every((form) => bare(form) === form);

// What a hole holds, in its own words: the words a value of it is written with, and each placeholder inside it that names something, with the kind it names.
export interface Held {
  words: readonly string[];
  names: readonly { hole: string; kind: string }[];
}

export function heldBy(parser: Parser<unknown>): Held {
  const words = new Set<string>();
  const holding = new Map<string, string>();
  const inner = parser.holds?.() ?? {};
  for (const form of parser.forms) {
    for (const word of wordsOf(form)) words.add(word);
    for (const hole of holeNames(form)) {
      const kind = kindNamed(parser, hole);
      // Several placeholders of one grammar may name the same kind — a condition calls it `<flag>` in one shape and holds a whole condition in another — and the ids under each would be the same list under two headings.
      if (kind !== undefined) {
        if (!holding.has(kind)) holding.set(kind, hole);
        continue;
      }
      // A placeholder filled from a closed set of words is those words: the comparisons are part of what a condition is written with, not a list an author picks an id from.
      const held = inner[hole];
      if (held !== undefined && closed(held)) for (const word of held.forms) words.add(word);
    }
  }
  return { words: [...words], names: [...holding].map(([kind, hole]) => ({ hole, kind })) };
}

export const said = (...parts: (string | undefined)[]): string | undefined => {
  const held = parts.filter((part) => part !== undefined);
  return held.length === 0 ? undefined : held.join(' — ');
};

// What a line names beyond what its own placeholders say. A hole already called after its kind has nothing to add; a hole that holds a grammar of its own, or whose own line puts something other than an id there, as `<weight>` puts `3x`, takes an id as well as what it shows.
export function namesKind(written: Written): string | undefined {
  const held = written.holds?.() ?? {};
  const spoken = (holesIn(written.form, written.example) ?? []).flatMap((hole) => {
    const kind = kindNamed(written, hole.name);
    if (kind === undefined || hole.name.split(' ').includes(kind)) return [];
    return [`${BARE.test(valueIn(written.example, hole)) && held[hole.name] === undefined ? 'names' : 'may instead name'} a # ${kind}`];
  });
  return spoken.length === 0 ? undefined : [...new Set(spoken)].join(', ');
}

const addressOffers = (known: readonly Addressed[], kinds: ReadonlySet<string>, before: string, typed: string, family?: string): Offer[] =>
  known
    .filter((each) => kinds.has(each.kind) && namesFrom(each.address, typed))
    .map((each) => ({ form: each.address, insert: `${before}${each.address}`, kind: each.kind, module: each.module ?? null, ...(family === undefined ? {} : { family }) }))
    .sort((a, b) => a.form.localeCompare(b.form));

const KEYED = /^(?<key>[a-z][a-z0-9 -]*?):[ \t]*/;

const oneOf = (parser: Parser<unknown>): Parser<unknown> => ('element' in parser ? (parser as ListParser<unknown>).element : parser);

// The field a line is written under, and what it says its values hold. What the field says stands over what its parser says, since one parser writes the values of fields that name different kinds.
function fieldNamed(owner: Section, written: string, alone: boolean): { key: string | null; parser: Parser<unknown> | null; filled: Filled } {
  const schema = owner.schema;
  if (schema === undefined) return { key: null, parser: null, filled: {} };
  const key = KEYED.exec(written)?.groups?.key;
  const found = Object.entries(schema.fields).find(([name, spec]) => (key === undefined ? name === schema.clauses : !isPositionalField(schema, name) && (spec.keyword ?? name) === key));
  if (found === undefined) return { key: null, parser: null, filled: {} };
  const parser = found[1].parser as Parser<unknown>;
  return { key: key ?? null, parser: alone ? oneOf(parser) : parser, filled: { ...filledBy(parser), ...filledBy(found[1]) } };
}

// One shape a line could still turn into, read against the text written under the keyword it sits after.
interface Shape extends Filled {
  form: string;
  example: string;
  under: string;
  against: string;
  family?: string;
  note?: string;
  // The first line of the block this shape opens, since a line that opens one and is handed over without it is refused for holding nothing.
  opens?: string;
}

const shapeOf = (written: Written, under: string, against: string, family?: string): Shape => ({ form: written.form, example: written.example, under, against, ...(written.block?.()[0]?.example === undefined ? {} : { opens: written.block()[0]!.example }), ...((family ?? written.family) === undefined ? {} : { family: family ?? written.family }), ...(written.note === undefined ? {} : { note: written.note }), ...filledBy(written) });

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

// Where the cursor stands. What one line of this shape puts in that hole is the nearest thing to a value an author can be shown, and a hole the shape's own example leaves out has nothing but its name to give.
function fillingHole(found: { shape: Shape; read: Alignment }): { form: string; hole: string; like?: string } | undefined {
  const open = found.read.open;
  if (open === null) return undefined;
  const holes = holesIn(found.shape.form, found.shape.example) ?? [];
  const hole = holes[found.read.holes.length - 1]?.name === open.name ? holes[found.read.holes.length - 1] : holes.find((each) => each.name === open.name);
  if (hole === undefined) return { form: found.shape.form, hole: open.name };
  return { form: found.shape.form, hole: hole.name, like: valueIn(found.shape.example, hole) };
}

// What the author has already put in another hole of the line being written, which is how a line that says one hole names whatever another one holds is read.
const wroteIn = (found: { shape: Shape; read: Alignment }) => (hole: string): string | undefined => {
  const at = found.read.holes.find((each) => each.name === hole);
  return at === undefined || at === found.read.open ? undefined : valueIn(found.shape.against, at);
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

  const head = headingAbove(text, lineStart);
  const kind = head === undefined ? undefined : opens(head.line);
  const owner = kind === undefined ? undefined : sectionFor(kind);
  if (owner === undefined || head === undefined) return NOTHING;

  const indent = INDENT.exec(before)![0].length;
  const opening = CLAUSE.exec(before.slice(indent));
  const from = lineStart + indent + (opening === null ? 0 : opening.index + opening[0].length);
  const typed = text.slice(from, at);
  const tail = text.slice(at, lineEnd);
  const to = at + (tail.indexOf(',') < 0 ? tail.length : tail.indexOf(','));

  const trailing = TRAILING_ID.exec(typed)![0];
  const continuing = opening !== null && opening[0].startsWith(',');
  const written = continuing ? text.slice(lineStart + indent, from) : typed;
  const field = fieldNamed(owner, written, true);
  const under = field.key === null || continuing ? '' : (KEYED.exec(written)?.[0] ?? '');
  const left = typed.slice(under.length);
  const held = asRead(`${text.slice(0, lineStart)}${text.slice(lineEnd)}`);
  const here = linesAt(owner, text, lineStart, indent);
  const alongside = continuing ? 'one more value' : field.key === null ? 'what goes here' : `what ${field.key}: takes`;
  const lines = here.lines.filter((written) => written.needs === undefined || held === undefined || held[written.needs] !== undefined);

  const shapes: Shape[] = [
    ...(continuing || under !== '' ? [] : lines).map((line) => shapeOf(line, '', typed)),
    ...(field.parser === null ? [] : field.parser.forms).map((form) => shapeOf({ form, example: exampleOf(form, field.parser!.examples) ?? form, ...field.filled }, under, left, alongside)),
  ];
  const line = text.slice(lineStart, lineEnd);
  const reads = readAs(here.lines, line.trim());
  const read = reading(shapes);
  const shown = narrowed(read);
  // Where the engine has already read the whole line as one shape, the cursor stands in that shape, whether or not another shape spells out one character more of it. Two shapes the line has spelt nothing of are otherwise told apart by which was declared first, which is no answer at all.
  const stood = standing(read.filter((each) => each.shape.form === reads)) ?? standing(shown);
  const filling = stood === undefined ? undefined : fillingHole(stood);

  // What the hole under the cursor names is what its own line says it names, which is the same answer wherever that line is written and whatever the token happens to be part of.
  const naming = stood === undefined || filling === undefined ? undefined : kindNamed(stood.shape, filling.hole, wroteIn(stood));

  // A shape the line has spelt out but not finished is being written, not broken; anything else is handed to the engine, whose word on it is the only honest one.
  const refused =
    line.trim() === '' || (stood !== undefined && !stood.read.complete && stood.read.spelt > 0)
      ? null
      : refusalAt(text.slice(head.at), { start: lineStart - head.at, end: lineEnd - head.at }, here.lines.find((line) => line.form === reads)?.block?.(), indent, at - head.at);
  // A shape a refused line has spelt none of is not what it is being written as; saying so would be guessing over the engine's own word. A shape that opens with a placeholder has nothing to spell before it, so a line standing in that first placeholder has spelt all of it there was to spell.
  const openedWith = stood?.read.open !== null && stood?.read.open.start === 0;
  const filled = filling === undefined || (refused !== null && stood!.read.spelt === 0 && !openedWith) ? undefined : filling;
  // The one shape the cursor is standing inside, which the path above the offers already names. The shapes are offered to be chosen between, so where this is the only one still standing there is nothing left to choose and the hole's own values are the answer.
  const writing = filled === undefined ? undefined : stood!.shape.form;
  // What a hole holds where it holds a grammar rather than a name, which its own line says: the same answer wherever that hole is written.
  const holding = stood === undefined || filled === undefined ? undefined : stood.shape.holds?.()[filled.hole];
  const holdings = holding === undefined ? undefined : heldBy(holding);
  // What the author has typed of the hole they are standing in. An address is written with dots in it, so the token runs back through them — but no further than the hole it fills: in `use: item.a-mod` the id being written is `a-mod`.
  const reached = stood === undefined || stood.read.open === null ? 0 : stood.shape.under.length + stood.read.open.start;
  const started = typed.slice(0, Math.max(typed.length - trailing.length, Math.min(reached, typed.length)));
  const token = typed.slice(started.length);
  return {
    from,
    to,
    where: here.where,
    reads,
    filling: filled === undefined ? null : { form: filled.form, hole: filled.hole, ...(filled.like === undefined ? {} : { like: filled.like }), ...(naming === undefined ? {} : { kind: naming }), ...(holdings === undefined ? {} : { holds: holdings }) },
    refused,
    undeclared: undeclaredAt(text, lineStart, known),
    // A shape whose words are the ones already written would put back what it replaced, and an author who has written them is being offered nothing.
    offers: deduped([
      // A hole broken into what it may name puts each kind under the placeholder that names it, so `<flag>` and `<item>` are told apart under an `if` rather than heaped together.
      ...(holdings === undefined
        ? addressOffers(known, new Set(naming === undefined ? [] : [naming]), started, token)
        : holdings.names.flatMap((each) => addressOffers(known, new Set([each.kind]), started, token, `<${each.hole}>`))),
      ...(shown.length === 1 && shown[0]!.shape.form === writing ? [] : shown)
        .map(({ shape }) => {
          // The heading already names the kind under the cursor; a shape that only names the same one has nothing left to add.
          const names = namesKind({ form: `${shape.under}${shape.form}`, example: `${shape.under}${shape.example}`, ...filledBy(shape) });
          return offerFor(shape.form, shape.family, said(shape.note, names === `names a # ${naming}` || names === `may instead name a # ${naming}` ? undefined : names));
        })
        .filter((offer) => offer.insert !== text.slice(from, to)),
    ]),
  };
}

// The ids one line names that nothing in the universe declares. The page asks it of the line under the cursor and a draft asks it of every line it has, and it is the same question either way.
export function undeclaredAt(text: string, lineStart: number, known: readonly Addressed[]): readonly Undeclared[] {
  if (text.slice(lineStart, lineStart + 1) === '#') return [];
  const head = headingAbove(text, lineStart);
  const kind = head === undefined ? undefined : opens(head.line);
  if (head === undefined || kind === undefined || sectionFor(kind) === undefined) return [];
  const broken = text.indexOf('\n', lineStart);
  const line = text.slice(lineStart, broken < 0 ? text.length : broken);
  const indent = INDENT.exec(line)![0].length;
  return undeclaredIn(around(head.line, enclosing(text, lineStart, indent), line), known);
}

// Everything standing between a draft and the engine taking it, gathered so an author can work down a list rather than hunt for the line.
export interface Amiss {
  line: number;
  written: string;
  refused: string | null;
  undeclared: readonly Undeclared[];
}

export function amissIn(text: string, known: readonly Addressed[]): Amiss[] {
  const said = new Map(refusalsIn(text).map((each) => [each.line, each.refused]));
  const out: Amiss[] = [];
  let at = 0;
  for (const [index, written] of text.split('\n').entries()) {
    const refused = said.get(index + 1) ?? null;
    // The cursor's whole question is not asked here: a draft is read line by line, and asking what may be typed at the end of every one of them is the same answer over again at the cost of the whole document each time.
    const undeclared = undeclaredAt(text, at, known);
    if (refused !== null || undeclared.length > 0) out.push({ line: index + 1, written, refused, undeclared });
    at += written.length + 1;
  }
  return out;
}

export const applied = (text: string, offering: Offering, offer: Offer): { text: string; cursor: number } => ({
  text: `${text.slice(0, offering.from)}${offer.insert}${text.slice(offering.to)}`,
  cursor: offering.from + offer.insert.length,
});
