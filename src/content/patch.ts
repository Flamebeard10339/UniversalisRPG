import { DslError } from '../grammar/parser';
import { AnySchema, clearedBy, FieldSite, PrintContext, fieldSites, isEntryRemoval, isFieldEdits, parseSection, writeEdits, writeField } from '../grammar/section';
import { RawSection, splitSections } from '../grammar/structure';
import { applyEdits, composeEdits } from './merge';

// A section written as only the fields it means. Everything the language does with one is already
// settled — `mergeFields` lays those fields over whatever the id already holds and leaves the rest
// alone — so what is written here is the other direction: folding a patch back into the section that
// declared the id, without disturbing a line the patch did not name.
export interface Patched {
  text: string;
  // The patch itself, standing in for the whole section, because it said something no patcher can lay
  // in line by line. A caller that writes the text and asks nothing further does what every caller did
  // before patches existed, which is why the flag is the thing that is optional and not the text.
  whole?: true;
}

export type Patching = Patched | { refused: string };

export const refused = (patching: Patching): patching is { refused: string } => 'refused' in patching;

export const travelsWhole = (patching: Patching): boolean => !refused(patching) && patching.whole === true;

const NEWLINE = '\n';

interface Read {
  raw: RawSection;
  sites: FieldSite[];
  authored: Record<string, unknown>;
}

const CONTEXT: PrintContext = { moduleId: '', id: '', authored: () => true };

function read(text: string, schema: AnySchema): Read | { refused: string } {
  let split: RawSection[];
  try {
    split = splitSections(text);
  } catch (error) {
    if (error instanceof DslError) return { refused: error.message };
    throw error;
  }
  if (split.length !== 1) return { refused: `one # ${schema.kind} at a time, not ${split.length}` };
  const [raw] = split;
  if (raw.kind !== schema.kind) return { refused: `expected # ${schema.kind}, got # ${raw.kind}` };
  try {
    return { raw, sites: fieldSites(raw, schema), authored: parseSection(raw, schema as never) as Record<string, unknown> };
  } catch (error) {
    if (error instanceof DslError) return { refused: error.message };
    throw error;
  }
}

// Two sites are the same one written twice when they are the same field, and — for an entry, of which
// a kind has one field and any number — the same label under it.
const sitesOf = (read: Read, site: Pick<FieldSite, 'field' | 'label'>): FieldSite[] =>
  read.sites.filter((each) => each.field === site.field && each.label === site.label);

// Whether the entry this site is takes one away rather than writing one. Where it is written says
// nothing about that; the parser read it as a removal, and the entry it read is looked up by its label.
const takesAway = (read: Read, schema: AnySchema, label: string): boolean =>
  ((read.authored[schema.entries?.into ?? ''] as { label: string }[] | undefined) ?? []).some((entry) => entry.label === label && isEntryRemoval(entry));

// Where a line the declaration does not write is written in: after the last field the schema puts
// before it, and under the heading when there is none. The order a kind's fields are written in is
// the schema's, so a line a patch puts in lands where that kind would have written it — and an entry,
// which that kind's printer writes under every field it declares, lands under everything standing.
function insertAt(declared: Read, text: string, schema: AnySchema, site: FieldSite): number {
  if (site.label !== undefined) return declared.raw.span.end;
  const order = Object.keys(schema.fields);
  const before = order.slice(0, order.indexOf(site.field));
  const ends = declared.sites.filter((each) => before.includes(each.field)).map((each) => each.end);
  const after = ends.length > 0 ? Math.max(...ends) : declared.raw.span.start;
  const line = text.indexOf(NEWLINE, after);
  return line < 0 ? text.length : line;
}

const alone = (text: string, site: FieldSite): boolean => {
  const start = text.lastIndexOf(NEWLINE, site.start - 1) + 1;
  return text.slice(start, site.start).trim() === '' && text.slice(site.end).split(NEWLINE)[0]!.trim() === '';
};

interface Edit {
  start: number;
  end: number;
  text: string;
}

// A field taken out altogether — two runs of edits that cancelled, or a second writing of a field the
// first has already answered for. A field that had a line to itself takes the line with it; one
// written beside another leaves the line and the comma that led to it.
function struck(text: string, site: FieldSite): Edit {
  if (!alone(text, site)) return { start: text.lastIndexOf(',', site.start) + 1 || site.start, end: site.end, text: '' };
  const start = text.lastIndexOf(NEWLINE, site.start - 1);
  return { start: start < 0 ? 0 : start, end: site.end, text: '' };
}

