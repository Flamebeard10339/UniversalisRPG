import { Condition, condition } from './condition';
import { writtenFrom } from './codec';
import { ListParser } from './list';
import { Cursor, DslError, Holds, Parser, Span, Written, calledBlock, requireEnd } from './parser';
import { Range } from './range';
import { RawLine, hasBlock, indentLines, requireNoBlock, takeBlock } from './structure';
import {
  Amount,
  amount,
  amountFalls,
  amountOrStat,
  countRange,
  decimalRange,
  durationOrStat,
  fallingAmount,
  id,
  isStatAmount,
  numberOrStat,
  opensStatAmount,
  printAmount,
  produced,
  Produced,
  quantified,
  refuseRange,
  REFERENCE,
  risingAmount,
} from './values';

export type Party = 'me' | 'them';

export const STARTING_LOCATION = 'starting-location';

export const MODAL_SCREENS = ['choose-name', 'choose-race', 'carried-items', 'quest-journal', 'stat-breakdown', 'skill-breakdown'] as const;

export type ModalScreen = (typeof MODAL_SCREENS)[number];

export const isModalScreen = (raw: string): raw is ModalScreen => (MODAL_SCREENS as readonly string[]).includes(raw);

export const modalScreenRefusal = (raw: string): string => `a modal screen must be one of ${MODAL_SCREENS.join(', ')}, got ${JSON.stringify(raw)}`;

export type ActionResult = ResultLine & { into?: string };

type ResultLine =
  | { kind: 'say'; text: string; key?: string }
  | { kind: 'set'; variable: string }
  | { kind: 'unset'; variable: string }
  | { kind: 'add'; variable: string; amount: number }
  | { kind: 'give'; item: string; amount?: Range }
  | { kind: 'take'; item: string; amount?: number; atMost?: true }
  | { kind: 'take-worn'; slot: string }
  | { kind: 'strip' }
  | { kind: 'empty'; bundle: string }
  | { kind: 'xp'; skill: string; amount: Amount }
  | { kind: 'relocate'; location: string }
  | { kind: 'discover'; location: string }
  | { kind: 'open-modal'; modal: ModalScreen }
  | { kind: 'perform'; action: string }
  | { kind: 'pool'; resource: string; delta: Amount; party?: Party }
  | { kind: 'fill'; resource: string; party?: Party }
  | { kind: 'inflict'; buff: string; party?: Party; lasts?: number | string }
  | { kind: 'shake-off'; buff: string | null; party?: Party }
  | { kind: 'stands'; guise: string; lasts: number | string }
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

export function itemCost(results: readonly ActionResult[]): Map<string, number> {
  const cost = new Map<string, number>();
  for (const result of results) {
    if (result.kind === 'take' && result.atMost !== true) cost.set(result.item, (cost.get(result.item) ?? 0) + (result.amount ?? 1));
  }
  return cost;
}

export function nestedResults(result: ActionResult): ActionResult[][] {
  if ('rows' in result) return result.rows.map((row) => row.results);
  return 'results' in result ? [result.results] : [];
}

