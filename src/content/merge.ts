import { Dialogue, DialogueNode } from './dialogue';
import { SCHEMAS } from './module';
import { AnySchema } from '../grammar/section';

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

function mergeEntries(into: Labelled[], from: Labelled[]): Labelled[] {
  const merged = [...into];
  for (const entry of from) {
    const at = merged.findIndex((existing) => existing.label === entry.label);
    if (at === -1) merged.push(entry);
    else merged[at] = overlay(merged[at], entry) as Labelled;
  }
  return merged;
}

function mergeAuthored(into: Fields, from: Fields, schema: AnySchema): Fields {
  const entries = schema.entries?.into as string | undefined;
  const merged = { ...into };
  for (const [key, value] of Object.entries(from)) {
    merged[key] = key === entries && into[key] !== undefined ? mergeEntries(into[key] as Labelled[], value as Labelled[]) : value;
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
  if (into === undefined) return from;
  if (kind === 'dialogue') return mergeDialogue(into as Dialogue, from as Dialogue);

  const schema = SCHEMAS[kind];
  return schema ? mergeAuthored(into as Fields, from as Fields, schema) : from;
}
