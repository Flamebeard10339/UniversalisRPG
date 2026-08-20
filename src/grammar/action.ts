import { ActionResult, parseResultLine, resultLines, resultList, spansLines, startsResult } from './actionResult';
import { Condition, condition } from './condition';
import { HOOK_FIELD_REFUSALS, hookLabelProblem } from './hook';
import { list } from './list';
import { Cursor, DslError, requireEnd, Span } from './parser';
import { EntryBody } from './section';
import { RawLine, hasBlock, indentLines, takeBlock } from './structure';
import { TagClause, tagClause } from './tagClause';
import { decimal, DECIMAL, id, refuseRange } from './values';

export type ActionKind = 'instant' | 'duration' | 'continuous';

export type Side = 'my' | 'their';

export interface Sided {
  side?: Side;
  id: string;
}

export interface Contest {
  left: Sided;
  right?: Sided;
}

export interface Action {
  label: string;
  generatedLabel?: true;
  kind?: ActionKind;
  requires?: Condition;
  hiddenIf?: Condition;
  tags?: TagClause[];
  results: ActionResult[];
  onSuccess?: ActionResult[];
  onFailure?: ActionResult[];
  onUnfinished?: ActionResult[];
  time?: number;
  rate?: number | Sided;
  accuracy?: Contest;
  damage?: Contest;
  depletes?: Sided;
  attempts?: number;
  appended?: string[];
}

const results = resultList;
const tagClauses = list(tagClause);

const TAGGED_ACTION_KINDS = ['instant', 'continuous'] as const;

const ACTION_KEYWORD_TAGS: ReadonlySet<string> = new Set<string>(TAGGED_ACTION_KINDS);

const RETIRED_ACTION_TAGS: Readonly<Record<string, string>> = {
  once: 'tag "once" was never implemented — gate the action with `hidden if: <flag>` and `set:` that flag among its results',
  repeating: 'tag "repeating" was renamed — write `continuous`',
  retaliates: 'tag "retaliates" was retired — one two-sided action is brought by whoever swings, so an entity retaliates with the actions it `uses:` and nothing marks a block as the owner\'s own',
};

export const actionKind = (action: Action): ActionKind => action.kind ?? 'duration';

export const SIDES: readonly Side[] = ['my', 'their'];

const SIDE = /(?:my|their)(?![\w-])/;

function sided(cursor: Cursor): Sided {
  const marker = cursor.take(SIDE);
  if (marker === null) return { id: id.parse(cursor) };
  cursor.take(/[ \t]+/);
  return { side: marker as Side, id: id.parse(cursor) };
}

function contest(cursor: Cursor): Contest {
  const left = sided(cursor);
  if (cursor.take(/[ \t]+vs[ \t]+/) === null) return { left };
  return { left, right: sided(cursor) };
}

type ActionValue = (cursor: Cursor, line: RawLine, label: string) => unknown;

const conditionValue: ActionValue = (cursor) => (cursor.done ? undefined : condition.parse(cursor));
const contestValue =
  (written: string): ActionValue =>
  (cursor, line, label) =>
    named(written, label, line, () => contest(cursor));
const sidedValue =
  (written: string): ActionValue =>
  (cursor, line, label) =>
    named(written, label, line, () => sided(cursor));
const resultsValue: ActionValue = (cursor, line, label) => {
  if (cursor.done) return hasBlock(line) ? results.parseBlock(takeBlock(line)) : undefined;
  const inline = results.parse(cursor);
  if (hasBlock(line)) throw new DslError(actionProblem(label, 'a result group is written inline and as a block; give it one'), line.span);
  return inline;
};

function named<T>(written: string, label: string, line: RawLine, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (!(error instanceof DslError)) throw error;
    throw new DslError(actionProblem(label, `${written}: ${error.message}`), line.span);
  }
}

const seconds: ActionValue = (cursor, line, label) => named('time', label, line, () => decimal.parse(cursor));

const perMinute: ActionValue = (cursor, line, label) =>
  named('rate', label, line, () => {
    const raw = cursor.take(DECIMAL);
    return raw === null ? sided(cursor) : Number(raw);
  });

const positiveCount =
  (written: string): ActionValue =>
  (cursor, line, label) => {
    const raw = cursor.take(/\d+/);
    if (raw === null || Number(raw) <= 0) throw new DslError(actionProblem(label, `${written} requires a positive integer`), line.span);
    named(written, label, line, () => refuseRange(cursor, 'this number is a threshold, not a quantity, so it takes one value rather than a range'));
    return Number(raw);
  };

