import { AnySchema, FieldEdits, isEntryRemoval, isFieldEdits, isListField } from '../grammar/section';

type Fields = Record<string, unknown>;

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

function applyEdits(held: unknown, edits: FieldEdits): unknown[] {
  let values = Array.isArray(held) ? [...held] : [];
  for (const { op, values: operands } of edits.ops) {
    for (const operand of operands) {
      if (op === '-') values = values.filter((value) => !identifies(operand, value));
      else if (!values.some((value) => identifies(operand, value))) values.push(operand);
    }
  }
  return values;
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
    else if (isListField(schema, key) && isFieldEdits(value)) merged[key] = applyEdits(into[key], value);
    else if (value !== undefined) merged[key] = value;
  }
  return merged;
}
