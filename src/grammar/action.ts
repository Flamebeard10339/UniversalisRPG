import { ActionResult, actionResult, parseResultLine, resultGrammar, resultLines, resultList, spansLines, startsResult } from './actionResult';
import { Condition, condition } from './condition';
import { HOOK_FIELD_REFUSALS, hookLabelProblem } from './hook';
import { filledBy } from './codec';
import { paired } from './form';
import { list, ListParser } from './list';
import { Cursor, DslError, Filled, Parser, requireEnd, Span, Written } from './parser';
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

// A side is a closed set of words, and a set of words is a parser like any other, so what an author is offered is the set the engine reads.
export const side: Parser<Side> = {
  parse(cursor) {
    const raw = cursor.take(SIDE);
    if (raw === null) throw new DslError(`expected ${SIDES.join(' or ')}`, { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return raw as Side;
  },
  print: (value) => value,
  forms: [...SIDES],
  examples: [...SIDES],
};

const printSided = (value: Sided): string => (value.side === undefined ? value.id : `${value.side} ${value.id}`);

const printContest = (value: Contest): string => (value.right === undefined ? printSided(value.left) : `${printSided(value.left)} vs ${printSided(value.right)}`);

function parseSided(cursor: Cursor): Sided {
  const marker = cursor.take(SIDE);
  if (marker === null) return { id: id.parse(cursor) };
  cursor.take(/[ \t]+/);
  return { side: marker as Side, id: id.parse(cursor) };
}

function parseContest(cursor: Cursor): Contest {
  const left = parseSided(cursor);
  if (cursor.take(/[ \t]+vs[ \t]+/) === null) return { left };
  return { left, right: parseSided(cursor) };
}

// Half a contest, and a whole line where nothing stands opposite it: `vs` is what makes a line two-sided, so a line that leaves it out is a shape of its own rather than a half-written one.
const sidedIn = (hole: string, examples: readonly string[]): Parser<Sided> => ({
  parse: parseSided,
  print: printSided,
  holds: () => ({ side }),
  forms: [`[<side> ]<${hole}>`],
  examples,
});

const contest: Parser<Contest> = {
  parse: parseContest,
  print: printContest,
  holds: () => ({ side }),
  forms: ['[<side> ]<stat>[ vs [<side> ]<stat>]'],
  examples: ['attack vs defence', 'my attack vs their defence', 'felling'],
};

const depleted = sidedIn('resource', ['their health', 'health']);

type ActionValue = (cursor: Cursor, line: RawLine, label: string) => unknown;

// A condition written into an action is one shape, and what a condition may be is the `<condition>` hole's business — the rule a result list already keeps. A keyword with nothing after it holds nothing, which is how a block overlaying another clears what it inherited.
const optionalCondition: Parser<Condition | undefined> = {
  parse: (cursor) => (cursor.done ? undefined : condition.parse(cursor)),
  print: (value) => (value === undefined ? '' : condition.print(value)),
  holds: () => ({ condition }),
  forms: ['<condition>'],
  examples: ['has-key'],
};

function named<T>(written: string, label: string, line: RawLine, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (!(error instanceof DslError)) throw error;
    throw new DslError(actionProblem(label, `${written}: ${error.message}`), line.span);
  }
}

const seconds: Parser<number> = { parse: (cursor) => decimal.parse(cursor), print: (value) => decimal.print(value), forms: ['<seconds>'], examples: ['3', '1.5'] };

const perMinute: Parser<number | Sided> = {
  parse(cursor) {
    const raw = cursor.take(DECIMAL);
    return raw === null ? parseSided(cursor) : Number(raw);
  },
  print: (value) => (typeof value === 'number' ? String(value) : printSided(value)),
  holds: () => ({ side }),
  names: { 'per minute': 'stat' },
  forms: ['<per minute>', '[<side> ]<stat>'],
  examples: ['12', 'attack-speed'],
};

const positiveCount: Parser<number> = {
  parse(cursor) {
    const raw = cursor.take(/\d+/);
    if (raw === null || Number(raw) <= 0) throw new DslError('requires a positive integer', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.src.length) });
    refuseRange(cursor, 'this number is a threshold, not a quantity, so it takes one value rather than a range');
    return Number(raw);
  },
  print: (value) => String(value),
  forms: ['<count>'],
  examples: ['3'],
};

const blockOf = (parser: Parser<unknown>): ListParser<unknown> | undefined => ('element' in parser ? (parser as ListParser<unknown>) : undefined);

// A field reads its value with the parser that shows its shapes, so what an author is offered and what the engine takes are one thing said once. A parser holding a list takes an indented block in place of its inline value, which is a fact about lists rather than about any one field.
function readsWith(written: string, parser: Parser<unknown>): ActionValue {
  const held = blockOf(parser);
  if (held === undefined) return (cursor, line, label) => named(written, label, line, () => parser.parse(cursor));
  return (cursor, line, label) => {
    if (cursor.done) return hasBlock(line) ? held.parseBlock(takeBlock(line)) : undefined;
    const inline = named(written, label, line, () => held.parse(cursor));
    if (hasBlock(line)) throw new DslError(actionProblem(label, 'a result group is written inline and as a block; give it one'), line.span);
    return inline;
  };
}