export function everyResult(results: readonly ActionResult[]): ActionResult[] {
  return results.flatMap((result) => [result, ...nestedResults(result).flatMap(everyResult)]);
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

export const EVERYTHING = 'everything';

const EVERYTHING_TAKEN = new RegExp(`${EVERYTHING}(?![\\w-])`);

const EMPTIED = new RegExp(`${EVERYTHING}[ \\t]+in[ \\t]+`);

const WORN_TAKEN = /worn[ \t]+(?=[a-z])/;

const AT_MOST = /up[ \t]+to[ \t]+/;

export const BUNDLE = 'bundle';

const BOUND = /(?<name>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)[ \t]*=[ \t]*/;

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

const AMOUNT_THEN_RESOURCE = new RegExp(`(?:my|their)[ \\t]+${REFERENCE.source}|${REFERENCE.source}[ \\t]+(?!(?:from|to|on)(?![\\w-]))${REFERENCE.source}`);

const carriesAnAmount = (cursor: Cursor): boolean => cursor.peek(/[0-9.]/) !== null || (opensStatAmount(cursor) && cursor.peek(AMOUNT_THEN_RESOURCE) !== null);

function parsePool(sign: 1 | -1, cursor: Cursor): ActionResult {
  if (sign > 0 && !carriesAnAmount(cursor)) {
    const resource = id.parse(cursor);
    const whole = parseParty('restore', cursor);
    return whole === undefined ? { kind: 'fill', resource } : { kind: 'fill', resource, party: whole };
  }
  const written = carriesAnAmount(cursor)
    ? amountOrStat(cursor, decimalRange, 'an amount and a resource, as in `drain: 5 health`')
    : decimalRange(cursor, 'an amount and a resource, as in `drain: 5 health`');
  cursor.take(/[ \t]+/);
  const resource = id.parse(cursor);
  const party = parseParty(sign < 0 ? 'drain' : 'restore', cursor);
  const pool = {
    kind: 'pool' as const,
    resource,
    delta: sign < 0 ? fallingAmount(written) : written,
  };
  return party === undefined ? pool : { ...pool, party };
}

function parseInflict(cursor: Cursor): ActionResult {
  const buff = id.parse(cursor);
  const party = parseParty('inflict', cursor);
  const lasts = cursor.take(/[ \t]+for[ \t]+/) === null ? undefined : durationOrStat.parse(cursor);
  return {
    kind: 'inflict',
    buff,
    ...(party === undefined ? {} : { party }),
    ...(lasts === undefined ? {} : { lasts }),
  };
}

function parseShakeOff(cursor: Cursor): ActionResult {
  const buff = cursor.take(EVERYTHING_TAKEN) !== null ? null : id.parse(cursor);
  const party = parseParty('inflict', cursor);
  return { kind: 'shake-off', buff, ...(party === undefined ? {} : { party }) };
}

const STANDS_NOTE =
  'what the action is aimed at goes on standing where it stands, as itself — its stats, its faction, when it comes back and what it drops are all its own still — and wears this for the stretch, which takes the actions the `# guise` names off what it offers and may give it another name and another examine. When the stretch is up it is as it was, and nothing else has to be declared to put it back';

function parseStands(cursor: Cursor): ActionResult {
  const guise = id.parse(cursor);
  if (cursor.take(/[ \t]+for[ \t]+/) === null) {
    throw new DslError('stands: says how long it wears it, as in `stands: open-chest for 3s`', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.src.length) });
  }
  return { kind: 'stands', guise, lasts: durationOrStat.parse(cursor) };
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

interface Leaf {
  opens: RegExp;
  forms: readonly string[];
  examples: readonly string[];
  read: (cursor: Cursor) => ActionResult;
  notes?: Readonly<Record<string, string>>;
  yields?: string;
}

