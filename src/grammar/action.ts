import { ActionResult, actionResult, parseResultLine, resultGrammar, resultLines, resultList, spansLines, startsResult } from './actionResult';
import { Condition, condition } from './condition';
import { HOOK_FIELD_REFUSALS, hookLabelProblem } from './hook';
import { filledBy } from './codec';
import { paired } from './form';
import { list, ListParser } from './list';
import { Cursor, DslError, Filled, Parser, requireEnd, Span, Written } from './parser';
import { EntryBody } from './section';
import { RawLine, hasBlock, indentLines, takeBlock } from './structure';
import { KEYWORDS, keywordsIn, keywordsOn, TagClause, tagClause, withoutKeywords, type KeywordOn } from './tagClause';
import { decimal, DECIMAL, id, number, parseSided, printSided, refuseRange, side, SIDE_MARK, SIDES, sideOf, type Side, type Sided } from './values';

export type ActionKind = 'duration' | KeywordOn<'action'>;

export { side, SIDES, sideOf, type Side, type Sided };

export interface Contest {
  left: Sided;
  right?: Sided | number;
}

export const isFixed = (half: Sided | number | undefined): half is number => typeof half === 'number';

export interface Action {
  label: string;
  generatedLabel?: true;
  kind?: ActionKind;
  requires?: Condition;
  hiddenIf?: Condition;
  tags?: TagClause[];
  results: ActionResult[];
  onSuccess?: ActionResult[];
  onRefused?: ActionResult[];
  onAttemptsExhausted?: ActionResult[];
  time?: number;
  rate?: number | Sided;
  accuracy?: Contest;
  damage?: Contest;
  depletes?: Sided;
  attempts?: number;
  stopsOn?: string[];
  rewardScale?: string;
  appended?: string[];
}

const results = resultList;
const tagClauses = list(tagClause);

const TAGGED_ACTION_KINDS = keywordsOn('action');

const RETIRED_ACTION_TAGS: Readonly<Record<string, string>> = {
  once: 'tag "once" was never implemented — gate the action with `hidden if: <flag>` and `set:` that flag among its results',
  repeating: 'tag "repeating" was renamed — write `continuous`',
  retaliates: 'tag "retaliates" was retired — one two-sided action is brought by whoever swings, so an entity retaliates with the actions it `uses:` and nothing marks a block as the owner\'s own',
};

export const actionKind = (action: Action): ActionKind => action.kind ?? 'duration';

const printContest = (value: Contest): string => (value.right === undefined ? printSided(value.left) : `${printSided(value.left)} vs ${isFixed(value.right) ? value.right : printSided(value.right)}`);

function parseContest(cursor: Cursor): Contest {
  const left = parseSided(cursor);
  if (cursor.take(/[ \t]+vs[ \t]+/) === null) return { left };
  return { left, right: cursor.peek(/\d/) === null ? parseSided(cursor) : number.parse(cursor) };
}

const sidedIn = (hole: string, examples: readonly string[]): Parser<Sided> => ({
  parse: parseSided,
  print: printSided,
  holds: () => ({ side }),
  forms: [`<${hole}>`, `<side>${SIDE_MARK}<${hole}>`],
  examples,
});

const contest: Parser<Contest> = {
  parse: parseContest,
  print: printContest,
  holds: () => ({ side }),
  forms: ['[<side>.]<stat>[ vs [<side>.]<stat>]', '[<side>.]<stat> vs <number>'],
  examples: ['attack vs defence', 'us.attack vs them.defence', 'felling', 'cooking vs 120'],
  notes: {
    '[<side>.]<stat> vs <number>':
      'contested against a fixed difficulty rather than against somebody, which is what a craft wants: nothing stands across the bench to read a stat off, so the recipe says how hard it is itself',
  },
};

const depleted = sidedIn('resource', ['health', 'them.health']);

type ActionValue = (cursor: Cursor, line: RawLine, label: string) => unknown;

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

export const seconds: Parser<number> = { parse: (cursor) => decimal.parse(cursor), print: (value) => decimal.print(value), forms: ['<seconds>'], examples: ['3', '1.5'] };

