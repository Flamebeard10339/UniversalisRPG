import { Condition, condition } from './condition';
import { writtenFrom } from './codec';
import { ListParser } from './list';
import { Cursor, DslError, Holds, Parser, Span, Written, calledBlock, requireEnd } from './parser';
import { range, Range, scaleRange } from './range';
import { RawLine, hasBlock, indentLines, requireNoBlock, takeBlock } from './structure';
import { countRange, decimalRange, id, numberOrStat, produced, Produced, quantified, refuseRange, REFERENCE } from './values';

export type Party = 'me' | 'them';

// The one location name the engine answers rather than a module declaring it: wherever a result
// names a location, this stands for whichever `# location` is marked `starting` at the moment the
// result runs. Nothing resolves it at load, so a module that stands nowhere may write it and a world
// that moves its starting mark moves what it means, with no module naming another module's room.
export const STARTING_LOCATION = 'starting-location';

// The screens the engine runs, and the whole of what `open modal:` may name. It is written beside the syntax because a screen is not something a module declares: a content kind holding the list could only restate this one, and the engine's own openers key off it from above.
export const MODAL_SCREENS = ['name-yourself', 'choose-race', 'carried-items', 'quest-journal', 'stat-breakdown'] as const;

export type ModalScreen = (typeof MODAL_SCREENS)[number];

export const isModalScreen = (raw: string): raw is ModalScreen => (MODAL_SCREENS as readonly string[]).includes(raw);

export const modalScreenRefusal = (raw: string): string => `a modal screen must be one of ${MODAL_SCREENS.join(', ')}, got ${JSON.stringify(raw)}`;

export type ActionResult =
  | { kind: 'say'; text: string; key?: string }
  | { kind: 'set'; variable: string }
  | { kind: 'unset'; variable: string }
  | { kind: 'add'; variable: string; amount: number }
  | { kind: 'give'; item: string; amount?: Range }
  | { kind: 'take'; item: string; amount?: number }
  | { kind: 'strip' }
  | { kind: 'xp'; skill: string; amount: Range }
  | { kind: 'relocate'; location: string }
  | { kind: 'discover'; location: string }
  | { kind: 'open-modal'; modal: ModalScreen }
  | { kind: 'pool'; resource: string; delta: Range; party?: Party }
  | { kind: 'fill'; resource: string; party?: Party }
  | { kind: 'inflict'; buff: string; party?: Party }
  | { kind: 'stop' }
  | {
      kind: 'chance';
      numerator: number;
      denominator: number;
      results: ActionResult[];
    }
  | {
      kind: 'contest';
      left: number | string;
      right: number | string;
      results: ActionResult[];
    }
  | { kind: 'gate'; condition: Condition; results: ActionResult[] }
  | { kind: 'credit'; results: ActionResult[] }
  | { kind: 'one-of'; rows: DropRow[] }
  | { kind: 'roll'; table: string };

export interface DropRow {
  weight: number | string;
  requires?: Condition;
  results: ActionResult[];
}

// What running this list once will certainly take from the player, item by item. Only what is
// written at the top level counts: everything nested sits under a chance, a contest, a gate or a
// roll and may not happen at all, so it is answered for at the moment it is reached rather than
// weighed beforehand. Everything that asks whether a list can be afforded — an action arming, a
// dialogue node being offered, a line in a menu — reads this one answer.
export function itemCost(results: readonly ActionResult[]): Map<string, number> {
  const cost = new Map<string, number>();
  for (const result of results) {
    if (result.kind === 'take') cost.set(result.item, (cost.get(result.item) ?? 0) + (result.amount ?? 1));
  }
  return cost;
}

export function nestedResults(result: ActionResult): ActionResult[][] {
  if (result.kind === 'one-of') return result.rows.map((row) => row.results);
  if (result.kind === 'chance' || result.kind === 'contest' || result.kind === 'gate' || result.kind === 'credit') return [result.results];
  return [];
}

