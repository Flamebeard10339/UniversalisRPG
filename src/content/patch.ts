import { DslError } from '../grammar/parser';
import { AnySchema, FieldSite, PrintContext, fieldSites, isFieldEdits, parseSection, writeEdits, writeField } from '../grammar/section';
import { RawSection, splitSections } from '../grammar/structure';
import { applyEdits, composeEdits } from './merge';

// A section written as only the fields it means. Everything the language does with one is already
// settled — `mergeFields` lays those fields over whatever the id already holds and leaves the rest
// alone — so what is written here is the other direction: folding a patch back into the section that
// declared the id, without disturbing a line the patch did not name.
export type Patching = { text: string } | { refused: string };

export const refused = (patching: Patching): patching is { refused: string } => 'refused' in patching;

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

const sitesOf = (read: Read, field: string): FieldSite[] => read.sites.filter((site) => site.field === field);

// Where a field the declaration does not write is written in: after the last field the schema puts
// before it, and under the heading when there is none. The order a kind's fields are written in is
// the schema's, so a line a patch puts in lands where that kind would have written it.
function insertAt(declared: Read, text: string, schema: AnySchema, field: string): number {
  const order = Object.keys(schema.fields);
  const before = order.slice(0, order.indexOf(field));
  const ends = declared.sites.filter((site) => before.includes(site.field)).map((site) => site.end);
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
function linesFor(field: string, from: Read, into: Read, schema: AnySchema, patch: string): string[] {
  const held = from.authored[field];
  if (!isFieldEdits(held)) return sitesOf(from, field).map((site) => patch.slice(site.start, site.end));
  const standing = into.authored[field];
  if (isFieldEdits(standing)) return writeEdits(schema, field, composeEdits(standing, held));
  return writeField(schema, field, applyEdits(standing, held), CONTEXT);
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

// Whether a section says anything a patch cannot place field by field. An entry — an action, an
// event — goes home by the label it carries rather than by where it is written, and a field site
// says nothing about labels, so a section holding one is not a patch and has to travel whole.
export function writesEntries(text: string, schema: AnySchema): boolean {
  const into = schema.entries?.into;
  if (into === undefined) return false;
  const held = read(text, schema);
  return 'refused' in held ? false : Array.isArray(held.authored[into]) && (held.authored[into] as unknown[]).length > 0;
}

export function patchedInto(declared: string, patch: string, schema: AnySchema): Patching {
  const into = read(declared, schema);
  if ('refused' in into) return into;
  const from = read(patch, schema);
  if ('refused' in from) return from;

  const edits: Edit[] = [];
  for (const group of byLine(from)) {
    const missing = group.every((site) => sitesOf(into, site.field).length === 0);
    if (missing && group.every((site) => !isFieldEdits(from.authored[site.field]))) {
      const at = insertAt(into, declared, schema, group[0]!.field);
      const written = patch.slice(Math.min(...group.map((site) => site.start)), Math.max(...group.map((site) => site.end)));
      edits.push({ start: at, end: at, text: NEWLINE + written });
      continue;
    }

    for (const site of group) {
      const written = linesFor(site.field, from, into, schema, patch).join(NEWLINE);
      const [first, ...rest] = sitesOf(into, site.field);
      if (first === undefined) {
        const at = insertAt(into, declared, schema, site.field);
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

  let written = declared;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) written = written.slice(0, edit.start) + edit.text + written.slice(edit.end);
  return { text: written };
}