export const perMinute: Parser<number | Sided> = {
  parse(cursor) {
    const raw = cursor.take(DECIMAL);
    return raw === null ? parseSided(cursor) : Number(raw);
  },
  print: (value) => (typeof value === 'number' ? String(value) : printSided(value)),
  holds: () => ({ side }),
  names: { 'per minute': 'stat' },
  forms: ['<per minute>', '[<side>.]<stat>'],
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

const eventNamed: Parser<string> = { ...id, forms: ['<event>'], examples: ['level-up', 'core.level-up'] };

const statNamed: Parser<string> = { ...id, forms: ['<stat>'], examples: ['luck'], names: { stat: 'stat' } };

const stoppers = list(eventNamed);

const blockOf = (parser: Parser<unknown>): ListParser<unknown> | undefined => ('element' in parser ? (parser as ListParser<unknown>) : undefined);

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

export const ATTEMPTS_BUDGET =
  'a budget for one cycle: an action that runs once ends when it is spent, while a `continuous` one runs its `on attempts exhausted:` and begins its next cycle';

const WHILE_IT_RUNS =
  'read again on every cycle of an action already under way, not only when it is taken up — so an action gated on something its own body sets runs until it sets it and stops there, which is how a lock is picked until it opens';

const ACTION_FIELDS: readonly (Filled & {
  written: string;
  label: RegExp;
  name: keyof Omit<Action, 'label' | 'results'>;
  parser: Parser<unknown>;
  family: string;
  note?: string;
})[] = [
  { written: 'requires', label: /(?:requires|require):[ \t]*/, name: 'requires', parser: optionalCondition, family: 'offered when', note: WHILE_IT_RUNS },
  {
    written: 'hidden if',
    label: /hidden if:[ \t]*/,
    name: 'hiddenIf',
    parser: optionalCondition,
    family: 'offered when',
    note: `the action is not offered at all while this holds, rather than offered and refused. ${WHILE_IT_RUNS}`,
  },
  {
    written: 'on success',
    label: /on success:[ \t]*/,
    name: 'onSuccess',
    parser: results,
    family: 'and afterwards',
    note: 'runs after the body of a cycle that completed, and the body runs with it — the two together are what completing means',
  },
  {
    written: 'on refused',
    label: /on refused:[ \t]*/,
    name: 'onRefused',
    parser: results,
    family: 'and afterwards',
    note: 'runs instead of the body where the action is turned away before it begins — a `requires:` that does not hold, a thing that is not here, an input it has not got — and writing it is what says those words in the world rather than the engine saying them plainly. A cast that missed, a lock that did not open, a check inside the body falling the wrong way: none of those is this, and `on attempts exhausted:` is the one that is',
  },
  {
    written: 'on attempts exhausted',
    label: /on attempts exhausted:[ \t]*/,
    name: 'onAttemptsExhausted',
    parser: results,
    family: 'and afterwards',
    note: 'runs where a cycle spends its `attempts:` without completing, and at no other ending: an action called off, or one ended by a gate of its own coming to hold, reaches none of these three',
  },
  { written: 'time', label: /time:[ \t]*/, name: 'time', parser: seconds, family: 'how long it takes' },
  { written: 'rate', label: /rate:[ \t]*/, name: 'rate', parser: perMinute, family: 'how long it takes' },
  { written: 'accuracy', label: /accuracy:[ \t]*/, name: 'accuracy', parser: contest, family: 'what it is contested on' },
  { written: 'damage', label: /damage:[ \t]*/, name: 'damage', parser: contest, family: 'what it is contested on' },
  { written: 'depletes', label: /depletes:[ \t]*/, name: 'depletes', parser: depleted, family: 'what it is contested on' },
  { written: 'attempts', label: /attempts:[ \t]*/, name: 'attempts', parser: positiveCount, family: 'how long it takes', note: ATTEMPTS_BUDGET },
  { written: 'stops on', label: /stops on:[ \t]*/, name: 'stopsOn', parser: stoppers, family: 'how long it takes' },
  {
    written: 'rewards scaled by',
    label: /rewards scaled by:[ \t]*/,
    name: 'rewardScale',
    parser: statNamed,
    family: 'what it pays',
    note: 'read off the player as a percentage over what is written, so 0 pays what the lines say and 100 pays twice it. It reaches every amount this action hands over, wherever that amount was written — a `give:` of its own, a row of a `one of:`, a `# droptable` it rolls — so no list has to know the stat exists, and a world weighing its haul by one stat and its xp by another declares two stats and names each on the action that pays it',
  },
];

const ACTION_READERS = ACTION_FIELDS.map((field) => ({ ...field, read: readsWith(field.written, field.parser) }));

const RETIRED_ACTION_FIELDS: readonly { label: RegExp; message: string }[] = [
  {
    label: /speed:[ \t]*/,
    message: 'speed: was retired — write rate: for attempts per minute, either a number or the stat holding one',
  },
  {
    label: /evasion:[ \t]*/,
    message: 'evasion: was retired — it is the right half of one line, `accuracy: us.accuracy vs them.evasion`',
  },
  {
    label: /ability:[ \t]*/,
    message: 'ability: was retired — it is the left half of one line, `damage: us.attack vs them.defense`',
  },
  {
    label: /dr:[ \t]*/,
    message: 'dr: was retired — it is the right half of one line, `damage: us.attack vs them.defense`',
  },
  {
    label: /target:[ \t]*/,
    message: 'target: was retired — write `depletes: them.<pool>` for the pool a landed hit reduces',
  },
  {
    label: /escape after[ \t]+/,
    message: `escape after was retired — write \`attempts: N\`, which is ${ATTEMPTS_BUDGET}`,
  },
  {
    label: /on escape:[ \t]*/,
    message: 'on escape: was retired — write `on attempts exhausted:`, which runs when `attempts:` ran out before the action completed',
  },
  ...HOOK_FIELD_REFUSALS,
];

function parseActionLine(line: RawLine, action: Omit<Action, 'label'>, label: string): void {
  const cursor = new Cursor(line.text, 0, line.span.start);
  parseActionField(line, cursor, action, label);
  requireEnd(cursor, 'an action field');
}

const APPENDABLE: ReadonlySet<string> = new Set(['requires', 'hidden if', 'on success', 'on refused', 'on attempts exhausted', 'stops on']);

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
    if (held.right !== undefined && !isFixed(held.right)) found.push({ written, value: held.right });
  }
  if (action.depletes) found.push({ written: 'depletes', value: action.depletes });
  return found;
}

