import { ActionResult, parseResultLine, resultList, startsResult } from './actionResult';
import { Condition, condition } from './condition';
import { list } from './list';
import { Cursor, DslError, requireEnd } from './parser';
import { EntryBody } from './section';
import { RawLine } from './structure';
import { TagClause, tagClause } from './tagClause';
import { decimal, id, numberOrStat, refuseRange } from './values';

// What ends the action, which is a different question from how fast it attempts.
export type ActionKind = 'instant' | 'duration' | 'continuous';

export interface Action {
  label: string;
  // Absent is `duration`, and absent is what an untagged action records — so a
  // block overriding a template's action inherits the kind it did not restate.
  kind?: ActionKind;
  requires?: Condition;
  hiddenIf?: Condition;
  tags?: TagClause[];
  results: ActionResult[];
  onSuccess?: ActionResult[];
  onFailure?: ActionResult[];
  onEscape?: ActionResult[];
  // The cadence, one axis in two spellings: `time` is seconds per attempt and
  // `rate` is attempts per minute, where a string names a stat read live. At
  // most one, and absent on a `duration` action defers to the tuning variable.
  time?: number;
  rate?: number | string;
  // Stat ids, read live, each absent meaning the neutral default.
  accuracy?: string;
  evasion?: string;
  ability?: string;
  // Naming a pool is what makes an action a fight rather than a fixed count of hits.
  target?: string;
  dr?: string;
  escapeAfter?: number;
  // The owner's own move in an encounter, never offered to the player.
  retaliates?: boolean;
}

const results = resultList;
const tagClauses = list(tagClause);

// Bare tags lifted onto the field they name; extending this list adds another.
const BOOLEAN_ACTION_FLAGS = ['retaliates'] as const;
type BooleanActionField = (typeof BOOLEAN_ACTION_FLAGS)[number];
const BOOLEAN_ACTION_FLAG_SET: ReadonlySet<string> = new Set<string>(BOOLEAN_ACTION_FLAGS);

// The kinds an author writes. `duration` is what an untagged action is, so it
// has no tag to write and naming it would give one kind two spellings.
const TAGGED_ACTION_KINDS = ['instant', 'continuous'] as const;

// Every bare word an action's tag list may hold. The set is closed because a
// word an action keeps and never reads cannot be told apart from a typo, and a
// mistyped kind would silently mean `duration`.
const ACTION_KEYWORD_TAGS: ReadonlySet<string> = new Set<string>([...TAGGED_ACTION_KINDS, ...BOOLEAN_ACTION_FLAGS]);

// Words that meant something once, or look like they should. Each names what to
// write instead, because "unknown tag" is not an answer to "then how do I?".
const RETIRED_ACTION_TAGS: Readonly<Record<string, string>> = {
  once: 'tag "once" was never implemented — gate the action with `hidden if: <flag>` and `set:` that flag among its results',
  repeating: 'tag "repeating" was renamed — write `continuous`',
};

export const actionKind = (action: Action): ActionKind => action.kind ?? 'duration';

// Every value reader takes the label for the same reason the table check does:
// an error about an action is unreadable if it cannot say which action.
type ActionValue = (cursor: Cursor, line: RawLine, label: string) => unknown;

const conditionValue: ActionValue = (cursor) => (cursor.done ? undefined : condition.parse(cursor));
const statValue = (written: string): ActionValue => (cursor, line, label) => named(written, label, line, () => id.parse(cursor));
const resultsValue: ActionValue = (cursor, line, label) => {
  if (cursor.done) return line.children.length > 0 ? results.parseBlock(line.children) : undefined;
  const inline = results.parse(cursor);
  if (line.children.length > 0) throw new DslError(actionProblem(label, 'a result group is written inline and as a block; give it one'), line.span);
  return inline;
};

// A shared value parser reports what it expected but not what it was reading,
// and pins the span to the cursor rather than the line. Every reader below is
// wrapped so an unreadable value names its field, its action, and its line.
function named<T>(written: string, label: string, line: RawLine, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (!(error instanceof DslError)) throw error;
    throw new DslError(actionProblem(label, `${written}: ${error.message}`), line.span);
  }
}