function parseVariable(cursor: Cursor): string {
  const raw = cursor.take(REFERENCE);
  if (raw === null)
    throw new DslError('expected a variable', {
      start: cursor.abs(cursor.pos),
      end: cursor.abs(cursor.pos),
    });
  return raw;
}

function parseAdd(cursor: Cursor): ActionResult {
  const variable = parseVariable(cursor);
  cursor.take(/[ \t]+/);
  const amount = cursor.take(/-?\d+/);
  if (amount !== null) refuseRange(cursor, 'add: takes one signed count rather than a range: `-3--1` cannot be told from the hyphen that separates a range');
  return {
    kind: 'add',
    variable,
    amount: amount !== null ? Number(amount) : 1,
  };
}

// What `take:` is written with to part the player with all of it rather than with a count of one
// named thing. It is a word and not an id, so no module can declare an item that shadows it.
export const EVERYTHING = 'everything';

const EVERYTHING_TAKEN = new RegExp(`${EVERYTHING}(?![\\w-])`);

const PREPOSITION = { drain: 'from', restore: 'to', inflict: 'on' } as const;
const MOVES = {
  from: 'takes its amount away from a party',
  to: 'gives its amount to a party',
  on: 'puts what it names on a party',
} as const;

function parseParty(verb: keyof typeof PREPOSITION, cursor: Cursor): Party | undefined {
  const start = cursor.pos;
  if (cursor.peek(/[ \t]+(?:from|to|on)(?![\w-])/) === null) return undefined;
  cursor.take(/[ \t]+/);
  const preposition = cursor.take(/from|to|on/) as keyof typeof MOVES;
  cursor.take(/[ \t]+/);
  const span = { start: cursor.abs(start), end: cursor.abs(cursor.src.length) };
  const party = cursor.take(/(?:me|them)(?![\w-])/) as Party | null;
  if (party === null) throw new DslError(`${verb}: ${preposition} names a party — write \`${preposition} me\` for the character this is read off, or \`${preposition} them\` for the other`, span);
  const wanted = PREPOSITION[verb];
  if (preposition !== wanted) throw new DslError(`${verb}: ${MOVES[wanted]}, so it is written \`${wanted} ${party}\` rather than \`${preposition} ${party}\``, span);
  return party;
}

// `restore: <resource>` with no amount before it fills the pool to whatever its ceiling is at the
// moment it runs, which is the one thing a number cannot say: a ceiling a race, an item or a buff
// has moved is not a figure anybody could have written down. There is deliberately no emptying form
// until something needs one.
function parsePool(sign: 1 | -1, cursor: Cursor): ActionResult {
  if (sign > 0 && cursor.peek(/[0-9.]/) === null) {
    const resource = id.parse(cursor);
    const whole = parseParty('restore', cursor);
    return whole === undefined ? { kind: 'fill', resource } : { kind: 'fill', resource, party: whole };
  }
  const delta = decimalRange(cursor, 'an amount and a resource, as in `drain: 5 health`');
  cursor.take(/[ \t]+/);
  const resource = id.parse(cursor);
  const party = parseParty(sign < 0 ? 'drain' : 'restore', cursor);
  const pool = {
    kind: 'pool' as const,
    resource,
    delta: scaleRange(delta, sign),
  };
  return party === undefined ? pool : { ...pool, party };
}

function parseInflict(cursor: Cursor): ActionResult {
  const buff = id.parse(cursor);
  const party = parseParty('inflict', cursor);
  return party === undefined ? { kind: 'inflict', buff } : { kind: 'inflict', buff, party };
}

function parseGive(value: Produced): ActionResult {
  return value.amount === undefined ? { kind: 'give', item: value.item } : { kind: 'give', item: value.item, amount: value.amount };
}

function wrapperBody(cursor: Cursor, line: RawLine | null, what: string, span: Span): ActionResult[] {
  cursor.take(/[ \t]*/);
  if (!cursor.done) {
    const inline = parseResults(cursor, null);
    if (line !== null && hasBlock(line)) throw new DslError(`${what} is written inline and as a block; give it one`, span);
    return inline;
  }
  if (line === null || !hasBlock(line)) throw new DslError(`${what} has an empty body`, span);
  return readResultBlock(takeBlock(line));
}

