import { ActionResult, hookResultList } from './actionResult';
import { Field } from './section';

// The two moments a character can answer, read off the character carrying them.
// Neither names a side, an action or a weapon: a carrier with two ways to swing
// writes one `on hit:` for both.
export interface HookCarrier {
  onHit?: ActionResult[];
  whenHit?: ActionResult[];
}

// The pair as section fields, spread into the schema of every kind that carries
// a character modifier, so a new carrier joins by spreading this rather than by
// growing a second spelling of the same two blocks.
export const HOOK_FIELDS: { [K in keyof Required<HookCarrier>]: Field<ActionResult[] | undefined, unknown> } = {
  onHit: { parser: hookResultList, keyword: 'on hit' },
  whenHit: { parser: hookResultList, keyword: 'when hit' },
};

export const HOOK_LABELS: readonly string[] = Object.values(HOOK_FIELDS).map((field) => field.keyword!);

const CARRIED = 'is carried by a character rather than by a verb — write it on the `# entity` or `# item` that carries it, because an action is the verb and is shared by everyone who performs it';

// The four-block spelling an earlier plan carried, refused by name so that the
// answer to "then how do I aim one?" is on the page that asks.
const RETIRED_HOOK_LABELS: Readonly<Record<string, string>> = {
  'on hit self': 'was never implemented — there is one `on hit:` per carrier, read off the character carrying it, and a result that reaches the other party says so itself, as in `drain: 3 health from them`',
  'on hit them': 'was never implemented — there is one `on hit:` per carrier, read off the character carrying it, and a result that reaches the other party says so itself, as in `drain: 3 health from them`',
};

// Why a label that opens a result block cannot open an action, or undefined when
// it is an ordinary action label. One table, asked wherever an action body is
// read, so an action's fields and a section's labelled blocks refuse alike.
export function hookLabelProblem(label: string): string | undefined {
  if (HOOK_LABELS.includes(label)) return `${label}: ${CARRIED}`;
  const retired = RETIRED_HOOK_LABELS[label];
  return retired === undefined ? undefined : `${label}: ${retired}`;
}

export const HOOK_FIELD_REFUSALS: readonly { label: RegExp; message: string }[] = [...HOOK_LABELS, ...Object.keys(RETIRED_HOOK_LABELS)].map((label) => ({
  label: new RegExp(`${label}:[ \\t]*`),
  message: hookLabelProblem(label)!,
}));