const LEAVES: readonly Leaf[] = [
  { opens: /say:[ \t]*/, forms: ['say: <text>'], examples: ['say: the door is stuck'], read: (cursor) => ({ kind: 'say', text: cursor.take(/[^\n]*/) ?? '' }) },
  { opens: /set[: \t][ \t]*/, forms: ['set: <flag>'], examples: ['set: found-key'], read: (cursor) => ({ kind: 'set', variable: parseVariable(cursor) }) },
  { opens: /unset[: \t][ \t]*/, forms: ['unset: <flag>'], examples: ['unset: found-key'], read: (cursor) => ({ kind: 'unset', variable: parseVariable(cursor) }) },
  { opens: /add:[ \t]*/, forms: ['add: <variable> <int>'], examples: ['add: gold 5', 'add: gold -3'], read: parseAdd },
  {
    opens: /give:[ \t]*/,
    forms: ['give: <item>', 'give: <count> <item>', 'give: <least>-<most> <item>', `give: ${EVERYTHING} in <bundle>`],
    examples: ['give: plank', 'give: 5 arrow', 'give: 5-10 arrow', `give: ${EVERYTHING} in confiscated`],
    read: (cursor) => (cursor.take(EMPTIED) !== null ? { kind: 'empty', bundle: parseVariable(cursor) } : parseGive(produced.parse(cursor))),
    notes: {
      [`give: ${EVERYTHING} in <bundle>`]:
        'pours a bundle into the pack, and whatever will not fit is left standing in the bundle rather than destroyed, so a give into a full pack can be given again once there is room',
    },
  },
  {
    opens: /take:[ \t]*/,
    forms: ['take: <count> <item>', 'take: up to <count> <item>', 'take: worn <slot>', `take: ${EVERYTHING}`],
    examples: ['take: 3 plank', 'take: up to 50 coin', 'take: worn gloves', `take: ${EVERYTHING}`],
    read: (cursor) => {
      if (cursor.take(EVERYTHING_TAKEN) !== null) return { kind: 'strip' };
      if (cursor.take(WORN_TAKEN) !== null) return { kind: 'take-worn', slot: id.parse(cursor) };
      const atMost = cursor.take(AT_MOST) !== null;
      const asked = quantified.parse(cursor);
      return atMost ? { kind: 'take', ...asked, atMost: true } : { kind: 'take', ...asked };
    },
    yields: BUNDLE,
    notes: {
      'take: up to <count> <item>':
        'takes as many as are there and no more, so a fine larger than the purse empties the purse — where a plain `take:` of more than is held takes nothing at all and says so',
      'take: worn <slot>':
        'takes whatever the player is wearing in that slot, whichever piece it is and whether or not it was rolled — which is how a mishap costs the piece it happened to rather than a piece named by id, and the only form that reaches a rolled copy at all',
    },
  },
  {
    opens: /xp:[ \t]*/,
    forms: ['xp: <skill> <amount>'],
    examples: ['xp: mining 4-7'],
    read: (cursor) => {
      const skill = id.parse(cursor);
      cursor.take(/[ \t]+/);
      return { kind: 'xp', skill, amount: amountOrStat(cursor, countRange, 'an xp amount') };
    },
  },
  { opens: /relocate:[ \t]*/, forms: ['relocate: <place>'], examples: ['relocate: camp'], read: (cursor) => ({ kind: 'relocate', location: id.parse(cursor) }) },
  { opens: /discover:[ \t]*/, forms: ['discover: <place>'], examples: ['discover: camp'], read: (cursor) => ({ kind: 'discover', location: id.parse(cursor) }) },
  { opens: /open modal:[ \t]*/, forms: ['open modal: <modal>'], examples: [`open modal: ${MODAL_SCREENS[0]}`], read: parseOpenModal },
  {
    opens: /perform:[ \t]*/,
    forms: ['perform: <action>'],
    examples: ['perform: faint'],
    read: (cursor) => ({ kind: 'perform', action: id.parse(cursor) }),
    notes: {
      'perform: <action>':
        'ends whatever the player has under way and starts that `# action` in its place, held: it cannot be called off, nothing else can be taken up and nothing engages them until it has run its time, which is what a faint or a scene is. It takes a `time:` and ends on its own — one that is `continuous`, or a contest between two sides, is refused when the world loads — and what happens when it ends is its own `on success:`, where a second `perform:` is how one scene follows another. Only the player can be made to do something, so this stands where the player acts',
    },
  },
  { opens: /drain:[ \t]*/, forms: ['drain: <amount> <resource>[ from <me or them>]'], examples: ['drain: 5 health'], read: (cursor) => parsePool(-1, cursor) },
  {
    opens: /restore:[ \t]*/,
    forms: ['restore: <amount> <resource>[ to <me or them>]', 'restore: <resource>[ to <me or them>]'],
    examples: ['restore: 1-2 health', 'restore: health'],
    read: (cursor) => parsePool(1, cursor),
    notes: { 'restore: <resource>[ to <me or them>]': 'with no amount before it the pool is filled to whatever its ceiling stands at when this runs, which is the one thing a number cannot say: a race, an item or a buff may have moved it' },
  },
  {
    opens: /stands:[ \t]*/,
    forms: ['stands: <guise> for <duration>'],
    examples: ['stands: open-chest for 3s'],
    read: parseStands,
    notes: { 'stands: <guise> for <duration>': STANDS_NOTE },
  },
  {
    opens: /inflict:[ \t]*/,
    forms: ['inflict: <buff item>[ on <me or them>]', 'inflict: <buff item>[ on <me or them>] for <duration>'],
    examples: ['inflict: dazzled', 'inflict: dazzled for 10s'],
    read: parseInflict,
    notes: {
      'inflict: <buff item>[ on <me or them>] for <duration>':
        'how long it is held for, standing over whatever the buff itself declares, so one mark holds longer than another with no second buff declared to hold it; a stat written there is read off whoever it lands on, which is how a stretch is shortened by something the player carries',
    },
  },
  {
    opens: /shake off:[ \t]*/,
    forms: ['shake off: <buff item>[ on <me or them>]', `shake off: ${EVERYTHING}[ on <me or them>]`],
    examples: ['shake off: dazed', `shake off: ${EVERYTHING}`],
    read: parseShakeOff,
    notes: {
      'shake off: <buff item>[ on <me or them>]': 'takes that mark back off whoever is carrying it, with whatever it was doing to them, as though it had run out',
      [`shake off: ${EVERYTHING}[ on <me or them>]`]: 'takes off every mark they are carrying at once, which is what a faint or a night in a bed does to them',
    },
  },
  { opens: /roll:[ \t]*/, forms: ['roll: <droptable>'], examples: ['roll: common-drops'], read: (cursor) => ({ kind: 'roll', table: id.parse(cursor) }) },
  {
    opens: /stop(?![\w-])/,
    forms: ['stop'],
    examples: ['stop'],
    notes: { stop: 'nothing after this runs — not the rest of the body it stands in, not the rest of a `# droptable` it was rolled from, and not the body that rolled it — and the action under way ends there' },
    read: () => ({ kind: 'stop' }),
  },
];