const ACTION_FIELDS: readonly {
  written: string;
  label: RegExp;
  name: keyof Omit<Action, 'label' | 'results'>;
  value: ActionValue;
}[] = [
  {
    written: 'requires',
    label: /(?:requires|require):[ \t]*/,
    name: 'requires',
    value: conditionValue,
  },
  {
    written: 'hidden if',
    label: /hidden if:[ \t]*/,
    name: 'hiddenIf',
    value: conditionValue,
  },
  {
    written: 'on success',
    label: /on success:[ \t]*/,
    name: 'onSuccess',
    value: resultsValue,
  },
  {
    written: 'on failure',
    label: /on failure:[ \t]*/,
    name: 'onFailure',
    value: resultsValue,
  },
  {
    written: 'on unfinished',
    label: /on unfinished:[ \t]*/,
    name: 'onUnfinished',
    value: resultsValue,
  },
  { written: 'time', label: /time:[ \t]*/, name: 'time', value: seconds },
  { written: 'rate', label: /rate:[ \t]*/, name: 'rate', value: perMinute },
  {
    written: 'accuracy',
    label: /accuracy:[ \t]*/,
    name: 'accuracy',
    value: contestValue('accuracy'),
  },
  {
    written: 'damage',
    label: /damage:[ \t]*/,
    name: 'damage',
    value: contestValue('damage'),
  },
  {
    written: 'depletes',
    label: /depletes:[ \t]*/,
    name: 'depletes',
    value: sidedValue('depletes'),
  },
  {
    written: 'attempts',
    label: /attempts:[ \t]*/,
    name: 'attempts',
    value: positiveCount('attempts'),
  },
];

const RETIRED_ACTION_FIELDS: readonly { label: RegExp; message: string }[] = [
  {
    label: /speed:[ \t]*/,
    message: 'speed: was retired — write rate: for attempts per minute, either a number or the stat holding one',
  },
  {
    label: /evasion:[ \t]*/,
    message: 'evasion: was retired — it is the right half of one line, `accuracy: my accuracy vs their evasion`',
  },
  {
    label: /ability:[ \t]*/,
    message: 'ability: was retired — it is the left half of one line, `damage: my attack vs their defense`',
  },
  {
    label: /dr:[ \t]*/,
    message: 'dr: was retired — it is the right half of one line, `damage: my attack vs their defense`',
  },
  {
    label: /target:[ \t]*/,
    message: 'target: was retired — write `depletes: their <pool>` for the pool a landed hit reduces',
  },
  {
    label: /escape after[ \t]+/,
    message: "escape after was retired — write `attempts: N`, which bounds the action at N of the performer's attempts",
  },
  {
    label: /on escape:[ \t]*/,
    message: 'on escape: was retired — write `on unfinished:`, which runs when `attempts:` ran out before the action completed',
  },
  ...HOOK_FIELD_REFUSALS,
];

function parseActionLine(line: RawLine, action: Omit<Action, 'label'>, label: string): void {
  const cursor = new Cursor(line.text, 0, line.span.start);
  parseActionField(line, cursor, action, label);
  requireEnd(cursor, 'an action field');
}

const APPENDABLE: ReadonlySet<string> = new Set(['requires', 'hidden if', 'on success', 'on failure', 'on unfinished']);

function parseActionField(line: RawLine, cursor: Cursor, action: Omit<Action, 'label'>, label: string): void {
  const held = action as Record<string, unknown>;
  const beforePlus = cursor.pos;
  const appends = cursor.take(/\+[ \t]*/) !== null;
  for (const retired of RETIRED_ACTION_FIELDS) {
    if (cursor.take(retired.label) !== null) throw new DslError(actionProblem(label, retired.message), line.span);
  }
  for (const field of ACTION_FIELDS) {
    if (cursor.take(field.label) === null) continue;
    if (held[field.name] !== undefined) throw new DslError(actionProblem(label, `${field.written} is defined more than once`), line.span);
    if (appends && !APPENDABLE.has(field.written)) throw new DslError(actionProblem(label, `${field.written} holds one value, so + has nothing to add to — write it bare to replace what this block overlays`), line.span);
    const value = field.value(cursor, line, label);
    if (value !== undefined) held[field.name] = value;
    if (appends) action.appended = (action.appended ?? []).concat(field.name);
    return;
  }
  if (appends) cursor.pos = beforePlus;

  if (startsResult(cursor)) {
    action.results.push(...parseResultLine(line));
    cursor.pos = line.text.length;
  } else {
    action.tags = (action.tags ?? []).concat(tagClauses.parse(cursor));
  }
}

const isSided = (value: number | Sided | undefined): value is Sided => typeof value === 'object' && value !== null;

export function sidedFields(action: Action): { written: string; value: Sided }[] {
  const found: { written: string; value: Sided }[] = [];
  if (isSided(action.rate)) found.push({ written: 'rate', value: action.rate });
  for (const [written, held] of [
    ['accuracy', action.accuracy],
    ['damage', action.damage],
  ] as const) {
    if (!held) continue;
    found.push({ written, value: held.left });
    if (held.right) found.push({ written, value: held.right });
  }
  if (action.depletes) found.push({ written: 'depletes', value: action.depletes });
  return found;
}

export const sideOf = (field: Sided, self: string, other: string): string => (field.side === 'their' ? other : self);

export const isTwoSided = (action: Action): boolean => sidedFields(action).some((field) => field.value.side !== undefined);

