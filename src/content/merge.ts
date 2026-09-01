import { AnySchema, clearedBy, FieldEdits, isEntryRemoval, isFieldEdits, isListField } from '../grammar/section';
import type { Overwritten } from '../grammar/parser';

type Fields = Record<string, unknown>;

export const overwrittenField = (schema: AnySchema, name: string): Overwritten => (name === schema.entries?.into ? 'by name' : isListField(schema, name) ? 'listed' : 'replaced');

export const BY_NAME = 'laid over by name';

export const LAID_OVER_RULE = `a second body written at an id already there is laid over the one there keyword by keyword: a line stands in place of whatever that keyword held, and a line marked \`${BY_NAME}\` opens a body of its own that goes home by the name it is written under — a name not there yet is added, a name already there keeps every line the second body says nothing about and takes its word for every line it does write, a \`+\` line among them, and \`-<that name>\` takes the whole of it out`;

export const PLUS_BY_NAME = `the + adds nothing here — the body this line sits in is ${BY_NAME}, so the line stands in place of whatever that body already holds`;

export const WRITTEN_WHOLE_NOTE = 'a second body at one of these ids is the section, and the one already there is gone';

interface Labelled extends Fields {
  label: string;
}

const respecified = (value: unknown): boolean => value !== undefined && !(Array.isArray(value) && value.length === 0);

export const overlay = (into: Fields, from: Fields): Fields => {
  const merged = { ...into };
  for (const [key, value] of Object.entries(from)) if (respecified(value)) merged[key] = value;
  return merged;
};

function identifies(pattern: unknown, candidate: unknown): boolean {
  if (typeof pattern !== 'object' || pattern === null || typeof candidate !== 'object' || candidate === null) return pattern === candidate;
  return Object.entries(pattern).every(([key, value]) => identifies(value, (candidate as Fields)[key]));
}

// A run of list edits laid on whatever the field already holds. Over a body holding the list, the two
// are resolved and the field becomes the list; over another run of edits — a patch written over a
// patch — there is no list here to resolve against, so the two runs are said as one and stay edits.
export const laidOver = (held: unknown, edits: FieldEdits): unknown => (isFieldEdits(held) ? composeEdits(held, edits) : applyEdits(held, edits));

export function applyEdits(held: unknown, edits: FieldEdits): unknown[] {
  let values = Array.isArray(held) ? [...held] : [];
  for (const { op, values: operands } of edits.ops) {
    for (const operand of operands) {
      if (op === '-') values = values.filter((value) => !identifies(operand, value));
      else if (!values.some((value) => identifies(operand, value))) values.push(operand);
    }
  }
  return values;
}

// Two runs of list edits said as one, for a patch written over a patch. A value the later run
// settles is settled by it, so an id added and then taken away leaves nothing behind rather than
// both lines; anything the later run is silent about keeps what the earlier one said.
export function composeEdits(into: FieldEdits, from: FieldEdits): FieldEdits {
  const settled = from.ops.flatMap((each) => each.values);
  const held = into.ops.flatMap(({ op, values }) => values.filter((value) => !settled.some((later) => identifies(later, value) && identifies(value, later))).map((value) => ({ op, value })));
  const laid = [...held, ...from.ops.flatMap(({ op, values }) => values.map((value) => ({ op, value })))];
  const ops: FieldEdits['ops'] = [];
  for (const { op, value } of laid) {
    const last = ops[ops.length - 1];
    if (last?.op === op) last.values.push(value);
    else ops.push({ op, values: [value] });
  }
  return { ops };
}

function mergeEntries(into: Labelled[], from: Labelled[]): Labelled[] {
  let merged = [...into];
  for (const entry of from) {
    if (isEntryRemoval(entry)) {
      merged = merged.filter((existing) => existing.label !== entry.label);
      continue;
    }
    const at = merged.findIndex((existing) => existing.label === entry.label);
    if (at === -1) merged.push(entry);
    else merged[at] = overlay(merged[at], entry) as Labelled;
  }
  return merged;
}

export function mergeFields(into: Fields, from: Fields, schema: AnySchema): Fields {
  const entries = schema.entries?.into;
  const merged = { ...into };
  for (const [key, value] of Object.entries(from)) {
    if (key === entries) merged[key] = mergeEntries((into[key] as Labelled[]) ?? [], value as Labelled[]);
    else if (isListField(schema, key) && isFieldEdits(value)) merged[key] = laidOver(into[key], value);
    else if (value !== undefined) merged[key] = value;
  }
  for (const key of clearedBy(schema, Object.keys(from).filter((key) => from[key] !== undefined))) delete merged[key];
  return merged;
}