const WEIGHT = /\d+x(?![\w-])/;

const RANGED_SELECTOR = /\d+-\d+x(?![\w-])|\d+(?:-\d+)?[ \t]+in[ \t]+\d+(?:-\d+)?[ \t]*:/;

function refuseRangedSelector(cursor: Cursor, span: Span): void {
  const raw = cursor.peek(RANGED_SELECTOR);
  if (raw === null || !/\d-\d/.test(raw[0])) return;
  throw new DslError(`${raw[0].replace(/[ \t]*:$/, '')} is odds, not a quantity, so it takes one number rather than a range`, span);
}

function parseRow(line: RawLine): DropRow {
  const cursor = new Cursor(line.text, 0, line.span.start);
  refuseRangedSelector(cursor, line.span);
  const literal = cursor.take(WEIGHT);
  const weight = literal !== null ? Number(literal.slice(0, -1)) : id.parse(cursor);
  const where = `one of: row ${JSON.stringify(literal ?? weight)}`;
  if (weight === 0) throw new DslError(`${where} can never be selected`, line.span);
  if (cursor.peek(/[ \t]+vs[ \t]/) !== null) throw new DslError(`${where}: a vs contest is an independent chance, not a weight — write it as a wrapper inside the row`, line.span);
  const requires = cursor.take(/[ \t]+if[ \t]+/) !== null ? condition.parse(cursor) : undefined;
  if (cursor.take(/[ \t]*:/) === null) throw new DslError(`expected a one of: row, as in \`5x: give: 20 coins\`, got ${JSON.stringify(line.text)}`, line.span);

  cursor.take(/[ \t]*/);
  if (cursor.take(/nothing[ \t]*$/) !== null) {
    if (hasBlock(line)) throw new DslError(`${where} says nothing and then holds a block`, line.span);
    return requires === undefined ? { weight, results: [] } : { weight, requires, results: [] };
  }
  const results = wrapperBody(cursor, line, where, line.span);
  return requires === undefined ? { weight, results } : { weight, requires, results };
}

function parseOneOf(cursor: Cursor, line: RawLine | null, span: Span): ActionResult {
  cursor.take(ONE_OF);
  requireEnd(cursor, 'one of:');
  if (line === null || !hasBlock(line)) throw new DslError('one of: needs indented rows, as in `5x: give: 20 coins`', span);
  return { kind: 'one-of', rows: takeBlock(line).map(parseRow) };
}

function parseChance(cursor: Cursor, line: RawLine | null, span: Span): ActionResult {
  const numerator = Number(cursor.take(/\d+/));
  cursor.take(/[ \t]+in[ \t]+/);
  const denominator = Number(cursor.take(/\d+/));
  cursor.take(/[ \t]*:/);
  if (denominator === 0) throw new DslError(`${numerator} in 0 is not a chance`, span);
  if (numerator === 0) throw new DslError(`0 in ${denominator} never happens`, span);
  if (numerator > denominator) throw new DslError(`${numerator} in ${denominator} is more than certain`, span);
  return {
    kind: 'chance',
    numerator,
    denominator,
    results: wrapperBody(cursor, line, `${numerator} in ${denominator}:`, span),
  };
}

function parseContest(cursor: Cursor, line: RawLine | null, span: Span): ActionResult {
  const left = numberOrStat.parse(cursor);
  cursor.take(/[ \t]+vs[ \t]+/);
  const right = numberOrStat.parse(cursor);
  cursor.take(/[ \t]*:/);
  return {
    kind: 'contest',
    left,
    right,
    results: wrapperBody(cursor, line, `${left} vs ${right}:`, span),
  };
}

function parseCredit(cursor: Cursor, line: RawLine | null, span: Span): ActionResult {
  cursor.take(CREDIT);
  return {
    kind: 'credit',
    results: wrapperBody(cursor, line, 'credit:', span),
  };
}

