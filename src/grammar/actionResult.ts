import { Condition, condition } from './condition';
import { ListParser } from './list';
import { Cursor, DslError, Parser, Span, requireEnd } from './parser';
import { Range, scaleRange } from './range';
import { RawLine } from './structure';
import { countRange, decimalRange, id, numberOrStat, produced, Produced, quantified, refuseRange, REFERENCE } from './values';

// Whose pool an amount moves between. `me` is the character the result is read
// off and `them` is the other party the moment identifies.
export type Party = 'me' | 'them';

export type ActionResult =
  | { kind: 'say'; text: string }
  | { kind: 'set'; variable: string }
  | { kind: 'unset'; variable: string }
  | { kind: 'add'; variable: string; amount: number }
  | { kind: 'give'; item: string; amount?: Range }
  | { kind: 'take'; item: string; amount?: number }
  | { kind: 'xp'; skill: string; amount: Range }
  | { kind: 'relocate'; location: string }
  | { kind: 'discover'; location: string }
  | { kind: 'open-modal'; modal: string }
  // One signed kind rather than two, as a pool's rate is one signed stat. An
  // absent party is the character the result is read off, which is what lets one
  // rule serve a hook whichever end of the swing carried it.
  | { kind: 'pool'; resource: string; delta: Range; party?: Party }
  // Abandons the action in flight, exactly as a player-initiated cancel does.
  | { kind: 'stop' }
  // The five wrappers. Each holds an ordinary result list, so layering a drop is
  // nesting one inside another and needs no rule of its own.
  | { kind: 'chance'; numerator: number; denominator: number; results: ActionResult[] }
  | { kind: 'contest'; left: number | string; right: number | string; results: ActionResult[] }
  | { kind: 'gate'; condition: Condition; results: ActionResult[] }
  // Moves the subject rather than selecting: what is inside lands on whoever
  // caused the moment, where an unmarked result lands on whoever it happened to.
  | { kind: 'credit'; results: ActionResult[] }
  | { kind: 'one-of'; rows: DropRow[] }
  | { kind: 'roll'; table: string };

// A row's gate lives in its selector rather than its body because a row that
// fails leaves the pool BEFORE the draw and lets the survivors' shares grow;
// gating the body instead would select the row and then produce nothing, which
// is a different distribution.
export interface DropRow {
  weight: number | string;
  requires?: Condition;
  results: ActionResult[];
}

// Every result kind that holds results, so a walker cannot miss one by knowing
// only the kinds that existed when it was written.
export function nestedResults(result: ActionResult): ActionResult[][] {
  if (result.kind === 'one-of') return result.rows.map((row) => row.results);
  if (result.kind === 'chance' || result.kind === 'contest' || result.kind === 'gate' || result.kind === 'credit') return [result.results];
  return [];
}