const seconds: ActionValue = (cursor, line, label) => named('time', label, line, () => decimal.parse(cursor));

// A literal is attempts per minute; a name is the stat holding that number,
// which is what makes a haste buff move a swing without touching the action.
// Positivity is the table's business, checked once for both spellings.
const perMinute: ActionValue = (cursor, line, label) => named('rate', label, line, () => numberOrStat.parse(cursor));

const positiveCount =
  (written: string): ActionValue =>
  (cursor, line, label) => {
    const raw = cursor.take(/\d+/);
    if (raw === null || Number(raw) <= 0) throw new DslError(actionProblem(label, `${written} requires a positive integer`), line.span);
    named(written, label, line, () => refuseRange(cursor, 'this number is a threshold, not a quantity, so it takes one value rather than a range'));
    return Number(raw);
  };

// Field name as written, the label that introduces it, and how its value reads.
// One row per field is the whole shape: the once-guard and the end-of-line
// demand below are what keep a new row from inventing its own laxity.
const ACTION_FIELDS: readonly { written: string; label: RegExp; name: keyof Omit<Action, 'label' | 'results'>; value: ActionValue }[] = [
  { written: 'requires', label: /(?:requires|require):[ \t]*/, name: 'requires', value: conditionValue },
  { written: 'hidden if', label: /hidden if:[ \t]*/, name: 'hiddenIf', value: conditionValue },
  { written: 'on success', label: /on success:[ \t]*/, name: 'onSuccess', value: resultsValue },
  { written: 'on failure', label: /on failure:[ \t]*/, name: 'onFailure', value: resultsValue },
  { written: 'on escape', label: /on escape:[ \t]*/, name: 'onEscape', value: resultsValue },
  { written: 'time', label: /time:[ \t]*/, name: 'time', value: seconds },
  { written: 'rate', label: /rate:[ \t]*/, name: 'rate', value: perMinute },
  { written: 'accuracy', label: /accuracy:[ \t]*/, name: 'accuracy', value: statValue('accuracy') },
  { written: 'evasion', label: /evasion:[ \t]*/, name: 'evasion', value: statValue('evasion') },
  { written: 'ability', label: /ability:[ \t]*/, name: 'ability', value: statValue('ability') },
  { written: 'target', label: /target:[ \t]*/, name: 'target', value: statValue('target') },
  { written: 'dr', label: /dr:[ \t]*/, name: 'dr', value: statValue('dr') },
  { written: 'escape after', label: /escape after[ \t]+/, name: 'escapeAfter', value: positiveCount('escape after') },
];

// A field that was removed rather than renamed away silently: without a row
// here, `speed: cooking-speed` falls through to the tag parser and reports an
// unrecognized clause, which says nothing about where the field went.
const RETIRED_ACTION_FIELDS: readonly { label: RegExp; message: string }[] = [
  { label: /speed:[ \t]*/, message: 'speed: was retired — write rate: for attempts per minute, either a number or the stat holding one' },
];

// One field per line, and the whole line: `requireEnd` is what the generic
// section engine does by looping to the end of the line, and without it a typo
// after a value — `time: 1 typo`, `escape after 3 times` — is silently dropped.
function parseActionLine(line: RawLine, action: Omit<Action, 'label'>, label: string): void {
  const cursor = new Cursor(line.text, 0, line.span.start);
  parseActionField(line, cursor, action, label);
  requireEnd(cursor, 'an action field');
}

function parseActionField(line: RawLine, cursor: Cursor, action: Omit<Action, 'label'>, label: string): void {
  const held = action as Record<string, unknown>;
  for (const retired of RETIRED_ACTION_FIELDS) {
    if (cursor.take(retired.label) !== null) throw new DslError(actionProblem(label, retired.message), line.span);
  }
  for (const field of ACTION_FIELDS) {
    if (cursor.take(field.label) === null) continue;
    if (held[field.name] !== undefined) throw new DslError(actionProblem(label, `${field.written} is defined more than once`), line.span);
    const value = field.value(cursor, line, label);
    if (value !== undefined) held[field.name] = value;
    return;
  }

  if (startsResult(cursor)) {
    // The whole line, because a wrapper's body may be the block hanging off it,
    // and a cursor over the line's text alone cannot see one.
    action.results.push(...parseResultLine(line));
    cursor.pos = line.text.length;
  } else {
    action.tags = (action.tags ?? []).concat(tagClauses.parse(cursor));
  }
}