function parseResult(cursor: Cursor, into?: string): ActionResult {
  const at = { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.src.length) };
  for (const leaf of LEAVES) {
    if (cursor.take(leaf.opens) === null) continue;
    const result = leaf.read(cursor);
    if (into === undefined) return result;
    if (leaf.yields === undefined) throw new DslError(`${leaf.forms[0]!.replace(/[ :].*/, '')} yields nothing, so there is nothing for ${into} to be`, at);
    return { ...result, into };
  }
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
    const at = { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.src.length) };
    const into = binds(cursor);
    const wrapper = wrapperAt(cursor);
    if (wrapper === null) {
      results.push(parseResult(cursor, into));
      continue;
    }
    if (into !== undefined) throw new DslError(`a wrapper yields nothing, so ${into} = has nothing to stand for: bind the line inside it that does`, at);
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

const LEAF_RESULT = new RegExp(LEAVES.map((leaf) => leaf.opens.source).join('|'));

function binds(cursor: Cursor): string | undefined {
  const written = cursor.peek(BOUND);
  if (written === null) return undefined;
  cursor.take(BOUND);
  return written.groups!.name;
}

export function startsResult(cursor: Cursor): boolean {
  const trial = new Cursor(cursor.src, cursor.pos, cursor.base);
  if (binds(trial) !== undefined) return trial.peek(LEAF_RESULT) !== null;
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
  if (result.kind === 'pool' && result.party !== undefined) return `${PREPOSITION[amountFalls(result.delta) ? 'drain' : 'restore']} ${result.party}`;
  if ((result.kind === 'inflict' || result.kind === 'shake-off') && result.party !== undefined) return `${PREPOSITION.inflict} ${result.party}`;
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
  return value.into === undefined ? printResultLine(value) : `${value.into} = ${printResultLine(value)}`;
}