// A field written whole goes home as the author wrote it. One written with `+` or `-` depends on
// what it is going home to: over a section that holds the list, the two are resolved and the list is
// written out afresh; over another patch, there is no list yet to resolve against, so the two runs of
// edits are said as one and stay edits.
function linesFor(site: FieldSite, from: Read, into: Read, schema: AnySchema, patch: string): string[] {
  const held = from.authored[site.field];
  if (!isFieldEdits(held)) return sitesOf(from, site).map((each) => patch.slice(each.start, each.end));
  const standing = into.authored[site.field];
  if (isFieldEdits(standing)) return writeEdits(schema, site.field, composeEdits(standing, held));
  return writeField(schema, site.field, applyEdits(standing, held), CONTEXT);
}

// The patch's fields, gathered by the line the author wrote them on, so fields written beside each
// other go in beside each other.
function byLine(read: Read): FieldSite[][] {
  const groups = new Map<number, FieldSite[]>();
  for (const site of read.sites) {
    const at = read.raw.body.findIndex((line) => line.span.start <= site.start && site.start <= line.span.end);
    groups.set(at, [...(groups.get(at) ?? []), site]);
  }
  return [...groups.entries()].sort(([left], [right]) => left - right).map(([, sites]) => sites);
}

// Several fields taken out at once. A line whose every field is going goes with them; a line that
// keeps one loses the others where they stand. Struck one at a time, `x: 1, y: 1, z: 2` left the
// commas that had held them apart behind.
function strikeAll(text: string, read: Read, going: ReadonlySet<FieldSite>): Edit[] {
  return byLine(read).flatMap((group) => {
    const cut = group.filter((site) => going.has(site));
    if (cut.length === 0) return [];
    if (cut.length < group.length) return cut.map((site) => struck(text, site));
    const start = text.lastIndexOf(NEWLINE, Math.min(...group.map((site) => site.start)) - 1);
    return [{ start: start < 0 ? 0 : start, end: Math.max(...group.map((site) => site.end)), text: '' }];
  });
}

export function patchedInto(declared: string, patch: string, schema: AnySchema): Patching {
  const into = read(declared, schema);
  if ('refused' in into) return into;
  const from = read(patch, schema);
  if ('refused' in from) return from;

  // An entry written where one of the same label already stands does not replace it: the two are laid
  // over each other key by key, from inside a body grammar that keeps no sites for a patcher to write
  // between. That is the one thing a patch cannot say line by line, so the patch stands whole instead.
  const laidOver = from.sites.find((site) => site.label !== undefined && !takesAway(from, schema, site.label) && sitesOf(into, site).length > 0);
  if (laidOver !== undefined) return { text: patch, whole: true };

  const edits: Edit[] = [];
  const struckAt = new Set<number>();
  for (const group of byLine(from)) {
    // An entry the patch takes away leaves nothing of itself behind: what goes home is the unwriting
    // of the entry at home, and a label nothing at home holds unwrites nothing.
    const away = group.filter((site) => site.label !== undefined && takesAway(from, schema, site.label));
    for (const site of away) {
      for (const home of sitesOf(into, site)) {
        if (struckAt.has(home.start)) continue;
        struckAt.add(home.start);
        edits.push(struck(declared, home));
      }
    }
    const writing = group.filter((site) => !away.includes(site));
    if (writing.length === 0) continue;

    const missing = writing.every((site) => sitesOf(into, site).length === 0);
    if (away.length === 0 && missing && writing.every((site) => !isFieldEdits(from.authored[site.field]))) {
      const at = insertAt(into, declared, schema, writing[0]!);
      const written = patch.slice(Math.min(...writing.map((site) => site.start)), Math.max(...writing.map((site) => site.end)));
      edits.push({ start: at, end: at, text: NEWLINE + written });
      continue;
    }

    for (const site of writing) {
      const written = linesFor(site, from, into, schema, patch).join(NEWLINE);
      const [first, ...rest] = sitesOf(into, site);
      if (first === undefined) {
        const at = insertAt(into, declared, schema, site);
        edits.push({ start: at, end: at, text: NEWLINE + written });
        continue;
      }
      if (written.includes(NEWLINE) && !alone(declared, first)) {
        return { refused: `${site.field} is written beside another field on one line, so it cannot take a block; give it a line of its own first` };
      }
      edits.push(written === '' ? struck(declared, first) : { start: first.start, end: first.end, text: written });
      for (const spent of rest) edits.push(struck(declared, spent));
    }
  }

  // A field written strikes the fields it cannot stand beside, so a patch saying where a place is
  // takes away how it stood to another rather than folding home a section that refuses to load.
  const cleared = clearedBy(schema, from.sites.map((site) => site.field));
  if (cleared.length > 0) edits.push(...strikeAll(declared, into, new Set(into.sites.filter((site) => cleared.includes(site.field)))));

  let written = declared;
  // Last edit first, and where two begin together the one that takes something out goes before the one
  // that puts something in — otherwise a field struck from the line a new field is written on takes
  // the new field away with it.
  for (const edit of [...edits].sort((left, right) => right.start - left.start || right.end - left.end)) written = written.slice(0, edit.start) + edit.text + written.slice(edit.end);
  return { text: written };
}
