import { Dialogue, DialogueNode } from './dialogue';
import { SCHEMAS } from './module';
import { AnySchema, FieldEdits, isEntryRemoval, isFieldEdits, isListField } from '../grammar/section';

type Fields = Record<string, unknown>;

interface Labelled extends Fields {
  label: string;
}

// A body parser reports a list it was given no lines for as empty rather than
// absent, so an empty one in a patch means "not respecified" — the way to empty
// an entry is to remove it, not to write nothing.
const respecified = (value: unknown): boolean => value !== undefined && !(Array.isArray(value) && value.length === 0);

const overlay = (into: Fields, from: Fields): Fields => {
  const merged = { ...into };
  for (const [key, value] of Object.entries(from)) if (respecified(value)) merged[key] = value;
  return merged;
};

// A `-` names as much of a member as it takes to identify it, so an edge written
// `-adjacent: dunes` also removes the `dunes` edge that carries a condition.
function identifies(pattern: unknown, candidate: unknown): boolean {
  if (typeof pattern !== 'object' || pattern === null || typeof candidate !== 'object' || candidate === null) return pattern === candidate;
  return Object.entries(pattern).every(([key, value]) => identifies(value, (candidate as Fields)[key]));
}

// Operators apply in source order, so `+a: x` then `-a: x` leaves it absent and
// the reverse leaves it present. No reordering, no set algebra.
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

function mergeAuthored(into: Fields, from: Fields, schema: AnySchema): Fields {
  const entries = schema.entries?.into;
  const merged = { ...into };
  for (const [key, value] of Object.entries(from)) {
    if (key === entries) merged[key] = mergeEntries((into[key] as Labelled[]) ?? [], value as Labelled[]);
    else if (isListField(schema, key) && isFieldEdits(value)) merged[key] = applyEdits(into[key], value);
    else merged[key] = value;
  }
  return merged;
}

// A dialogue is addressed one node at a time, which is what keeps a one-line fix
// a two-line module. Steps within a node carry no ids to address them by, so a
// respecified node replaces them wholesale.
function mergeDialogue(into: Dialogue, from: Dialogue): Dialogue {
  const nodes = [...into.nodes];
  for (const node of from.nodes) {
    const at = nodes.findIndex((existing) => existing.name === node.name);
    if (at === -1) nodes.push(node);
    else nodes[at] = overlay(nodes[at] as unknown as Fields, node as unknown as Fields) as unknown as DialogueNode;
  }
  return { ...into, ...(from.owner !== undefined ? { owner: from.owner } : {}), nodes };
}

// The rule, whole: a section names an id, the fields it lists are applied over
// whatever that id already holds, and the fields it does not list are untouched.
// Whether the section creates or edits is not declared — it follows from whether
// the id was already there when this module loaded.
export function mergeSection(kind: string, into: object | undefined, from: object): object {
  const schema = SCHEMAS[kind];
  if (schema) return mergeAuthored((into as Fields) ?? { id: (from as { id: string }).id }, from as Fields, schema);
  if (into === undefined) return from;
  return kind === 'dialogue' ? mergeDialogue(into as Dialogue, from as Dialogue) : from;
}