export const INFLICT_SITE = 'inflict:';

export const TIMED_INFLICT_SITE = `${INFLICT_SITE} … for:`;

export const WEIGHT_SITE = 'one of: row';

export const BOUND_SITE = 'bound to';

export const BUNDLE_SITES: readonly string[] = [BOUND_SITE, `give: ${EVERYTHING} in`];

export type ResultKind = ResultLine['kind'];

type Of<K extends ResultKind> = Extract<ActionResult, { kind: K }>;

type Site<K extends ResultKind> = string | ((value: Of<K>) => string);

type Holders<K extends ResultKind> = (value: Of<K>) => readonly object[];

export type ResultWalk<K extends ResultKind = ResultKind> =
  | { how: 'ref'; field: string; names: string; at: Site<K>; on?: Holders<K> }
  | { how: 'location'; field: string; at: Site<K>; on?: Holders<K> }
  | { how: 'prose'; field: string; at: Site<K>; on?: Holders<K> }
  | { how: 'condition'; field: string; at: Site<K>; on?: Holders<K> };

interface Declared<K extends ResultKind> {
  readonly print: (value: Of<K>) => string;
  readonly walks: readonly ResultWalk<K>[];
}

const spansLinesInstead = <K extends ResultKind>(walks: readonly ResultWalk<K>[] = []): Declared<K> => ({
  print: (value) => {
    throw new DslError(`a ${value.kind} result spans lines and cannot be inlined`);
  },
  walks,
});

const statIn = <K extends ResultKind>(field: keyof Of<K> & string, at: Site<K>): ResultWalk<K> => ({
  how: 'ref',
  field: 'id',
  names: 'stat',
  at,
  on: (value) => {
    const written = (value as unknown as Record<string, unknown>)[field];
    return isStatAmount(written as Amount) ? [written as object] : [];
  },
});

const poolSite = (value: Of<'pool'>): string => `${amountFalls(value.delta) ? 'drain' : 'restore'}:`;

const inflictSite = (value: Of<'inflict'>): string => (value.lasts === undefined ? INFLICT_SITE : TIMED_INFLICT_SITE);