function parseVariable(cursor: Cursor): string {
  const raw = cursor.take(REFERENCE);
  if (raw === null) throw new DslError('expected a variable', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
  return raw;
}

function parseAdd(cursor: Cursor): ActionResult {
  const variable = parseVariable(cursor);
  cursor.take(/[ \t]+/);
  // Signed, so `add: counter -3` subtracts instead of silently meaning +1, and
  // signed is why this one produced count is not a range: `-3--1` cannot be told
  // from the hyphen that separates a range's bounds.
  const amount = cursor.take(/-?\d+/);
  if (amount !== null) refuseRange(cursor, 'add: takes one signed count rather than a range: `-3--1` cannot be told from the hyphen that separates a range');
  return { kind: 'add', variable, amount: amount !== null ? Number(amount) : 1 };
}

// English puts the party after the thing moved, and the preposition follows the
// verb rather than the author: an amount taken moves away *from* a party and an
// amount given moves *to* one, so the wrong one is a mistake and not a dialect.
const PREPOSITION = { drain: 'from', restore: 'to' } as const;
const MOVES = { from: 'takes its amount away from a party', to: 'gives its amount to a party' } as const;

function parseParty(verb: 'drain' | 'restore', cursor: Cursor): Party | undefined {
  const start = cursor.pos;
  // Peeked whole, so nothing is consumed unless a phrase opens: what follows may
  // be nothing, or a typo the caller's end-of-line demand describes better than
  // a party reader could.
  if (cursor.peek(/[ \t]+(?:from|to)(?![\w-])/) === null) return undefined;
  cursor.take(/[ \t]+/);
  const preposition = cursor.take(/from|to/) as 'from' | 'to';
  cursor.take(/[ \t]+/);
  const span = { start: cursor.abs(start), end: cursor.abs(cursor.src.length) };
  const party = cursor.take(/(?:me|them)(?![\w-])/) as Party | null;
  if (party === null) throw new DslError(`${verb}: ${preposition} names a party — write \`${preposition} me\` for the character this is read off, or \`${preposition} them\` for the other`, span);
  const wanted = PREPOSITION[verb];
  if (preposition !== wanted) throw new DslError(`${verb}: ${MOVES[wanted]}, so it is written \`${wanted} ${party}\` rather than \`${preposition} ${party}\``, span);
  return party;
}

// Decimal because pools are float: an int pool rounds slow regeneration to zero.
function parsePool(sign: 1 | -1, cursor: Cursor): ActionResult {
  const delta = decimalRange(cursor, 'an amount and a resource, as in `drain: 5 health`');
  cursor.take(/[ \t]+/);
  const resource = id.parse(cursor);
  const party = parseParty(sign < 0 ? 'drain' : 'restore', cursor);
  const pool = { kind: 'pool' as const, resource, delta: scaleRange(delta, sign) };
  return party === undefined ? pool : { ...pool, party };
}

function parseGive(value: Produced): ActionResult {
  return value.amount === undefined ? { kind: 'give', item: value.item } : { kind: 'give', item: value.item, amount: value.amount };
}

// A wrapper's body is written after the colon or as the line's indented block,
// never both, and never neither — an empty wrapper is a line that does nothing
// and a doubled one hides half of what it says.
function wrapperBody(cursor: Cursor, line: RawLine | null, what: string, span: Span): ActionResult[] {
  cursor.take(/[ \t]*/);
  if (!cursor.done) {
    const inline = parseResults(cursor, null);
    if (line !== null && line.children.length > 0) throw new DslError(`${what} is written inline and as a block; give it one`, span);
    return inline;
  }
  if (line === null || line.children.length === 0) throw new DslError(`${what} has an empty body`, span);
  // The unchecked reader: a wrapper's body is part of the list its opener
  // belongs to, and `refuseParty` at that list's entry point already walks into
  // it. Reading it through the checked one would refuse a party phrase inside a
  // hook's own `1 in 20:`.
  return readResultBlock(line.children);
}

const WEIGHT = /\d+x(?![\w-])/;

// The selector numbers, which are the last places a range reads as a quantity
// and is not. Matched only in the whole shape of a selector, colon included:
// half a match would claim `3-4 in every ten make it back.`, which is a line of
// dialogue, and the odds a range cannot express are on both sides of `in`.
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
  // Refused rather than read as a weight: a contested check is an independent
  // probability, not a share of a total, so `vs` here would be a category error.
  if (cursor.peek(/[ \t]+vs[ \t]/) !== null) throw new DslError(`${where}: a vs contest is an independent chance, not a weight — write it as a wrapper inside the row`, line.span);
  const requires = cursor.take(/[ \t]+if[ \t]+/) !== null ? condition.parse(cursor) : undefined;
  if (cursor.take(/[ \t]*:/) === null) throw new DslError(`expected a one of: row, as in \`5x: give: 20 coins\`, got ${JSON.stringify(line.text)}`, line.span);

  cursor.take(/[ \t]*/);
  // The one spelling for an empty body, which is the one empty case the grammar
  // cannot otherwise write.
  if (cursor.take(/nothing[ \t]*$/) !== null) {
    if (line.children.length > 0) throw new DslError(`${where} says nothing and then holds a block`, line.span);
    return requires === undefined ? { weight, results: [] } : { weight, requires, results: [] };
  }
  const results = wrapperBody(cursor, line, where, line.span);
  return requires === undefined ? { weight, results } : { weight, requires, results };
}