function parseGate(cursor: Cursor, line: RawLine | null, span: Span): ActionResult {
  cursor.take(/if[ \t]+/);
  const gate = condition.parse(cursor);
  if (cursor.take(/[ \t]*:/) === null) throw new DslError('an if: wrapper needs a colon after its condition', span);
  return {
    kind: 'gate',
    condition: gate,
    results: wrapperBody(cursor, line, 'if:', span),
  };
}

const SELECTOR = `(?:${REFERENCE.source}|\\d+(?:\\.\\d+)?)`;
const ONE_OF = /one of[ \t]*:/;
const CREDIT = /credit[ \t]*:/;
const CHANCE = /\d+[ \t]+in[ \t]+\d+[ \t]*:/;
const CONTEST = new RegExp(`${SELECTOR}[ \\t]+vs[ \\t]+${SELECTOR}[ \\t]*:`);
function opensGate(cursor: Cursor): boolean {
  const trial = new Cursor(cursor.src, cursor.pos, cursor.base);
  if (trial.take(/if[ \t]+/) === null) return false;
  try {
    condition.parse(trial);
  } catch {
    return false;
  }
  return trial.take(/[ \t]*:/) !== null;
}

function wrapperAt(cursor: Cursor): ((cursor: Cursor, line: RawLine | null, span: Span) => ActionResult) | null {
  if (cursor.peek(ONE_OF)) return parseOneOf;
  if (cursor.peek(CREDIT)) return parseCredit;
  if (cursor.peek(CHANCE)) return parseChance;
  if (opensGate(cursor)) return parseGate;
  if (cursor.peek(CONTEST)) return parseContest;
  return null;
}