const RESULTS: { readonly [K in ResultKind]: Declared<K> } = {
  say: { print: (value) => `say: ${value.text}`, walks: [{ how: 'prose', field: 'text', at: 'say:' }] },
  set: { print: (value) => `set: ${value.variable}`, walks: [{ how: 'ref', field: 'variable', names: 'flag', at: 'set:' }] },
  unset: { print: (value) => `unset: ${value.variable}`, walks: [{ how: 'ref', field: 'variable', names: 'flag', at: 'unset:' }] },
  add: { print: (value) => `add: ${value.variable} ${value.amount}`, walks: [{ how: 'ref', field: 'variable', names: 'flag', at: 'add:' }] },
  give: { print: (value) => `give: ${produced.print(value)}`, walks: [{ how: 'ref', field: 'item', names: 'item', at: 'give:' }] },
  take: {
    print: (value) => `take: ${value.atMost === true ? 'up to ' : ''}${quantified.print({ item: value.item, amount: value.amount })}`,
    walks: [{ how: 'ref', field: 'item', names: 'item', at: 'take:' }],
  },
  'take-worn': { print: (value) => `take: worn ${value.slot}`, walks: [{ how: 'ref', field: 'slot', names: 'slot', at: 'take: worn' }] },
  strip: { print: () => `take: ${EVERYTHING}`, walks: [] },
  empty: { print: (value) => `give: ${EVERYTHING} in ${value.bundle}`, walks: [{ how: 'ref', field: 'bundle', names: 'flag', at: `give: ${EVERYTHING} in` }] },
  xp: {
    print: (value) => `xp: ${value.skill} ${printAmount(value.amount)}`,
    walks: [{ how: 'ref', field: 'skill', names: 'skill', at: 'xp:' }, statIn<'xp'>('amount', 'xp:')],
  },
  relocate: { print: (value) => `relocate: ${value.location}`, walks: [{ how: 'location', field: 'location', at: 'relocate:' }] },
  discover: { print: (value) => `discover: ${value.location}`, walks: [{ how: 'location', field: 'location', at: 'discover:' }] },
  'open-modal': { print: (value) => `open modal: ${value.modal}`, walks: [] },
  perform: { print: (value) => `perform: ${value.action}`, walks: [{ how: 'ref', field: 'action', names: 'action', at: 'perform:' }] },
  pool: {
    print: (value) => {
      const magnitude = risingAmount(value.delta);
      const verb = amountFalls(value.delta) ? 'drain' : 'restore';
      const party = value.party === undefined ? '' : ` ${PREPOSITION[verb]} ${value.party}`;
      return `${verb}: ${printAmount(magnitude)} ${value.resource}${party}`;
    },
    walks: [{ how: 'ref', field: 'resource', names: 'resource', at: poolSite }, statIn<'pool'>('delta', poolSite)],
  },
  fill: {
    print: (value) => {
      const party = value.party === undefined ? '' : ` ${PREPOSITION.restore} ${value.party}`;
      return `restore: ${value.resource}${party}`;
    },
    walks: [{ how: 'ref', field: 'resource', names: 'resource', at: 'restore:' }],
  },
  stands: {
    print: (value) => `stands: ${value.guise} for ${durationOrStat.print(value.lasts)}`,
    walks: [
      { how: 'ref', field: 'guise', names: 'guise', at: 'stands:' },
      { how: 'ref', field: 'lasts', names: 'stat', at: 'stands: … for:' },
    ],
  },
  inflict: {
    print: (value) => {
      const party = value.party === undefined ? '' : ` ${PREPOSITION.inflict} ${value.party}`;
      const lasts = value.lasts === undefined ? '' : ` for ${durationOrStat.print(value.lasts)}`;
      return `inflict: ${value.buff}${party}${lasts}`;
    },
    walks: [
      { how: 'ref', field: 'buff', names: 'item', at: inflictSite },
      { how: 'ref', field: 'lasts', names: 'stat', at: inflictSite },
    ],
  },
  'shake-off': {
    print: (value) => {
      const party = value.party === undefined ? '' : ` ${PREPOSITION.inflict} ${value.party}`;
      return `shake off: ${value.buff ?? EVERYTHING}${party}`;
    },
    walks: [{ how: 'ref', field: 'buff', names: 'item', at: 'shake off:', on: (value) => (value.buff === null ? [] : [value]) }],
  },
  roll: { print: (value) => `roll: ${value.table}`, walks: [{ how: 'ref', field: 'table', names: 'droptable', at: 'roll:' }] },
  stop: { print: () => 'stop', walks: [] },
  chance: spansLinesInstead<'chance'>(),
  contest: spansLinesInstead<'contest'>([
    { how: 'ref', field: 'left', names: 'stat', at: 'vs:' },
    { how: 'ref', field: 'right', names: 'stat', at: 'vs:' },
  ]),
  gate: spansLinesInstead<'gate'>([{ how: 'condition', field: 'condition', at: 'if:' }]),
  credit: spansLinesInstead<'credit'>(),
  'one-of': spansLinesInstead<'one-of'>([
    { how: 'ref', field: 'weight', names: 'stat', at: WEIGHT_SITE, on: (value) => value.rows },
    { how: 'condition', field: 'requires', at: `${WEIGHT_SITE} if`, on: (value) => value.rows },
  ]),
};

const declaredFor = (value: ActionResult): Declared<ResultKind> => RESULTS[value.kind] as Declared<ResultKind>;

const printResultLine = (value: ActionResult): string => declaredFor(value).print(value);