function parseOneOf(cursor: Cursor, line: RawLine | null, span: Span): ActionResult {
  cursor.take(ONE_OF);
  requireEnd(cursor, 'one of:');
  if (line === null || line.children.length === 0) throw new DslError('one of: needs indented rows, as in `5x: give: 20 coins`', span);
  return { kind: 'one-of', rows: line.children.map(parseRow) };
}

function parseChance(cursor: Cursor, line: RawLine | null, span: Span): ActionResult {
  const numerator = Number(cursor.take(/\d+/));
  cursor.take(/[ \t]+in[ \t]+/);
  const denominator = Number(cursor.take(/\d+/));
  cursor.take(/[ \t]*:/);
  if (denominator === 0) throw new DslError(`${numerator} in 0 is not a chance`, span);
  if (numerator === 0) throw new DslError(`0 in ${denominator} never happens`, span);
  if (numerator > denominator) throw new DslError(`${numerator} in ${denominator} is more than certain`, span);
  return { kind: 'chance', numerator, denominator, results: wrapperBody(cursor, line, `${numerator} in ${denominator}:`, span) };
}

function parseContest(cursor: Cursor, line: RawLine | null, span: Span): ActionResult {
  const left = numberOrStat.parse(cursor);
  cursor.take(/[ \t]+vs[ \t]+/);
  const right = numberOrStat.parse(cursor);
  cursor.take(/[ \t]*:/);
  return { kind: 'contest', left, right, results: wrapperBody(cursor, line, `${left} vs ${right}:`, span) };
}

function parseCredit(cursor: Cursor, line: RawLine | null, span: Span): ActionResult {
  cursor.take(CREDIT);
  return { kind: 'credit', results: wrapperBody(cursor, line, 'credit:', span) };
}

function parseGate(cursor: Cursor, line: RawLine | null, span: Span): ActionResult {
  cursor.take(/if[ \t]+/);
  const gate = condition.parse(cursor);
  if (cursor.take(/[ \t]*:/) === null) throw new DslError('an if: wrapper needs a colon after its condition', span);
  return { kind: 'gate', condition: gate, results: wrapperBody(cursor, line, 'if:', span) };
}

// Every selector demands its colon before it is recognized as one. A dialogue
// line chooses between an effect and spoken text on this table, and prose
// beginning "if" or naming a stat is only a wrapper once it also punctuates
// like one.
const SELECTOR = `(?:${REFERENCE.source}|\\d+(?:\\.\\d+)?)`;
const ONE_OF = /one of[ \t]*:/;
const CREDIT = /credit[ \t]*:/;
const CHANCE = /\d+[ \t]+in[ \t]+\d+[ \t]*:/;
const CONTEST = new RegExp(`${SELECTOR}[ \\t]+vs[ \\t]+${SELECTOR}[ \\t]*:`);
// `if` leads more prose than it leads conditions, and a dialogue line chooses
// between an effect and spoken text on this table. A regex over "if … :" claims
// "if you must: leave now"; a trial parse does not, because `you must` is not a
// condition. So the reader itself is the test, run on a throwaway cursor.
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