function parseResult(cursor: Cursor): ActionResult {
  if (cursor.take(/say:[ \t]*/) !== null) return { kind: 'say', text: cursor.take(/[^\n]*/) ?? '' };
  if (cursor.take(/set[: \t][ \t]*/) !== null) return { kind: 'set', variable: parseVariable(cursor) };
  if (cursor.take(/unset[: \t][ \t]*/) !== null) return { kind: 'unset', variable: parseVariable(cursor) };
  if (cursor.take(/add:[ \t]*/) !== null) return parseAdd(cursor);
  if (cursor.take(/give:[ \t]*/) !== null) return parseGive(produced.parse(cursor));
  if (cursor.take(/take:[ \t]*/) !== null) return cursor.take(EVERYTHING_TAKEN) !== null ? { kind: 'strip' } : { kind: 'take', ...quantified.parse(cursor) };
  if (cursor.take(/roll:[ \t]*/) !== null) return { kind: 'roll', table: id.parse(cursor) };
  if (cursor.take(/inflict:[ \t]*/) !== null) return parseInflict(cursor);
  if (cursor.take(/xp:[ \t]*/) !== null) {
    const skill = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return { kind: 'xp', skill, amount: countRange(cursor, 'an xp amount') };
  }
  if (cursor.take(/drain:[ \t]*/) !== null) return parsePool(-1, cursor);
  if (cursor.take(/restore:[ \t]*/) !== null) return parsePool(1, cursor);
  if (cursor.take(/relocate:[ \t]*/) !== null) return { kind: 'relocate', location: id.parse(cursor) };
  if (cursor.take(/discover:[ \t]*/) !== null) return { kind: 'discover', location: id.parse(cursor) };
  if (cursor.take(/open modal:[ \t]*/) !== null) return parseOpenModal(cursor);
  if (cursor.take(/stop(?![\w-])/) !== null) return { kind: 'stop' };
  throw new DslError(`unrecognized action result: ${JSON.stringify(cursor.rest())}`, { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
}

function parseOpenModal(cursor: Cursor): ActionResult {
  const at = cursor.pos;
  const named = id.parse(cursor);
  if (!isModalScreen(named)) throw new DslError(modalScreenRefusal(named), { start: cursor.abs(at), end: cursor.abs(cursor.pos) });
  return { kind: 'open-modal', modal: named };
}

function parseResults(cursor: Cursor, line: RawLine | null): ActionResult[] {
  const results: ActionResult[] = [];
  do {
    cursor.take(/[ \t]*/);
    refuseRangedSelector(cursor, {
      start: cursor.abs(cursor.pos),
      end: cursor.abs(cursor.src.length),
    });
    const wrapper = wrapperAt(cursor);
    if (wrapper === null) {
      results.push(parseResult(cursor));
      continue;
    }
    const start = cursor.pos;
    results.push(
      wrapper(cursor, line, {
        start: cursor.abs(start),
        end: cursor.abs(cursor.src.length),
      }),
    );
    break;
  } while (cursor.take(/[ \t]*,[ \t]*/) !== null);
  return results;
}

const LEAF_RESULT = /(?:say|add|give|take|xp|roll|inflict|drain|restore|relocate|discover|open modal):|(?:set|unset)[: \t]|stop(?![\w-])/;

export function startsResult(cursor: Cursor): boolean {
  return cursor.peek(LEAF_RESULT) !== null || cursor.peek(RANGED_SELECTOR) !== null || wrapperAt(cursor) !== null;
}

function readResultLine(line: RawLine): ActionResult[] {
  const cursor = new Cursor(line.text, 0, line.span.start);
  const results = parseResults(cursor, line);
  requireEnd(cursor, 'a result');
  if (!results.some((result) => nestedResults(result).length > 0)) requireNoBlock(line);
  return results;
}

export function partyPhrase(result: ActionResult): string | undefined {
  if (result.kind === 'pool' && result.party !== undefined) return `${PREPOSITION[result.delta.max < 0 ? 'drain' : 'restore']} ${result.party}`;
  if (result.kind === 'inflict' && result.party !== undefined) return `${PREPOSITION.inflict} ${result.party}`;
  return undefined;
}

function firstParty(results: readonly ActionResult[]): string | undefined {
  for (const result of results) {
    const phrase = partyPhrase(result);
    if (phrase !== undefined) return phrase;
    for (const nested of nestedResults(result)) {
      const found = firstParty(nested);
      if (found) return found;
    }
  }
  return undefined;
}

function refuseParty(results: ActionResult[], span: Span): ActionResult[] {
  const found = firstParty(results);
  if (found === undefined) return results;
  throw new DslError(`\`${found}\` names one of two parties, so it reads only inside \`on hit:\` or \`when hit:\` — a list reached from anywhere else, a \`# droptable\` a hook rolls among them, has one actor and no other to name`, span);
}

export const parseResultLine = (line: RawLine): ActionResult[] => refuseParty(readResultLine(line), line.span);

export const resultBlock = (lines: readonly RawLine[]): ActionResult[] => lines.flatMap(parseResultLine);

const readResultBlock = (lines: readonly RawLine[]): ActionResult[] => lines.flatMap(readResultLine);

const printSide = (value: number | string): string => numberOrStat.print(value);

export function printResult(value: ActionResult): string {
  switch (value.kind) {
    case 'say':
      return `say: ${value.text}`;
    case 'set':
      return `set: ${value.variable}`;
    case 'unset':
      return `unset: ${value.variable}`;
    case 'add':
      return `add: ${value.variable} ${value.amount}`;
    case 'give':
      return `give: ${produced.print(value)}`;
    case 'take':
      return `take: ${quantified.print({ item: value.item, amount: value.amount })}`;
    case 'strip':
      return `take: ${EVERYTHING}`;
    case 'xp':
      return `xp: ${value.skill} ${range.print(value.amount)}`;
    case 'relocate':
      return `relocate: ${value.location}`;
    case 'discover':
      return `discover: ${value.location}`;
    case 'open-modal':
      return `open modal: ${value.modal}`;
    case 'pool': {
      const magnitude = value.delta.max < 0 ? scaleRange(value.delta, -1) : value.delta;
      const verb = value.delta.max < 0 ? 'drain' : 'restore';
      const party = value.party === undefined ? '' : ` ${PREPOSITION[verb]} ${value.party}`;
      return `${verb}: ${range.print(magnitude)} ${value.resource}${party}`;
    }
    case 'fill': {
      const party = value.party === undefined ? '' : ` ${PREPOSITION.restore} ${value.party}`;
      return `restore: ${value.resource}${party}`;
    }
    case 'inflict': {
      const party = value.party === undefined ? '' : ` ${PREPOSITION.inflict} ${value.party}`;
      return `inflict: ${value.buff}${party}`;
    }
    case 'roll':
      return `roll: ${value.table}`;
    case 'stop':
      return 'stop';
    case 'chance':
    case 'contest':
    case 'gate':
    case 'credit':
    case 'one-of':
      throw new DslError(`a ${value.kind} result spans lines and cannot be inlined`);
    default: {
      const unreached: never = value;
      return unreached;
    }
  }
}

function rowLines(row: DropRow): string[] {
  const gate = row.requires ? ` if ${condition.print(row.requires)}` : '';
  const label = `${typeof row.weight === 'string' ? row.weight : `${row.weight}x`}${gate}:`;
  if (row.results.length === 0) return [`${label} nothing`];
  return [label, ...indentLines(row.results.flatMap(resultLines))];
}

export function resultLines(value: ActionResult): string[] {
  switch (value.kind) {
    case 'chance':
      return [`${value.numerator} in ${value.denominator}:`, ...indentLines(value.results.flatMap(resultLines))];
    case 'contest':
      return [`${printSide(value.left)} vs ${printSide(value.right)}:`, ...indentLines(value.results.flatMap(resultLines))];
    case 'gate':
      return [`if ${condition.print(value.condition)}:`, ...indentLines(value.results.flatMap(resultLines))];
    case 'credit':
      return ['credit:', ...indentLines(value.results.flatMap(resultLines))];
    case 'one-of':
      return ['one of:', ...indentLines(value.rows.flatMap(rowLines))];
    default:
      return [printResult(value)];
  }
}

export const spansLines = (values: readonly ActionResult[] | undefined): boolean => (values ?? []).some((value) => nestedResults(value).length > 0);

const printResults = (values: readonly ActionResult[]): string => values.map(printResult).join(', ');

const LEAF_EXAMPLES: readonly string[] = [
  'say: the door is stuck',
  'set: found-key',
  'unset: found-key',
  'add: gold 5',
  'add: gold -3',
  'give: plank',
  'give: 5 arrow',
  'give: 5-10 arrow',
  'take: 3 plank',
  `take: ${EVERYTHING}`,
  'xp: mining 4-7',
  'relocate: camp',
  'discover: camp',
  `open modal: ${MODAL_SCREENS[0]}`,
  'drain: 5 health',
  'restore: 1-2 health',
  'restore: health',
  'inflict: dazzled',
  'roll: common-drops',
  'stop',
];

const LEAF_FORMS: readonly string[] = [
  'say: <text>',
  'set: <flag>',
  'unset: <flag>',
  'add: <variable> <number>',
  'give: <item>',
  'give: <count> <item>',
  'give: <least>-<most> <item>',
  'take: <count> <item>',
  `take: ${EVERYTHING}`,
  'xp: <skill> <amount>',
  'relocate: <place>',
  'discover: <place>',
  'open modal: <modal>',
  'drain: <amount> <resource>[ from <me or them>]',
  'restore: <amount> <resource>[ to <me or them>]',
  'restore: <resource>[ to <me or them>]',
  'inflict: <buff item>[ on <me or them>]',
  'roll: <droptable>',
  'stop',
];

// A word standing for itself: it parses as the id it is written as, and its shapes are the whole of what may be written there.
const oneOf = (called: string, forms: readonly string[], said: Partial<Parser<string>> = {}): Parser<string> => ({
  parse: (cursor) => id.parse(cursor),
  print: (value) => value,
  called,
  forms,
  examples: forms.filter((form) => !form.includes('<')),
  ...said,
});

// Where a `relocate:` or a `discover:` puts the player: a location the world declares, or the one word
// for wherever the world begins. The word is not a location anything declares, so it is said here, once,
// rather than beside every keyword that takes a place.
const place = oneOf('place', ['<location>', STARTING_LOCATION], { names: { location: 'location' }, examples: ['camp', STARTING_LOCATION] });

// The screens the engine runs. `MODAL_SCREENS` is the one home for which they are; this is the same list read as a grammar, so a screen added there is offered here.
const modalScreen = oneOf('modal', MODAL_SCREENS);

export const actionResult: Parser<ActionResult> = {
  parse: parseResult,
  print: printResult,
  names: { variable: 'flag' },
  holds: () => ({ place, modal: modalScreen }),
  forms: LEAF_FORMS,
  examples: LEAF_EXAMPLES,
};

// The parser behind a `<result>`, which is the same wherever one stands.
const RESULT: Holds = () => ({ result: actionResult });

const ROW = 'one of these';

const WEIGHTED = { names: { weight: 'stat' }, holds: () => ({ condition, result: actionResult }) };

const ROWS: readonly Written[] = [
  { form: '<weight>[ if <condition>]: <result>', example: '3x: give: plank', family: ROW, ...WEIGHTED },
  { form: '<weight>[ if <condition>]: nothing', example: '5x: nothing', family: ROW, ...WEIGHTED },
  { form: '<weight>[ if <condition>]:', example: '3x if has-key:', family: ROW, ...WEIGHTED, block: () => resultGrammar() },
];

export const HAPPENS = 'what happens';
export const SOMETIMES = 'only sometimes';

const WRAPPERS: readonly Written[] = [
  { form: 'if <condition>:', example: 'if has-key:', family: SOMETIMES, holds: () => ({ condition }), block: () => resultGrammar() },
  { form: '<chance> in <of>:', example: '3 in 10:', family: SOMETIMES, block: () => resultGrammar() },
  { form: '<stat> vs <stat>:', example: 'attack vs defence:', family: SOMETIMES, note: 'the first is read off whoever acts and the second off whoever it lands on; either may be a plain number instead, and its block runs only when the contest is won', block: () => resultGrammar() },
  { form: 'one of:', example: 'one of:', family: SOMETIMES, block: () => ROWS },
  { form: 'credit:', example: 'credit:', family: SOMETIMES, note: 'its block runs for whoever brought the action, not whoever it landed on', block: () => resultGrammar() },
];

// The same grammar wherever a result is written, so it is named here and written out once wherever the page writes it out.
export const resultGrammar = (): readonly Written[] => calledBlock('result', [...writtenFrom(actionResult).map((line) => ({ ...line, family: HAPPENS })), ...WRAPPERS]);

const RESULT_LIST_EXAMPLES: readonly string[] = [...LEAF_EXAMPLES, 'set: found-key, add: gold 5'];

// `me` and `them` read only where there are two parties to tell apart, so a list reached from anywhere else refuses them and cannot show them.
const HOOK_EXAMPLES: readonly string[] = [...RESULT_LIST_EXAMPLES, 'drain: 5 health from them', 'restore: 1-2 health to me', 'inflict: dazzled on them'];
// A result list is one shape however many results it holds; what a single result may be is the block's business, and saying it twice is what makes a grammar unreadable.
const RESULT_LIST_FORMS: readonly string[] = ['<result>, …'];

export const resultList: ListParser<ActionResult> = {
  element: actionResult,
  holds: RESULT,
  lines: resultGrammar,
  print: printResults,
  forms: RESULT_LIST_FORMS,
  examples: RESULT_LIST_EXAMPLES,
  parse: (cursor) => {
    const start = cursor.pos;
    return refuseParty(parseResults(cursor, null), {
      start: cursor.abs(start),
      end: cursor.abs(cursor.src.length),
    });
  },
  parseBlock: (lines) => resultBlock(lines),
  printBlock: (values) => values.flatMap(resultLines),
};

export const hookResultList: ListParser<ActionResult> = {
  element: actionResult,
  holds: RESULT,
  lines: resultGrammar,
  print: printResults,
  forms: RESULT_LIST_FORMS,
  examples: HOOK_EXAMPLES,
  parse: (cursor) => parseResults(cursor, null),
  parseBlock: readResultBlock,
  printBlock: (values) => values.flatMap(resultLines),
};