export function actionTableProblem(action: Action): string | undefined {
  const cadence = [action.time !== undefined && 'time:', action.rate !== undefined && 'rate:'].filter((written): written is string => written !== false);
  if (cadence.length > 1) return 'time: and rate: are the same axis written two ways; give one';

  const kind = actionKind(action);
  if (kind === 'instant' && cadence.length > 0) return `an instant action takes no ${cadence[0]}`;
  if (kind === 'continuous' && cadence.length === 0) return 'a continuous action needs a time: or rate: to set its pace';

  const written = action.time !== undefined ? 'time:' : 'rate:';
  const value = action.time ?? (typeof action.rate === 'number' ? action.rate : undefined);
  if (value !== undefined && !(value > 0)) return `${written} must be positive — something that takes no time carries no cadence at all`;

  if (!isTwoSided(action)) return undefined;
  const unmarked = sidedFields(action).find((field) => field.value.side === undefined);
  if (unmarked) return `${unmarked.written}: ${unmarked.value.id} names no side — write ${SIDES.map((side) => `${side} ${unmarked.value.id}`).join(' or ')}, because this action already names one`;
  return undefined;
}

export function assembledActionProblem(action: Action): string | undefined {
  const problem = actionTableProblem(action);
  if (problem) return problem;
  if (isTwoSided(action) && !action.depletes) return 'a side-naming action with nothing to deplete is not a contest — write `depletes: their <pool>`';
  return undefined;
}

export const actionProblem = (label: string, problem: string): string => `action ${JSON.stringify(label)}: ${problem}`;

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

function refuseHookLabel(label: string, span: Span | undefined): void {
  const problem = hookLabelProblem(label);
  if (problem !== undefined) throw new DslError(problem, span);
}

export const actionBody: EntryBody = {
  parse: (cursor, label) => {
    refuseHookLabel(label, {
      start: cursor.abs(cursor.pos),
      end: cursor.abs(cursor.src.length),
    });
    return { results: results.parse(cursor) };
  },
  parseBlock: (lines, label) => {
    refuseHookLabel(label, lines[0]?.span);
    const action: Omit<Action, 'label'> = { results: [] };
    for (const line of lines) parseActionLine(line, action, label);
    const kind = resolveKind(action, label, lines);
    return kind === undefined ? action : { ...action, kind };
  },
};

function printResultBlock(lines: string[], label: string, values: readonly ActionResult[] | undefined, childSpaces = 2): void {
  if (!values || values.length === 0) return;
  lines.push(`${label}:`, ...indentLines(values.flatMap(resultLines), childSpaces));
}

const printSided = (value: Sided): string => (value.side === undefined ? value.id : `${value.side} ${value.id}`);

const printContest = (value: Contest): string => (value.right === undefined ? printSided(value.left) : `${printSided(value.left)} vs ${printSided(value.right)}`);

export function actionLines(action: Action): string[] {
  const modifiers =
    action.requires ||
    action.hiddenIf ||
    action.tags?.length ||
    action.onSuccess?.length ||
    action.onFailure?.length ||
    action.onUnfinished?.length ||
    (action.kind !== undefined && action.kind !== 'duration') ||
    action.time !== undefined ||
    action.rate !== undefined ||
    action.accuracy ||
    action.damage ||
    action.depletes ||
    action.attempts !== undefined;

  if (!modifiers && action.results.length === 1 && !spansLines(action.results)) return [`${action.label}: ${resultList.print(action.results)}`];

  const appended = new Set(action.appended ?? []);
  const at = (name: keyof Action): string => (appended.has(name) ? '  +' : '  ');
  const lines: string[] = [`${action.label}:`];
  if (action.requires) lines.push(`${at('requires')}requires: ${condition.print(action.requires)}`);
  if (action.hiddenIf) lines.push(`${at('hiddenIf')}hidden if: ${condition.print(action.hiddenIf)}`);
  if (action.kind !== undefined && action.kind !== 'duration') lines.push(`  ${action.kind}`);
  const lifted = new Set(['instant', 'continuous']);
  const tags = (action.tags ?? []).filter((each) => each.kind !== 'keyword' || !lifted.has(each.value));
  if (tags.length > 0) lines.push(`  ${tags.map((each) => tagClause.print(each)).join(', ')}`);
  if (action.time !== undefined) lines.push(`  time: ${action.time}`);
  if (action.rate !== undefined) lines.push(`  rate: ${typeof action.rate === 'number' ? action.rate : printSided(action.rate)}`);
  if (action.accuracy) lines.push(`  accuracy: ${printContest(action.accuracy)}`);
  if (action.damage) lines.push(`  damage: ${printContest(action.damage)}`);
  if (action.depletes) lines.push(`  depletes: ${printSided(action.depletes)}`);
  if (action.attempts !== undefined) lines.push(`  attempts: ${action.attempts}`);
  lines.push(...indentLines(action.results.flatMap(resultLines)));
  printResultBlock(lines, `${at('onSuccess')}on success`, action.onSuccess, 4);
  printResultBlock(lines, `${at('onFailure')}on failure`, action.onFailure, 4);
  printResultBlock(lines, `${at('onUnfinished')}on unfinished`, action.onUnfinished, 4);
  return lines;
}