// Which wrapper a line opens, or null for a plain result list. Peeked rather
// than consumed so the one table below is what both the reader and
// `startsResult` answer from.
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
  if (cursor.take(/take:[ \t]*/) !== null) return { kind: 'take', ...quantified.parse(cursor) };
  if (cursor.take(/roll:[ \t]*/) !== null) return { kind: 'roll', table: id.parse(cursor) };
  if (cursor.take(/xp:[ \t]*/) !== null) {
    const skill = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return { kind: 'xp', skill, amount: countRange(cursor, 'an xp amount') };
  }
  if (cursor.take(/drain:[ \t]*/) !== null) return parsePool(-1, cursor);
  if (cursor.take(/restore:[ \t]*/) !== null) return parsePool(1, cursor);
  if (cursor.take(/relocate:[ \t]*/) !== null) return { kind: 'relocate', location: id.parse(cursor) };
  if (cursor.take(/discover:[ \t]*/) !== null) return { kind: 'discover', location: id.parse(cursor) };
  if (cursor.take(/open modal:[ \t]*/) !== null) return { kind: 'open-modal', modal: id.parse(cursor) };
  if (cursor.take(/stop(?![\w-])/) !== null) return { kind: 'stop' };
  throw new DslError(`unrecognized action result: ${JSON.stringify(cursor.rest())}`, { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
}

// A wrapper takes the rest of its line, so it is the last thing on it and the
// comma list stops there of its own accord.
function parseResults(cursor: Cursor, line: RawLine | null): ActionResult[] {
  const results: ActionResult[] = [];
  do {
    cursor.take(/[ \t]*/);
    refuseRangedSelector(cursor, { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.src.length) });
    const wrapper = wrapperAt(cursor);
    if (wrapper === null) {
      results.push(parseResult(cursor));
      continue;
    }
    const start = cursor.pos;
    results.push(wrapper(cursor, line, { start: cursor.abs(start), end: cursor.abs(cursor.src.length) }));
    break;
  } while (cursor.take(/[ \t]*,[ \t]*/) !== null);
  return results;
}

const LEAF_RESULT = /(?:say|add|give|take|xp|roll|drain|restore|relocate|discover|open modal):|(?:set|unset)[: \t]|stop(?![\w-])/;

export function startsResult(cursor: Cursor): boolean {
  // A ranged selector is claimed here so the result reader is what explains it.
  // Left out, the line falls through to the tag parser and is reported as an
  // unrecognized tag clause, which says nothing about the range.
  return cursor.peek(LEAF_RESULT) !== null || cursor.peek(RANGED_SELECTOR) !== null || wrapperAt(cursor) !== null;
}

function readResultLine(line: RawLine): ActionResult[] {
  const cursor = new Cursor(line.text, 0, line.span.start);
  const results = parseResults(cursor, line);
  requireEnd(cursor, 'a result');
  // A leaf line has no block to hold; the alternative is the silent drop that
  // this repo has already been bitten by once.
  if (line.children.length > 0 && !results.some((result) => nestedResults(result).length > 0)) {
    throw new DslError(`${JSON.stringify(line.text)} takes no indented block`, line.span);
  }
  return results;
}

// A party names one of two, so it reads only where the moment identifies the
// other. Every other result list in the language has a single actor, and a
// phrase there would be applied to that actor — the opposite of what it says.
function firstParty(results: readonly ActionResult[]): Extract<ActionResult, { kind: 'pool' }> | undefined {
  for (const result of results) {
    if (result.kind === 'pool' && result.party !== undefined) return result;
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
  throw new DslError(`\`${found.delta.max < 0 ? 'from' : 'to'} ${found.party}\` names one of two parties, so it reads only inside \`on hit:\` or \`when hit:\`, where the moment identifies the other`, span);
}

export const parseResultLine = (line: RawLine): ActionResult[] => refuseParty(readResultLine(line), line.span);

export const resultBlock = (lines: readonly RawLine[]): ActionResult[] => lines.flatMap(parseResultLine);

const readResultBlock = (lines: readonly RawLine[]): ActionResult[] => lines.flatMap(readResultLine);

export const actionResult: Parser<ActionResult> = {
  parse: parseResult,
};

// A list field's shape, so a `# resource`'s `on empty:` and an action's result
// groups read blocks through the child-aware reader rather than line by line.
export const resultList: ListParser<ActionResult> = {
  element: actionResult,
  parse: (cursor) => {
    const start = cursor.pos;
    return refuseParty(parseResults(cursor, null), { start: cursor.abs(start), end: cursor.abs(cursor.src.length) });
  },
  parseBlock: (lines) => resultBlock(lines),
};

// The one list a party phrase reads in, which is what makes the refusal above a
// rule about where rather than a rule about which verb.
export const hookResultList: ListParser<ActionResult> = {
  element: actionResult,
  parse: (cursor) => parseResults(cursor, null),
  parseBlock: readResultBlock,
};
