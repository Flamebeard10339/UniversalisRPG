import { ActionResult, actionResult, startsResult } from './actionResult';
import { Condition, condition } from './condition';
import { list } from './list';
import { Cursor, DslError, requireEnd } from './parser';
import { EntryBody } from './section';
import { RawLine } from './structure';
import { TagClause, tagClause } from './tagClause';
import { decimal, id, numberOrStat } from './values';

// What ends the action, which is a different question from how fast it attempts.
export type ActionKind = 'instant' | 'duration' | 'continuous';

export interface Action {
  label: string;
  kind: ActionKind;
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

const results = list(actionResult);
const tagClauses = list(tagClause);

// Bare tags lifted onto the field they name; extending this list adds another.
const BOOLEAN_ACTION_FLAGS = ['retaliates'] as const;
type BooleanActionField = (typeof BOOLEAN_ACTION_FLAGS)[number];
const BOOLEAN_ACTION_FLAG_SET: ReadonlySet<string> = new Set<string>(BOOLEAN_ACTION_FLAGS);

// The kinds an author writes. `duration` is what an untagged action is, so it
// has no tag to write and naming it would give one kind two spellings.
const TAGGED_ACTION_KINDS = ['instant', 'continuous'] as const;
const DEFAULT_ACTION_KIND: ActionKind = 'duration';

type ActionValue = (cursor: Cursor, line: RawLine) => unknown;

const conditionValue: ActionValue = (cursor) => (cursor.done ? undefined : condition.parse(cursor));
const statValue: ActionValue = (cursor) => id.parse(cursor);
const resultsValue: ActionValue = (cursor, line) => (!cursor.done ? results.parse(cursor) : line.children.length > 0 ? results.parseBlock(line.children) : undefined);

function positiveCadence(value: number, written: string, line: RawLine): number {
  if (!(value > 0)) throw new DslError(`action ${written} must be positive — an action that takes no time is tagged instant`, line.span);
  return value;
}

const seconds: ActionValue = (cursor, line) => positiveCadence(decimal.parse(cursor), 'time', line);

// A literal is attempts per minute; a name is the stat holding that number,
// which is what makes a haste buff move a swing without touching the action.
const perMinute: ActionValue = (cursor, line) => {
  const value = numberOrStat.parse(cursor);
  return typeof value === 'number' ? positiveCadence(value, 'rate', line) : value;
};

const positiveCount =
  (written: string): ActionValue =>
  (cursor, line) => {
    const raw = cursor.take(/\d+/);
    if (raw === null || Number(raw) <= 0) throw new DslError(`action ${written} requires a positive integer`, line.span);
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
  { written: 'accuracy', label: /accuracy:[ \t]*/, name: 'accuracy', value: statValue },
  { written: 'evasion', label: /evasion:[ \t]*/, name: 'evasion', value: statValue },
  { written: 'ability', label: /ability:[ \t]*/, name: 'ability', value: statValue },
  { written: 'target', label: /target:[ \t]*/, name: 'target', value: statValue },
  { written: 'dr', label: /dr:[ \t]*/, name: 'dr', value: statValue },
  { written: 'escape after', label: /escape after[ \t]+/, name: 'escapeAfter', value: positiveCount('escape after') },
];

// A field that was removed rather than renamed away silently: without a row
// here, `speed: cooking-speed` falls through to the tag parser and reports an
// unrecognized clause, which says nothing about where the field went.
const RETIRED_ACTION_FIELDS: readonly { label: RegExp; message: string }[] = [
  { label: /speed:[ \t]*/, message: 'action speed: was retired; write rate: for attempts per minute, either a number or the stat holding one' },
];

// One field per line, and the whole line: `requireEnd` is what the generic
// section engine does by looping to the end of the line, and without it a typo
// after a value — `time: 1 typo`, `escape after 3 times` — is silently dropped.
function parseActionLine(line: RawLine, action: Omit<Action, 'label'>): void {
  const cursor = new Cursor(line.text, 0, line.span.start);
  parseActionField(line, cursor, action);
  requireEnd(cursor, 'an action field');
}

function parseActionField(line: RawLine, cursor: Cursor, action: Omit<Action, 'label'>): void {
  const held = action as Record<string, unknown>;
  for (const retired of RETIRED_ACTION_FIELDS) {
    if (cursor.take(retired.label) !== null) throw new DslError(retired.message, line.span);
  }
  for (const field of ACTION_FIELDS) {
    if (cursor.take(field.label) === null) continue;
    if (held[field.name] !== undefined) throw new DslError(`action ${field.written} is defined more than once`, line.span);
    const value = field.value(cursor, line);
    if (value !== undefined) held[field.name] = value;
    return;
  }

  if (startsResult(cursor)) {
    action.results.push(...results.parse(cursor));
  } else {
    action.tags = (action.tags ?? []).concat(tagClauses.parse(cursor));
  }
}

// The whole table: a kind says what ends the action, and carries exactly one
// cadence or none. Every combination the vocabulary allows but the model has no
// meaning for is refused here, which is the only place that can see both halves.
function resolveKind(action: Omit<Action, 'label' | 'kind'>, lines: RawLine[]): ActionKind {
  const span = lines[0]?.span;
  const tagged = TAGGED_ACTION_KINDS.filter((kind) => (action.tags ?? []).some((tag) => tag.kind === 'keyword' && tag.value === kind));
  if (tagged.length > 1) throw new DslError(`an action cannot be both ${tagged.join(' and ')}`, span);

  const cadence = [action.time !== undefined && 'time:', action.rate !== undefined && 'rate:'].filter((written): written is string => written !== false);
  if (cadence.length > 1) throw new DslError('action time: and rate: are the same axis written two ways; give one', span);

  const kind = tagged[0] ?? DEFAULT_ACTION_KIND;
  if (kind === 'instant' && cadence.length > 0) throw new DslError(`an instant action takes no ${cadence[0]}`, span);
  // Nothing else ends it, so a cadence it does not have is one the tuning
  // default would have to supply, and a default of 0 spins the resolver.
  if (kind === 'continuous' && cadence.length === 0) throw new DslError('a continuous action needs a time: or rate: to set its pace', span);
  return kind;
}

export const actionBody: EntryBody = {
  parse: (cursor) => ({ kind: DEFAULT_ACTION_KIND, results: results.parse(cursor) }),
  parseBlock: (lines) => {
    const action: Omit<Action, 'label' | 'kind'> = { results: [] };
    for (const line of lines) parseActionLine(line, action as Omit<Action, 'label'>);
    for (const tag of action.tags ?? []) {
      if (tag.kind === 'keyword' && BOOLEAN_ACTION_FLAG_SET.has(tag.value)) {
        (action as Omit<Action, 'label'>)[tag.value as BooleanActionField] = true;
      }
    }
    return { ...action, kind: resolveKind(action, lines) };
  },
};
