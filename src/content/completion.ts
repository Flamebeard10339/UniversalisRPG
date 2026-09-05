import { align, bare, exampleOf, holeNames, holesIn, soleHole, valueIn, type Alignment } from '../grammar/form';
import { elementOf } from '../grammar/list';
import { DslError, type Filled, type Parser, type Span, type Written } from '../grammar/parser';
import { DEFAULT_CONTEXT, isPositionalField, typoOf } from '../grammar/section';
import { indentLines, REFERENCE, splitSections } from '../grammar/structure';
import { addressedNote, EVERY_SECTION, parseSectionOf, Section, sectionFor, sectionKinds } from './sections';
import { PLUS_BY_NAME } from './merge';
import { namesSection, sameSection } from './namespace';
import { filledBy } from '../grammar/codec';

export interface Addressed {
  kind: string;
  address: string;
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

export interface Filling {
  form: string;
  hole: string;
  at: number;
  like?: string;
  kind?: string;
  holds?: Held;
}

const BARE = new RegExp(`^${REFERENCE.source}$`);

export function fillingWords(filling: Filling): string {
  const named = filling.kind === undefined ? '' : `a # ${filling.kind}`;
  if (filling.like === undefined) return `<${filling.hole}>${named === '' ? '' : ` — ${named}`}`;
  if (named === '' ) return `<${filling.hole}> — like ${filling.like}`;
  return BARE.test(filling.like) ? `<${filling.hole}> — ${named}` : `<${filling.hole}> — like ${filling.like}, or ${named}`;
}

export interface Undeclared {
  kind: string;
  id: string;
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
  laidOver?: string;
}

const NOTHING: Offering = { from: 0, to: 0, where: [], reads: null, filling: null, refused: null, undeclared: [], offers: [] };

const OP_KEY = /^(?<op>[+-])[ 	]*(?=[a-z][a-z0-9 -]*:)/;

const opNote = (op: string): string | undefined => EVERY_SECTION.find((line) => line.form === `${op}<line>`)?.note;

const laidOverBy = (op: string, byName: boolean): { laidOver?: string } => {
  if (byName) return { laidOver: PLUS_BY_NAME };
  const note = opNote(op);
  return note === undefined ? {} : { laidOver: `${op} ${note}` };
};

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

export const literalOf = (form: string): string => {
  const at = form.search(PLACEHOLDER);
  return at < 0 ? form : form.slice(0, at);
};

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

function linesAt(owner: Section, text: string, lineStart: number, indent: number): { lines: readonly Written[]; where: string[]; byName: boolean } {
  let lines: readonly Written[] = [...owner.grammar, ...EVERY_SECTION];
  const where = [`# ${owner.kind}`];
  let byName = false;
  for (const above of enclosing(text, lineStart, indent)) {
    const found = opened(lines, above.text);
    if (found === undefined) return { lines: [], where, byName };
    where.push(found.form);
    byName = byName || found.over === 'by name';
    lines = found.block!();
  }
  return { lines, where, byName };
}

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

export const beneath = (heading: string, above: readonly Enclosing[]): string => [heading, ...above.map((each) => `${' '.repeat(each.indent)}${each.text}`)].join('\n');

const around = (heading: string, above: readonly Enclosing[], line: string, opened: readonly string[] = []): string => [beneath(heading, above), line, ...opened].join('\n');

export function refusalOf(text: string): { at: number; refused: string } | null {
  try {
    for (const raw of splitSections(text)) {
      try {
        const parsed = parseSectionOf(raw);
        sectionFor(parsed.kind)?.build(parsed.value, DEFAULT_CONTEXT);
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        throw error.span === undefined ? new DslError(error.message, raw.span) : error;
      }
    }
    return null;
  } catch (error) {
    if (!(error instanceof DslError)) throw error;
    return { at: error.span?.start ?? 0, refused: error.message };
  }
}

export interface Refusal {
  line: number;
  column: number;
  refused: string;
}

const lineOf = (text: string, at: number): number => text.slice(0, at).split('\n').length;

const openingLineAt = (text: string, line: number): number => text.split('\n').slice(0, line - 1).reduce((sum, each) => sum + each.length + 1, 0);

const emptied = (text: string, line: number): string => text.split('\n').map((each, index) => (index + 1 === line ? '' : each)).join('\n');

function bears(text: string, line: number): boolean {
  const lines = text.split('\n');
  const written = lines[line - 1]!;
  if (written.startsWith('#')) return true;
  const indent = /^\s*/.exec(written)![0].length;
  const under = lines.slice(line).find((each) => each.trim() !== '');
  return under !== undefined && /^\s*/.exec(under)![0].length > indent;
}

export function refusalsIn(text: string): Refusal[] {
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

function refusalAt(text: string, within: Span, held: readonly Written[] | undefined, indent: number, cursor: number): string | null {
  const line = lineOf(text, within.start);
  const said = refusalsIn(text).find((each) => each.line === line);
  if (said === undefined || within.start + said.column >= cursor) return null;
  if (held === undefined) return said.refused;
  return refusalOf(`${text.slice(0, within.end)}\n${indentLines([held[0]!.example], indent + 2).join('\n')}${text.slice(within.end)}`) === null ? null : said.refused;
}

const declares = (known: readonly Addressed[], kind: string, id: string): boolean => known.some((each) => each.kind === kind && sameSection(each.address, id));

const resolves = (known: readonly Addressed[], kind: string, id: string): string | undefined => {
  const matches = known.filter((each) => each.kind === kind && namesSection(each.address, id));
  return matches.length === 1 ? matches[0]!.address : undefined;
};

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

function undeclaredIn(written: string, known: readonly Addressed[]): Undeclared[] {
  const held = new Map<string, Undeclared>();
  const answered = new Set(known.map((each) => each.kind));
  for (const each of namedIn(written, known)) {
    if (!answered.has(each.kind) || declares(known, each.kind, each.id)) continue;
    const meant = typoOf(each.id, known.filter((one) => one.kind === each.kind).map((one) => one.address));
    held.set(`${each.kind} ${each.id}`, meant === undefined ? each : { ...each, meant });
  }
  return [...held.values()];
}

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

const kindWordIn = (hole: string): string | undefined => hole.split(' ').find((word) => sectionFor(word) !== undefined);

function heldName(parser: Parser<unknown>): string | undefined {
  const alone = soleHole(parser.forms[0] ?? '');
  if (alone === undefined) return undefined;
  const said = parser.names?.[alone];
  return said === undefined ? kindWordIn(alone) : (said ?? undefined);
}

export function kindNamed(filled: Filled, hole: string, wrote: (hole: string) => string | undefined = () => undefined): string | undefined {
  const said = filled.names?.[hole];
  if (said === null) return undefined;
  const pointed = said === undefined ? undefined : soleHole(said);
  if (pointed !== undefined) {
    const written = wrote(pointed);
    return written !== undefined && sectionFor(written) !== undefined ? written : undefined;
  }
  if (said !== undefined) return said;
  const held = filled.holds?.()[hole];
  return held === undefined ? kindWordIn(hole) : heldName(held);
}

const WORD = /[^<>[\]\s]+/g;

const wordsOf = (form: string): string[] => form.replace(/<[^>]*>/g, ' ').match(WORD) ?? [];

const closed = (parser: Parser<unknown>): boolean => parser.forms.every((form) => bare(form) === form);

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
      if (kind !== undefined) {
        if (!holding.has(kind)) holding.set(kind, hole);
        continue;
      }
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



function fieldNamed(owner: Section, written: string, alone: boolean): { key: string | null; parser: Parser<unknown> | null; filled: Filled } {
  const schema = owner.schema;
  if (schema === undefined) return { key: null, parser: null, filled: {} };
  const key = KEYED.exec(written)?.groups?.key;
  const found = Object.entries(schema.fields).find(([name, spec]) => (key === undefined ? name === schema.clauses : !isPositionalField(schema, name) && (spec.keyword ?? name) === key));
  if (found === undefined) return { key: null, parser: null, filled: {} };
  const parser = found[1].parser as Parser<unknown>;
  return { key: key ?? null, parser: alone ? elementOf(parser) : parser, filled: { ...filledBy(parser), ...filledBy(found[1]) } };
}

interface Shape extends Filled {
  form: string;
  example: string;
  under: string;
  against: string;
  family?: string;
  note?: string;
  opens?: string;
}

const shapeOf = (written: Written, under: string, against: string, family?: string): Shape => ({ form: written.form, example: written.example, under, against, ...(written.block?.()[0]?.example === undefined ? {} : { opens: written.block()[0]!.example }), ...((family ?? written.family) === undefined ? {} : { family: family ?? written.family }), ...(written.note === undefined ? {} : { note: written.note }), ...filledBy(written) });

const worth = (found: Alignment): number => (found.complete ? 1000 : 0) + found.spelt;

function narrowed(read: readonly { shape: Shape; read: Alignment }[]): { shape: Shape; read: Alignment }[] {
  const most = Math.max(0, ...read.map((each) => each.read.spelt));
  return read.filter((each) => each.read.spelt === most);
}

const standing = (read: readonly { shape: Shape; read: Alignment }[]): { shape: Shape; read: Alignment } | undefined =>
  read.reduce<{ shape: Shape; read: Alignment } | undefined>((best, each) => (best === undefined || worth(each.read) > worth(best.read) ? each : best), undefined);

const reading = (shapes: readonly Shape[]): { shape: Shape; read: Alignment }[] =>
  shapes.flatMap((shape) => {
    const read = align(shape.form, shape.against);
    return read === null ? [] : [{ shape, read }];
  });

function fillingHole(found: { shape: Shape; read: Alignment }): { form: string; hole: string; like?: string } | undefined {
  const open = found.read.open;
  if (open === null) return undefined;
  const holes = holesIn(found.shape.form, found.shape.example) ?? [];
  const hole = holes[found.read.holes.length - 1]?.name === open.name ? holes[found.read.holes.length - 1] : holes.find((each) => each.name === open.name);
  if (hole === undefined) return { form: found.shape.form, hole: open.name };
  return { form: found.shape.form, hole: hole.name, like: valueIn(found.shape.example, hole) };
}

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
      filling: { form: '# <kind> <id>', hole: 'kind', at: 0, like: 'item' },
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
    filling: { form: `# ${kind} <id>`, hole: 'id', at: 0, like: `${kind}-of-your-own` },
    refused: null,
    undeclared: [],
    offers: addressOffers(known, new Set(kind === '' ? [] : [kind]), '', typed),
    ...(addressedNote(kind) === undefined ? {} : { laidOver: addressedNote(kind)! }),
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
  const laying = OP_KEY.exec(before.slice(indent));
  const keyedAt = indent + (laying === null ? 0 : laying[0].length);
  const opening = CLAUSE.exec(before.slice(keyedAt));
  const from = lineStart + keyedAt + (opening === null ? 0 : opening.index + opening[0].length);
  const typed = text.slice(from, at);
  const tail = text.slice(at, lineEnd);
  const to = at + (tail.indexOf(',') < 0 ? tail.length : tail.indexOf(','));

  const trailing = TRAILING_ID.exec(typed)![0];
  const continuing = opening !== null && opening[0].startsWith(',');
  const written = continuing ? text.slice(lineStart + keyedAt, from) : typed;
  const field = fieldNamed(owner, written, true);
  const under = field.key === null || continuing ? '' : (KEYED.exec(written)?.[0] ?? '');
  const left = typed.slice(under.length);
  const held = asRead(`${text.slice(0, lineStart)}${text.slice(lineEnd)}`);
  const here = linesAt(owner, text, lineStart, indent);
  const alongside = continuing ? 'one more value' : field.key === null ? 'what goes here' : `what ${field.key}: takes`;
  const lines = here.lines.filter((written) => written.needs === undefined || held === undefined || written.needs.some((each) => held[each] !== undefined));

  const shapes: Shape[] = [
    ...(continuing || under !== '' ? [] : lines).map((line) => shapeOf(line, '', typed)),
    ...(field.parser === null ? [] : field.parser.forms).map((form) => shapeOf({ form, example: exampleOf(form, field.parser!.examples) ?? form, ...field.filled }, under, left, alongside)),
  ];
  const line = text.slice(lineStart, lineEnd);
  const reads = readAs(here.lines, line.trim().slice(laying === null ? 0 : laying[0].length));
  const read = reading(shapes);
  const shown = narrowed(read);
  const stood = standing(read.filter((each) => each.shape.form === reads)) ?? standing(shown);
  const filling = stood === undefined ? undefined : fillingHole(stood);

  const naming = stood === undefined || filling === undefined ? undefined : kindNamed(stood.shape, filling.hole, wroteIn(stood));

  const refused =
    line.trim() === '' || (stood !== undefined && !stood.read.complete && stood.read.spelt > 0)
      ? null
      : refusalAt(text.slice(head.at), { start: lineStart - head.at, end: lineEnd - head.at }, here.lines.find((line) => line.form === reads)?.block?.(), indent, at - head.at);
  const openedWith = stood?.read.open !== null && stood?.read.open.start === 0;
  const filled = filling === undefined || (refused !== null && stood!.read.spelt === 0 && !openedWith) ? undefined : filling;
  const writing = filled === undefined ? undefined : stood!.shape.form;
  const holding = stood === undefined || filled === undefined ? undefined : stood.shape.holds?.()[filled.hole];
  const holdings = holding === undefined ? undefined : heldBy(holding);
  const reached = stood === undefined || stood.read.open === null ? 0 : stood.shape.under.length + stood.read.open.start;
  const started = typed.slice(0, Math.max(typed.length - trailing.length, Math.min(reached, typed.length)));
  const token = typed.slice(started.length);
  return {
    from,
    to,
    where: here.where,
    reads,
    filling: filled === undefined ? null : { form: filled.form, hole: filled.hole, at: reached, ...(filled.like === undefined ? {} : { like: filled.like }), ...(naming === undefined ? {} : { kind: naming }), ...(holdings === undefined ? {} : { holds: holdings }) },
    refused,
    undeclared: undeclaredAt(text, lineStart, known),
    ...(laying === null ? {} : laidOverBy(laying.groups!.op!, here.byName)),
    offers: deduped([
      ...(holdings === undefined
        ? addressOffers(known, new Set(naming === undefined ? [] : [naming]), started, token)
        : holdings.names.flatMap((each) => addressOffers(known, new Set([each.kind]), started, token, `<${each.hole}>`))),
      ...(shown.length === 1 && shown[0]!.shape.form === writing ? [] : shown)
        .map(({ shape }) => {
          const names = namesKind({ form: `${shape.under}${shape.form}`, example: `${shape.under}${shape.example}`, ...filledBy(shape) });
          return offerFor(shape.form, shape.family, said(shape.note, names === `names a # ${naming}` || names === `may instead name a # ${naming}` ? undefined : names));
        })
        .filter((offer) => offer.insert !== text.slice(from, to)),
    ]),
  };
}

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