export function resultWalks(value: ActionResult): { walk: ResultWalk; site: string; holders: readonly object[] }[] {
  return declaredFor(value).walks.map((walk) => ({
    walk,
    site: typeof walk.at === 'string' ? walk.at : walk.at(value),
    holders: walk.on === undefined ? [value] : walk.on(value),
  }));
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

const bound = (yields: string, written: string): string => `<${yields}> = ${written}`;

const BINDING_NOTE =
  'what the line moved is held under that name instead of being gone, and the name is a `# variable` marked `bundle`. Only a line that yields something may be bound — a wrapper yields nothing — and a bundle answers `count.<bundle>` and nothing else: it is poured back out rather than read into';

const LEAF_FORMS: readonly string[] = LEAVES.flatMap((leaf) => (leaf.yields === undefined ? leaf.forms : [...leaf.forms, ...leaf.forms.map((form) => bound(leaf.yields!, form))]));

const LEAF_EXAMPLES: readonly string[] = LEAVES.flatMap((leaf) =>
  leaf.yields === undefined ? leaf.examples : [...leaf.examples, ...leaf.examples.map((example) => `${leaf.yields === BUNDLE ? 'confiscated' : leaf.yields} = ${example}`)],
);

const LEAF_NOTES: Readonly<Record<string, string>> = Object.assign(
  {},
  ...LEAVES.map((leaf) => leaf.notes ?? {}),
  ...LEAVES.flatMap((leaf) => (leaf.yields === undefined ? [] : [Object.fromEntries(leaf.forms.map((form) => [bound(leaf.yields!, form), BINDING_NOTE]))])),
);

const oneOf = (called: string, forms: readonly string[], said: Partial<Parser<string>> = {}): Parser<string> => ({
  parse: (cursor) => id.parse(cursor),
  print: (value) => value,
  called,
  forms,
  examples: forms.filter((form) => !form.includes('<')),
  ...said,
});

export const place = oneOf('place', ['<location>', STARTING_LOCATION], { names: { location: 'location' }, examples: ['camp', STARTING_LOCATION] });

export const modalScreen = oneOf('modal', MODAL_SCREENS);

export const actionResult: Parser<ActionResult> = {
  parse: (cursor) => parseResult(cursor, binds(cursor)),
  print: printResult,
  names: { variable: 'flag', bundle: 'flag', duration: 'stat', amount: 'stat' },
  holds: () => ({ place, modal: modalScreen, duration: durationOrStat, amount }),
  forms: LEAF_FORMS,
  examples: LEAF_EXAMPLES,
  notes: LEAF_NOTES,
};

const RESULT: Holds = () => ({ result: actionResult });

const ROW = 'one of these';

const ROW_NOTE =
  'one of these is picked, weighed against the rows beside it. A stat written as the weight stands as whatever it reads, beside the numbers around it — a stat reading 3 against a `100x` row is three in a hundred and three — so it shares a roll out rather than settling one, and a stat that starts low is all but unreachable. A check that is meant to be won or lost is `<stat> vs <stat>:`, which is a contest and is written as a wrapper inside the row';

const WEIGHTED = { names: { weight: 'stat' }, holds: () => ({ condition, result: actionResult }) };

const ROWS: readonly Written[] = [
  { form: '<weight>[ if <condition>]: <result>', example: '3x: give: plank', family: ROW, ...WEIGHTED, note: ROW_NOTE },
  { form: '<weight>[ if <condition>]: nothing', example: '5x: nothing', family: ROW, ...WEIGHTED, note: ROW_NOTE },
  { form: '<weight>[ if <condition>]:', example: '3x if has-key:', family: ROW, ...WEIGHTED, note: ROW_NOTE, block: () => resultGrammar() },
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

export const resultGrammar = (): readonly Written[] => calledBlock('result', [...writtenFrom(actionResult).map((line) => ({ ...line, family: HAPPENS })), ...WRAPPERS]);

const RESULT_LIST_EXAMPLES: readonly string[] = [...LEAF_EXAMPLES, 'set: found-key, add: gold 5'];

const HOOK_EXAMPLES: readonly string[] = [...RESULT_LIST_EXAMPLES, 'drain: 5 health from them', 'restore: 1-2 health to me', 'inflict: dazzled on them'];
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
