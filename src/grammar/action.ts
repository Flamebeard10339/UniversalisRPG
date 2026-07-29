import { ActionResult, actionResult, startsResult } from './actionResult';
import { Condition, condition } from './condition';
import { list } from './list';
import { Cursor, DslError, requireEnd } from './parser';
import { EntryBody } from './section';
import { RawLine } from './structure';
import { TagClause, tagClause } from './tagClause';
import { id } from './values';

export interface Action {
  label: string;
  requires?: Condition;
  hiddenIf?: Condition;
  tags?: TagClause[];
  results: ActionResult[];
  onSuccess?: ActionResult[];
  onFailure?: ActionResult[];
  onEscape?: ActionResult[];
  // TODO(default-duration): absent means instant, which is load-bearing — see backlog.
  time?: number;
  // Stat ids, read live, each absent meaning the neutral default.
  speed?: string;
  accuracy?: string;
  evasion?: string;
  ability?: string;
  // Naming a pool is what makes an action a fight rather than a fixed count of hits.
  target?: string;
  dr?: string;
  // Absent is 1, so an action with none of these fields completes in one hit.
  health?: number;
  escapeAfter?: number;
  repeating?: boolean;
  // The owner's own move in an encounter, never offered to the player.
  retaliates?: boolean;
}

const results = list(actionResult);
const tagClauses = list(tagClause);

// Bare tags lifted onto the field they name; extending this list adds another.
const BOOLEAN_ACTION_FLAGS = ['repeating', 'retaliates'] as const;
type BooleanActionField = (typeof BOOLEAN_ACTION_FLAGS)[number];
const BOOLEAN_ACTION_FLAG_SET: ReadonlySet<string> = new Set<string>(BOOLEAN_ACTION_FLAGS);

type ActionValue = (cursor: Cursor, line: RawLine) => unknown;

const conditionValue: ActionValue = (cursor) => (cursor.done ? undefined : condition.parse(cursor));
const statValue: ActionValue = (cursor) => id.parse(cursor);
const resultsValue: ActionValue = (cursor, line) => (!cursor.done ? results.parse(cursor) : line.children.length > 0 ? results.parseBlock(line.children) : undefined);

const nonNegative =
  (written: string): ActionValue =>
  (cursor, line) => {
    const raw = cursor.take(/\d+(?:\.\d+)?/);
    if (raw === null) throw new DslError(`action ${written} requires a non-negative number`, line.span);
    return Number(raw);
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
  { written: 'time', label: /time:[ \t]*/, name: 'time', value: nonNegative('time') },
  { written: 'speed', label: /speed:[ \t]*/, name: 'speed', value: statValue },
  { written: 'accuracy', label: /accuracy:[ \t]*/, name: 'accuracy', value: statValue },
  { written: 'evasion', label: /evasion:[ \t]*/, name: 'evasion', value: statValue },
  { written: 'ability', label: /ability:[ \t]*/, name: 'ability', value: statValue },
  { written: 'target', label: /target:[ \t]*/, name: 'target', value: statValue },
  { written: 'dr', label: /dr:[ \t]*/, name: 'dr', value: statValue },
  { written: 'health', label: /health:[ \t]*/, name: 'health', value: nonNegative('health') },
  { written: 'escape after', label: /escape after[ \t]+/, name: 'escapeAfter', value: positiveCount('escape after') },
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

export const actionBody: EntryBody = {
  parse: (cursor) => ({ results: results.parse(cursor) }),
  parseBlock: (lines) => {
    const action: Omit<Action, 'label'> = { results: [] };
    for (const line of lines) parseActionLine(line, action);
    for (const tag of action.tags ?? []) {
      if (tag.kind === 'keyword' && BOOLEAN_ACTION_FLAG_SET.has(tag.value)) {
        action[tag.value as BooleanActionField] = true;
      }
    }
    return action;
  },
};