export const isTwoSided = (action: Action): boolean => sidedFields(action).some((field) => field.value.side !== undefined);

export const isFight = (action: Action): action is Action & { depletes: Sided } => isTwoSided(action) && action.depletes !== undefined;

export function assembledActionProblem(action: Action): string | undefined {
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
  if (unmarked) return `${unmarked.written}: ${unmarked.value.id} names no side — write ${SIDES.map((side) => `${side}${SIDE_MARK}${unmarked.value.id}`).join(' or ')}, because this action already names one`;
  return undefined;
}

export const actionProblem = (label: string, problem: string): string => `action ${JSON.stringify(label)}: ${problem}`;

function checkTags(action: Omit<Action, 'label'>, label: string, span: RawLine['span'] | undefined): void {
  for (const tag of action.tags ?? []) {
    if (tag.kind === 'duration') throw new DslError(actionProblem(label, 'a duration clause paces nothing on an action — write `time: <seconds>` or `rate: <per minute>`'), span);
  }
  for (const word of keywordsIn(action.tags ?? [], TAGGED_ACTION_KINDS).beyond) {
    const retired = RETIRED_ACTION_TAGS[word];
    throw new DslError(actionProblem(label, retired ?? `unknown tag ${JSON.stringify(word)} — an action's bare tags are ${TAGGED_ACTION_KINDS.join(', ')}`), span);
  }
}

function resolveKind(action: Omit<Action, 'label'>, label: string, lines: RawLine[]): ActionKind | undefined {
  const span = lines[0]?.span;
  checkTags(action, label, span);
  const tagged = keywordsIn(action.tags ?? [], TAGGED_ACTION_KINDS).taken;
  if (tagged.length > 1) throw new DslError(actionProblem(label, `cannot be both ${tagged.join(' and ')}`), span);

  const problem = assembledActionProblem({ ...action, label, kind: tagged[0] });
  if (problem) throw new DslError(actionProblem(label, problem), span);
  return tagged[0];
}

function refuseHookLabel(label: string, span: Span | undefined): void {
  const problem = hookLabelProblem(label);
  if (problem !== undefined) throw new DslError(problem, span);
}

const KIND_LINES: readonly Written[] = TAGGED_ACTION_KINDS.map((kind) => ({
  form: kind,
  example: kind,
  family: 'how long it takes',
  note: assembledActionProblem({ label: '', kind, results: [] }) ?? KEYWORDS[kind].does,
}));

const CLAUSES = 'what it is worth to whoever performs it, while it is under way';

const untaken = (): string[] => paired(tagClause.forms, tagClause.examples).flatMap((example, at) => (example === undefined || takesClause(example) ? [] : [`\`${tagClause.forms[at]!}\``]));

const CLAUSE_NOTE = (): string | undefined => {
  const refused = untaken();
  if (refused.length === 0) return undefined;
  const shapes = refused.length === 1 ? refused[0]! : `${refused.slice(0, -1).join(', ')} and ${refused[refused.length - 1]!}`;
  return `in every shape but ${shapes}, none of which an action reads: a bare word on an action is one of the paces above and nothing else, and it has no moment to roll a duration`;
};

const firstTaken = (): number => paired(tagClause.forms, tagClause.examples).findIndex((example) => example !== undefined && takesClause(example));

function takesClause(example: string): boolean {
  try {
    checkTags({ results: [], tags: tagClauses.parse(new Cursor(example)) }, '', undefined);
    return true;
  } catch {
    return false;
  }
}