// The whole table, as one predicate over a finished action: a kind says what
// ends the action, and carries exactly one positive cadence or none. Returning
// the problem rather than throwing is what lets the two places an action can be
// assembled — authored, and merged onto a template — share the rule instead of
// each growing its own copy of it.
export function actionTableProblem(action: Action): string | undefined {
  const cadence = [action.time !== undefined && 'time:', action.rate !== undefined && 'rate:'].filter((written): written is string => written !== false);
  if (cadence.length > 1) return 'time: and rate: are the same axis written two ways; give one';

  const kind = actionKind(action);
  if (kind === 'instant' && cadence.length > 0) return `an instant action takes no ${cadence[0]}`;
  // Nothing else ends it, so a cadence it does not have is one the tuning
  // default would have to supply, and a default of 0 spins the resolver.
  if (kind === 'continuous' && cadence.length === 0) return 'a continuous action needs a time: or rate: to set its pace';

  const written = action.time !== undefined ? 'time:' : 'rate:';
  const value = action.time ?? (typeof action.rate === 'number' ? action.rate : undefined);
  if (value !== undefined && !(value > 0)) return `${written} must be positive — something that takes no time carries no cadence at all`;
  return undefined;
}

// Reported wherever an action is finished, so every message names the action it
// is about. A section that owns one prefixes itself; see `validateSectionActions`.
export const actionProblem = (label: string, problem: string): string => `action ${JSON.stringify(label)}: ${problem}`;

// A tag list is the one place an action accepts free-form words, so it is the
// one place a typo has nowhere to land.
function checkTags(action: Omit<Action, 'label'>, label: string, span: RawLine['span'] | undefined): void {
  for (const tag of action.tags ?? []) {
    if (tag.kind === 'duration') throw new DslError(actionProblem(label, 'a duration clause paces nothing on an action — write `time: <seconds>` or `rate: <per minute>`'), span);
    if (tag.kind !== 'keyword' || ACTION_KEYWORD_TAGS.has(tag.value)) continue;
    const retired = RETIRED_ACTION_TAGS[tag.value];
    throw new DslError(actionProblem(label, retired ?? `unknown tag ${JSON.stringify(tag.value)} — an action's bare tags are ${[...ACTION_KEYWORD_TAGS].join(', ')}`), span);
  }
}

function resolveKind(action: Omit<Action, 'label'>, label: string, lines: RawLine[]): ActionKind | undefined {
  const span = lines[0]?.span;
  checkTags(action, label, span);
  const tagged = TAGGED_ACTION_KINDS.filter((kind) => (action.tags ?? []).some((tag) => tag.kind === 'keyword' && tag.value === kind));
  if (tagged.length > 1) throw new DslError(actionProblem(label, `cannot be both ${tagged.join(' and ')}`), span);

  const problem = actionTableProblem({ ...action, label, kind: tagged[0] });
  if (problem) throw new DslError(actionProblem(label, problem), span);
  return tagged[0];
}

export const actionBody: EntryBody = {
  parse: (cursor) => ({ results: results.parse(cursor) }),
  parseBlock: (lines, label) => {
    const action: Omit<Action, 'label'> = { results: [] };
    for (const line of lines) parseActionLine(line, action, label);
    for (const tag of action.tags ?? []) {
      if (tag.kind === 'keyword' && BOOLEAN_ACTION_FLAG_SET.has(tag.value)) action[tag.value as BooleanActionField] = true;
    }
    const kind = resolveKind(action, label, lines);
    return kind === undefined ? action : { ...action, kind };
  },
};