const ACTION_FIELDS: readonly (Filled & {
  written: string;
  label: RegExp;
  name: keyof Omit<Action, 'label' | 'results'>;
  parser: Parser<unknown>;
  family: string;
})[] = [
  { written: 'requires', label: /(?:requires|require):[ \t]*/, name: 'requires', parser: optionalCondition, family: 'offered when' },
  { written: 'hidden if', label: /hidden if:[ \t]*/, name: 'hiddenIf', parser: optionalCondition, family: 'offered when' },
  { written: 'on success', label: /on success:[ \t]*/, name: 'onSuccess', parser: results, family: 'and afterwards' },
  { written: 'on failure', label: /on failure:[ \t]*/, name: 'onFailure', parser: results, family: 'and afterwards' },
  { written: 'on unfinished', label: /on unfinished:[ \t]*/, name: 'onUnfinished', parser: results, family: 'and afterwards' },
  { written: 'time', label: /time:[ \t]*/, name: 'time', parser: seconds, family: 'how long it takes' },
  { written: 'rate', label: /rate:[ \t]*/, name: 'rate', parser: perMinute, family: 'how long it takes' },
  { written: 'accuracy', label: /accuracy:[ \t]*/, name: 'accuracy', parser: contest, family: 'what it is contested on' },
  { written: 'damage', label: /damage:[ \t]*/, name: 'damage', parser: contest, family: 'what it is contested on' },
  { written: 'depletes', label: /depletes:[ \t]*/, name: 'depletes', parser: depleted, family: 'what it is contested on' },
  { written: 'attempts', label: /attempts:[ \t]*/, name: 'attempts', parser: positiveCount, family: 'how long it takes' },
];

const ACTION_READERS = ACTION_FIELDS.map((field) => ({ ...field, read: readsWith(field.written, field.parser) }));

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
  for (const field of ACTION_READERS) {
    if (cursor.take(field.label) === null) continue;
    if (held[field.name] !== undefined) throw new DslError(actionProblem(label, `${field.written} is defined more than once`), line.span);
    if (appends && !APPENDABLE.has(field.written)) throw new DslError(actionProblem(label, `${field.written} holds one value, so + has nothing to add to — write it bare to replace what this block overlays`), line.span);
    const value = field.read(cursor, line, label);
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

// A pace an action may be written at, and where the engine takes that word only alongside another line, its own refusal is what the page says beside it. Filtering the word out instead left `continuous` in the corpus three times and on no page an author could read it off.
const KIND_LINES: readonly Written[] = TAGGED_ACTION_KINDS.map((kind) => {
  const caveat = actionTableProblem({ label: '', kind, results: [] });
  return { form: kind, example: kind, family: 'how long it takes', ...(caveat === undefined ? {} : { note: caveat }) };
});

// A bare clause on an action holds on whoever is performing it while it runs, which is what the part it stands under says. Which clauses those are is asked of `checkTags`, which is what refuses one, rather than listed here — so a clause an action starts or stops taking reaches the page with it.
const CLAUSES = 'what it is worth to whoever performs it, while it is under way';

const clauseLines = (): readonly Written[] =>
  paired(tagClause.forms, tagClause.examples).flatMap((example, at) => {
    if (example === undefined) return [];
    try {
      checkTags({ results: [], tags: tagClauses.parse(new Cursor(example)) }, '', undefined);
    } catch {
      return [];
    }
    return [{ form: tagClause.forms[at]!, example, family: CLAUSES, ...filledBy(tagClause) }];
  });

// What a field's parser reads is what its lines offer. The shapes are the parser's own, so a shape the engine takes and the page will not show is not a thing that can be written here.
const actionFieldLines = (): readonly Written[] =>
  ACTION_FIELDS.flatMap((field) => {
    // What the field says its placeholders hold stands over what the parser says, since one parser writes the values of fields that name different kinds.
    const said = { family: field.family, ...filledBy(field.parser), ...filledBy(field) };
    const held = blockOf(field.parser);
    return [
      ...paired(field.parser.forms, field.parser.examples).flatMap((example, at) => (example === undefined ? [] : [{ form: `${field.written}: ${field.parser.forms[at]!}`, example: `${field.written}: ${example}`, ...said }])),
      ...(held === undefined ? [] : [{ form: `${field.written}:`, example: `${field.written}:`, ...said, block: held.lines }]),
    ];
  });

export const actionLinesWritten = (): readonly Written[] => [
  ...actionFieldLines(),
  ...KIND_LINES,
  ...clauseLines(),
  ...resultGrammar(),
];

export const actionBody: EntryBody = {
  grammar: [
    // An action's label is the name it is given here, not one it looks up, so the placeholder that reads like a kind names nothing.
    { form: '<action>: <result>, …', example: 'chop-wood: give: log', family: 'an action', names: { action: null }, holds: () => ({ result: actionResult }) },
    { form: '<action>:', example: 'chop-wood:', family: 'an action', names: { action: null }, block: actionLinesWritten },
  ],
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

export const actionResultLists = (action: Action): ActionResult[][] => [action.results, action.onSuccess, action.onFailure, action.onUnfinished].filter((list): list is ActionResult[] => list !== undefined);
