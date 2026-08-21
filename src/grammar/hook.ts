import { ActionResult, hookResultList } from './actionResult';
import { Field } from './section';

export interface HookCarrier {
  onHit: ActionResult[];
  whenHit: ActionResult[];
}

export const HOOK_FIELDS: {
  [K in keyof HookCarrier]: Field<ActionResult[], unknown>;
} = {
  onHit: {
    parser: hookResultList,
    keyword: 'on hit',
    note: 'when a swing of this carrier lands on someone',
    default: () => [],
    block: true,
  },
  whenHit: {
    parser: hookResultList,
    keyword: 'when hit',
    note: 'when a swing lands on this carrier',
    default: () => [],
    block: true,
  },
};

export const HOOK_LABELS: readonly string[] = Object.values(HOOK_FIELDS).map((field) => field.keyword!);

const CARRIED = 'is carried by a character rather than by a verb — write it on the `# entity` or `# item` that carries it, because an action is the verb and is shared by everyone who performs it';

const AIMED = 'was never implemented — there is one `on hit:` per carrier, read off the character carrying it, and a result that reaches the other party says so itself, as in `drain: 3 health from them`';
const STRUCK = 'was never implemented — the moment a swing lands on the carrier is `when hit:`, and it is read off the carrier like the other one';

const RETIRED_MOMENTS: readonly string[] = ['on struck'];
const RECIPIENTS: readonly string[] = ['self', 'me', 'them'];

const RETIRED_HOOK_LABELS: Readonly<Record<string, string>> = Object.fromEntries([...RETIRED_MOMENTS.map((moment) => [moment, STRUCK]), ...[...HOOK_LABELS, ...RETIRED_MOMENTS].flatMap((moment) => RECIPIENTS.map((recipient) => [`${moment} ${recipient}`, AIMED]))]);

export function hookLabelProblem(label: string): string | undefined {
  if (HOOK_LABELS.includes(label)) return `${label}: ${CARRIED}`;
  const retired = RETIRED_HOOK_LABELS[label];
  return retired === undefined ? undefined : `${label}: ${retired}`;
}

export const HOOK_FIELD_REFUSALS: readonly {
  label: RegExp;
  message: string;
}[] = [...HOOK_LABELS, ...Object.keys(RETIRED_HOOK_LABELS)].map((label) => ({
  label: new RegExp(`${label}:[ \\t]*`),
  message: hookLabelProblem(label)!,
}));