const clauseLines = (): readonly Written[] =>
  paired(tagClause.forms, tagClause.examples).flatMap((example, at) => {
    if (example === undefined) return [];
    try {
      checkTags({ results: [], tags: tagClauses.parse(new Cursor(example)) }, '', undefined);
    } catch {
      return [];
    }
    return [{ form: tagClause.forms[at]!, example, family: CLAUSES, of: 'tag', ...(at === firstTaken() ? { note: CLAUSE_NOTE() } : {}), ...filledBy(tagClause) }];
  });

const actionFieldLines = (): readonly Written[] =>
  ACTION_FIELDS.flatMap((field) => {
    const said = { family: field.family, ...(field.note === undefined ? {} : { note: field.note }), ...filledBy(field.parser), ...filledBy(field) };
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
    action.onRefused?.length ||
    action.onAttemptsExhausted?.length ||
    (action.kind !== undefined && action.kind !== 'duration') ||
    action.time !== undefined ||
    action.rate !== undefined ||
    action.accuracy ||
    action.damage ||
    action.depletes ||
    action.attempts !== undefined ||
    action.stopsOn?.length ||
    action.rewardScale !== undefined;

  if (!modifiers && action.results.length === 1 && !spansLines(action.results)) return [`${action.label}: ${resultList.print(action.results)}`];

  const appended = new Set(action.appended ?? []);
  const at = (name: keyof Action): string => (appended.has(name) ? '  +' : '  ');
  const lines: string[] = [`${action.label}:`];
  if (action.requires) lines.push(`${at('requires')}requires: ${condition.print(action.requires)}`);
  if (action.hiddenIf) lines.push(`${at('hiddenIf')}hidden if: ${condition.print(action.hiddenIf)}`);
  if (action.kind !== undefined && action.kind !== 'duration') lines.push(`  ${action.kind}`);
  const tags = withoutKeywords(action.tags ?? [], TAGGED_ACTION_KINDS);
  if (tags.length > 0) lines.push(`  ${tags.map((each) => tagClause.print(each)).join(', ')}`);
  if (action.time !== undefined) lines.push(`  time: ${action.time}`);
  if (action.rate !== undefined) lines.push(`  rate: ${typeof action.rate === 'number' ? action.rate : printSided(action.rate)}`);
  if (action.accuracy) lines.push(`  accuracy: ${printContest(action.accuracy)}`);
  if (action.damage) lines.push(`  damage: ${printContest(action.damage)}`);
  if (action.depletes) lines.push(`  depletes: ${printSided(action.depletes)}`);
  if (action.attempts !== undefined) lines.push(`  attempts: ${action.attempts}`);
  if (action.stopsOn?.length) lines.push(`${at('stopsOn')}stops on: ${stoppers.print(action.stopsOn)}`);
  if (action.rewardScale !== undefined) lines.push(`  rewards scaled by: ${action.rewardScale}`);
  lines.push(...indentLines(action.results.flatMap(resultLines)));
  for (const name of ['onSuccess', 'onRefused', 'onAttemptsExhausted'] as const) {
    printResultBlock(lines, `${at(name)}${writtenAs(name)}`, action[name], 4);
  }
  return lines;
}

const writtenAs = (name: keyof Omit<Action, 'label' | 'results'>): string => ACTION_FIELDS.find((field) => field.name === name)!.written;

export const actionResultLists = (action: Action): ActionResult[][] => [action.results, action.onSuccess, action.onRefused, action.onAttemptsExhausted].filter((list): list is ActionResult[] => list !== undefined);

export interface Contested {
  ours: string;
  theirs: string;
}

export interface FightShape {
  rate: string;
  accuracy: Contested;
  damage: Contested;
  pool: string;
}

const sidedId = (held: unknown): string | undefined => (typeof held === 'object' && held !== null && 'id' in held ? String((held as { id: unknown }).id) : undefined);

export function fightShapeOf(action: Action): FightShape | undefined {
  if (!isFight(action) || action.accuracy === undefined || action.damage === undefined) return undefined;
  const rate = typeof action.rate === 'object' ? sidedId(action.rate) : undefined;
  const [hitOurs, hitTheirs] = [sidedId(action.accuracy.left), sidedId(action.accuracy.right)];
  const [hurtOurs, hurtTheirs] = [sidedId(action.damage.left), sidedId(action.damage.right)];
  const pool = sidedId(action.depletes);
  if (!rate || !hitOurs || !hitTheirs || !hurtOurs || !hurtTheirs || !pool) return undefined;
  return { rate, accuracy: { ours: hitOurs, theirs: hitTheirs }, damage: { ours: hurtOurs, theirs: hurtTheirs }, pool };
}
