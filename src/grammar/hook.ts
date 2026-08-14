import { ActionResult, hookResultList } from './actionResult';
import { Field } from './section';

// The two moments a character can answer, read off the character carrying them.
// Neither names a side, an action or a weapon: a carrier with two ways to swing
// writes one `on hit:` for both.
export interface HookCarrier {
  onHit: ActionResult[];
  whenHit: ActionResult[];
}

// The pair as section fields, spread into the schema of every kind that carries
// a character modifier, so a new carrier joins by spreading this rather than by
// growing a second spelling of the same two blocks. Empty rather than absent,
// because the serializer prints neither and a reload could only return one of
// them — a hook a patch module emptied would not survive its own round trip.
export const HOOK_FIELDS: { [K in keyof HookCarrier]: Field<ActionResult[], unknown> } = {
  onHit: { parser: hookResultList, keyword: 'on hit', default: () => [] },
  whenHit: { parser: hookResultList, keyword: 'when hit', default: () => [] },
};

export const HOOK_LABELS: readonly string[] = Object.values(HOOK_FIELDS).map((field) => field.keyword!);

const CARRIED = 'is carried by a character rather than by a verb — write it on the `# entity` or `# item` that carries it, because an action is the verb and is shared by everyone who performs it';

const AIMED = 'was never implemented — there is one `on hit:` per carrier, read off the character carrying it, and a result that reaches the other party says so itself, as in `drain: 3 health from them`';
const STRUCK = 'was never implemented — the moment a swing lands on the carrier is `when hit:`, and it is read off the carrier like the other one';

// An earlier plan crossed two moments with two recipients and called the second
// moment `on struck`. Every cell of that cross product is refused by name, and
// derived rather than listed, because a reader who guesses one of the six that
// were never in any plan is guessing for the same reason — and a label nothing
// refuses becomes an action of that name on the carrier.
const RETIRED_MOMENTS: readonly string[] = ['on struck'];
const RECIPIENTS: readonly string[] = ['self', 'me', 'them'];

const RETIRED_HOOK_LABELS: Readonly<Record<string, string>> = Object.fromEntries([
  ...RETIRED_MOMENTS.map((moment) => [moment, STRUCK]),
  ...[...HOOK_LABELS, ...RETIRED_MOMENTS].flatMap((moment) => RECIPIENTS.map((recipient) => [`${moment} ${recipient}`, AIMED])),
]);

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
