import { Condition, condition } from '../../grammar/condition';
import { isModalScreen, MODAL_SCREENS, ModalScreen, modalScreen, modalScreenRefusal, place } from '../../grammar/actionResult';
import { DslError, parseWhole, type Written } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { hasBlock, indentLines, takeBlock, type RawLine } from '../../grammar/structure';
import type { Span } from '../../grammar/parser';
import { Direction, DIRECTIONS, Hex, hexKey, parseHexKey, PlaneNode } from '../hex';
import type { EngineKey } from '../locale';

import { section, writtenWhole } from './define';
import { condition as visitCondition, put, putCarried, putLocation, type Visit } from '../refs';
import { isActionOwnerKind } from './define';
import { ACTION_MEMBER, memberKey } from '../namespace';
import { lastSegment } from '../../grammar/values';

export interface NoteField {
  readonly name: 'note' | 'expected' | 'confusion' | 'blocked';
  readonly asks: EngineKey;
  readonly records: string;
  readonly required: boolean;
  readonly reports: boolean;
}

export const NOTE_FIELDS: readonly NoteField[] = [
  { name: 'note', asks: 'engine.playtest.note', records: 'what the player made of the turn above', required: true, reports: false },
  { name: 'expected', asks: 'engine.playtest.expected', records: 'what the player expected that turn to do instead', required: true, reports: true },
  { name: 'confusion', asks: 'engine.playtest.confusion', records: 'what the player could not follow', required: true, reports: true },
  { name: 'blocked', asks: 'engine.playtest.blocked', records: 'what stopped the player getting on', required: false, reports: false },
];

export type NoteName = NoteField['name'];

export const DEBUG_SWITCHES = {
  'lock-pools': "every pool of the player's stands where it is: what would have come off one comes off nothing, and what fills one still fills it",
  unkillable: "no pool of the player's is ever spent: it can be worn down to the last of it and no further, so nothing that empties one ends the run",
  'instant-kill': "a blow of the player's lands rather than missing, and empties whatever it lands on",
  'succeed-checks': "every `<stat> vs <stat>:` the player is weighed by goes their way, so a check that could have fallen either way is settled before it is rolled",
  'fail-checks': "no `<stat> vs <stat>:` the player is weighed by goes their way, which is the other half of `succeed-checks` and refused beside it",
} as const;

export type DebugSwitch = keyof typeof DEBUG_SWITCHES;

export const DEBUG_SWITCH_NAMES = Object.keys(DEBUG_SWITCHES) as DebugSwitch[];

const DEBUG_NOTE = 'a debug switch: it stands from here to the end of the run, and says what the route is not asking about';

export type Directive =
  | { kind: 'run'; test: string }
  | { kind: 'talk'; entity: string }
  | { kind: 'choose'; text: string }
  | { kind: 'use'; obj: string; objId: string; actionId: string }
  | { kind: 'use-on'; action: string; target: string }
  | { kind: 'travel'; location: string }
  | { kind: 'goto'; location: string }
  | { kind: 'craft'; recipe: string }
  | { kind: 'shop'; shop: string }
  | {
      kind: 'begin';
      inner: Extract<Directive, { kind: 'use' | 'use-on' | 'travel' | 'craft' }>;
    }
  | { kind: 'assert'; condition: Condition }
  | { kind: 'journal'; quest: string; text: string }
  | { kind: 'expect'; save: string }
  | { kind: 'expect-only'; save: string }
  | { kind: 'load'; save: string }
  | { kind: 'cancel' }
  | { kind: 'wait'; seconds: number }
  | { kind: 'wait-out'; until: WaitFor }
  | { kind: 'equip'; item: string }
  | { kind: 'unequip'; slot: string }
  | { kind: 'swap'; one: string; other: string }
  | {
      kind: 'slot';
      target: string;
      hex: Hex;
      direction: Direction;
      jewel: string;
    }
  | { kind: 'allocate'; target: string; node: PlaneNode }
  | { kind: 'unallocate'; target: string; node: PlaneNode }
  | { kind: 'apply'; target: string; hex: Hex; effect: string }
  | { kind: 'refuse'; inner: GrowthDirective }
  | { kind: 'until'; inner: Directive; until: Terminator }
  | { kind: 'loop'; until: Rounds; body: Directive[] }
  | { kind: 'open-modal'; modal: ModalScreen }
  | { kind: 'setting'; setting: string; value: string }
  | { kind: 'debug'; which: DebugSwitch }
  | { kind: 'submit-modal'; key: string; value: string }
  | { kind: 'note'; field: NoteName; text: string }
  | { kind: 'refused' }
  | { kind: 'page'; layer: string; subpage: string };

export type GrowthDirective = Extract<Directive, { kind: 'slot' | 'allocate' | 'unallocate' | 'apply' }>;

export interface Cycles {
  readonly times: number;
}

export type Terminator = 'done' | Cycles | Condition;

export type WaitFor = 'done' | Cycles;

export type Rounds = Cycles | Condition;

export const isCycles = (value: Terminator): value is Cycles => typeof value === 'object' && 'times' in value;

export interface Test {
  id: string;
  directives: Directive[];
}

export const everyDirective = (directives: readonly Directive[]): Directive[] => directives.flatMap((directive) => (directive.kind === 'loop' ? [directive, ...everyDirective(directive.body)] : [directive]));

const PATH = '[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)*';
const SLUG = '[a-z0-9][a-z0-9-]*';
const USE_PAYLOAD = `(?<obj>[a-z][a-z0-9-]*)\\.(?<objId>${PATH})\\.(?<actionId>${SLUG})`;
const USE_ON_PAYLOAD = `(?<action>${PATH})[ \\t]+on[ \\t]+(?<target>${PATH})`;
const TRAVEL_PAYLOAD = `(?<id>${PATH})`;
const CRAFT_PAYLOAD = `(?<id>${PATH})`;

const RUN = new RegExp(`^run:[ \\t]*(?<id>${PATH})$`);
const TALK = new RegExp(`^talk:[ \\t]*(?<id>${PATH})$`);
const CHOOSE = /^choose:[ \t]*(?<text>.*)$/;
const USE_VERB = 'use:';
const USE = new RegExp(`^${USE_VERB}[ \\t]*${USE_PAYLOAD}$`);
const USE_ON = new RegExp(`^${USE_VERB}[ \\t]*${USE_ON_PAYLOAD}$`);
const TRAVEL = new RegExp(`^travel:[ \\t]*${TRAVEL_PAYLOAD}$`);
const GOTO = new RegExp(`^goto:[ \\t]*${TRAVEL_PAYLOAD}$`);
const CRAFT = new RegExp(`^craft:[ \\t]*${CRAFT_PAYLOAD}$`);
const SHOP = new RegExp(`^shop:[ \\t]*(?<id>${PATH})$`);
const BEGIN = /^begin:[ \t]*(?<verb>use|travel|craft)[ \t]+(?<rest>.+)$/;
const BEGIN_USE = new RegExp(`^${USE_PAYLOAD}$`);
const BEGIN_USE_ON = new RegExp(`^${USE_ON_PAYLOAD}$`);
const BEGIN_TRAVEL = new RegExp(`^${TRAVEL_PAYLOAD}$`);
const BEGIN_CRAFT = new RegExp(`^${CRAFT_PAYLOAD}$`);
const ASSERT = /^assert:[ \t]*(?<cond>.+)$/;
const JOURNAL = new RegExp(`^journal:[ \\t]*(?<quest>${PATH})[ \\t]+says[ \\t]+(?<text>.*)$`);
const EXPECT = new RegExp(`^expect:[ \\t]*(?<id>${PATH})$`);
const EXPECT_ONLY = new RegExp(`^expect only:[ \\t]*(?<id>${PATH})$`);
const LOAD = new RegExp(`^load:[ \\t]*(?<id>${PATH})$`);
const SETTING = /^setting:[ 	]*(?<setting>[a-z][a-z0-9-]*)[ 	]+(?<value>[a-z0-9][a-z0-9-]*)$/;
const DEBUG = new RegExp(`^(?<which>${DEBUG_SWITCH_NAMES.join('|')})$`);
const CANCEL = /^cancel$/;
const NOTE = new RegExp(`^(?<field>${NOTE_FIELDS.map((field) => field.name).join('|')}):[ \\t]*(?<text>.*)$`);
const REFUSED = /^refused$/;
const PAGE = new RegExp(`^page:[ \\t]*(?<layer>${SLUG})/(?<subpage>${SLUG})$`);
const WAIT = /^wait:[ \t]*(?<seconds>\d+(?:\.\d+)?)$/;
const WAIT_OUT = /^wait:[ \t]*done$/;
const WAIT_TIMES = /^wait:[ \t]*(?<times>\d+)[ \t]+times$/;
const CYCLES = /^(?<times>\d+)[ \t]+times$/;
const UNTIL = /^(?<rest>.+)[ \t]+until[ \t]+(?<terminator>.+)$/;

function parseTerminator(text: string): Terminator | null {
  if (text.trim() === 'done') return 'done';
  const cycles = CYCLES.exec(text.trim())?.groups;
  if (cycles) return { times: Number(cycles.times) };
  try {
    return parseWhole(condition, text, 0, 'an until condition');
  } catch {
    return null;
  }
}

const LOOP = /^until[ \t]+(?<rounds>.+):$/;
const LOOP_FORM = 'until <condition>: or until <n> times:';
const OPENS_A_BLOCK = `only an \`${LOOP_FORM}\` line takes an indented block in a # test, and the block is what it goes round`;

function parseRounds(text: string, span: Span): Rounds {
  const rounds = parseTerminator(text);
  if (rounds === null) throw new DslError(`malformed until block (expected ${LOOP_FORM}): ${text}`, span);
  if (rounds === 'done') throw new DslError(`\`until done:\` opens nothing: a block has no one action under way to be done with, so it goes round ${LOOP_FORM}`, span);
  return rounds;
}
const CARRIED = `(?:${PATH}|[0-9]+)`;
const HEX = '-?\\d+,-?\\d+';
const DIRECTION = [...DIRECTIONS].sort((a, b) => b.length - a.length).join('|');

const EQUIP = new RegExp(`^equip:[ \\t]*(?<item>${CARRIED})$`);
const UNEQUIP = new RegExp(`^unequip:[ \\t]*(?<slot>${PATH})$`);
const SWAP = new RegExp(`^swap:[ \\t]*(?<one>${CARRIED})[ \\t]+with[ \\t]+(?<other>${CARRIED})$`);

const NODE_PAYLOAD = `(?<target>${CARRIED})[ \\t]+at[ \\t]+(?<hex>${HEX})[ \\t]+(?:position[ \\t]+(?<position>[0-9]+)|slot[ \\t]+(?<direction>${DIRECTION}))`;
const NODE_FORM = '<target> at <q>,<r> position <n>, or <target> at <q>,<r> slot <direction>';

const GROWTH_PAYLOAD = {
  slot: `(?<target>${CARRIED})[ \\t]+at[ \\t]+(?<hex>${HEX})[ \\t]+(?<direction>${DIRECTION})[ \\t]+with[ \\t]+(?<jewel>${PATH})`,
  allocate: NODE_PAYLOAD,
  unallocate: NODE_PAYLOAD,
  apply: `(?<target>${CARRIED})[ \\t]+at[ \\t]+(?<hex>${HEX})[ \\t]+with[ \\t]+(?<effect>${PATH})`,
} as const;

type GrowthVerb = GrowthDirective['kind'];
export const GROWTH_VERBS = Object.keys(GROWTH_PAYLOAD) as GrowthVerb[];

const GROWTH_LINE = new Map(GROWTH_VERBS.map((verb) => [verb, new RegExp(`^${verb}:[ \\t]*${GROWTH_PAYLOAD[verb]}$`)]));
const GROWTH_INLINE = new Map(GROWTH_VERBS.map((verb) => [verb, new RegExp(`^${GROWTH_PAYLOAD[verb]}$`)]));
const GROWTH_VERB = new RegExp(`^(?<verb>${GROWTH_VERBS.join('|')}):`);
const REFUSE_VERB = /^refuse:/;
const REFUSE = new RegExp(`^refuse:[ \\t]*(?<verb>${GROWTH_VERBS.join('|')})[ \\t]+(?<rest>.+)$`);

const GROWTH_FORM: Readonly<Record<GrowthVerb, string>> = {
  slot: '<target> at <q>,<r> <direction> with <jewel item>',
  allocate: NODE_FORM,
  unallocate: NODE_FORM,
  apply: '<target> at <q>,<r> with <effect item>',
};

export function isGrowthDirective(value: Directive): value is GrowthDirective {
  return (GROWTH_VERBS as string[]).includes(value.kind);
}

export type UseDirective = Extract<Directive, { kind: 'use' }>;

export const usePayload = (value: UseDirective): string => `${value.obj}.${value.objId}.${value.actionId}`;

export function parseUsePayload(payload: string): UseDirective | null {
  const groups = BEGIN_USE.exec(payload)?.groups;
  return groups
    ? {
        kind: 'use',
        obj: groups.obj,
        objId: groups.objId,
        actionId: groups.actionId,
      }
    : null;
}

export const useChoiceId = (value: UseDirective): string => `${USE_VERB}${usePayload(value)}`;

export const parseUseChoiceId = (choiceId: string): UseDirective | null => (choiceId.startsWith(USE_VERB) ? parseUsePayload(choiceId.slice(USE_VERB.length)) : null);

type Groups = Record<string, string | undefined>;

function growth(verb: GrowthVerb, text: string, groups: Groups): GrowthDirective {
  const target = groups.target as string;

  const hex = parseHexKey(groups.hex as string);
  if (!hex) throw new DslError(`malformed hex address (expected <q>,<r> with no leading zeroes): ${text}`);
  const direction = groups.direction as Direction;

  if (verb === 'slot')
    return {
      kind: 'slot',
      target,
      hex,
      direction,
      jewel: groups.jewel as string,
    };
  if (verb === 'apply') return { kind: 'apply', target, hex, effect: groups.effect as string };
  const node: PlaneNode = groups.position === undefined ? { hex, kind: 'slot', direction } : { hex, kind: 'position', position: Number(groups.position) };
  return { kind: verb, target, node };
}

function parseGrowth(verb: GrowthVerb, pattern: Map<GrowthVerb, RegExp>, payload: string, text: string): GrowthDirective {
  const groups = pattern.get(verb)!.exec(payload)?.groups;
  if (!groups) throw new DslError(`malformed ${verb}: payload (expected ${GROWTH_FORM[verb]}): ${text}`);
  return growth(verb, text, groups);
}
const OPEN_MODAL = new RegExp(`^open-modal:[ \\t]*(?<name>${PATH})$`);
const SUBMIT_MODAL_VERB = /^submit-modal:/;
const SUBMIT_MODAL = /^submit-modal:[ \t]*(?<key>[a-z][a-z0-9-]*)=(?<value>.*)$/;

function parseBegin(text: string, verb: string, rest: string): Directive {
  if (verb === 'use') {
    const inner = parseUsePayload(rest);
    if (inner) return { kind: 'begin', inner };
    const on = BEGIN_USE_ON.exec(rest)?.groups;
    if (!on) throw new DslError(`malformed begin: use payload (expected obj.objId.actionId, or <action> on <target>): ${text}`);
    return {
      kind: 'begin',
      inner: { kind: 'use-on', action: on.action, target: on.target },
    };
  }
  if (verb === 'travel') {
    const m = BEGIN_TRAVEL.exec(rest)?.groups;
    if (!m) throw new DslError(`malformed begin: travel payload (expected a location id): ${text}`);
    return { kind: 'begin', inner: { kind: 'travel', location: m.id } };
  }
  if (verb === 'craft') {
    const m = BEGIN_CRAFT.exec(rest)?.groups;
    if (!m) throw new DslError(`malformed begin: craft payload (expected a recipe id): ${text}`);
    return { kind: 'begin', inner: { kind: 'craft', recipe: m.id } };
  }
  throw new DslError(`unknown begin: verb (expected use, travel, or craft): ${text}`);
}

export function parseDirectiveLine(text: string): Directive | null {
  const run = RUN.exec(text)?.groups;
  if (run) return { kind: 'run', test: run.id };

  const talk = TALK.exec(text)?.groups;
  if (talk) return { kind: 'talk', entity: talk.id };

  const choose = CHOOSE.exec(text)?.groups;
  if (choose) return { kind: 'choose', text: choose.text };

  const note = NOTE.exec(text)?.groups;
  if (note) return { kind: 'note', field: note.field as NoteName, text: note.text };

  if (REFUSED.test(text)) return { kind: 'refused' };

  const page = PAGE.exec(text)?.groups;
  if (page) return { kind: 'page', layer: page.layer, subpage: page.subpage };

  const until = UNTIL.exec(text)?.groups;
  if (until) {
    const terminator = parseTerminator(until.terminator);
    if (terminator !== null) {
      const inner = parseDirectiveLine(until.rest);
      if (inner) return { kind: 'until', inner, until: terminator };
    }
  }

  const use = USE.exec(text)?.groups;
  if (use)
    return {
      kind: 'use',
      obj: use.obj,
      objId: use.objId,
      actionId: use.actionId,
    };
  const useOn = USE_ON.exec(text)?.groups;
  if (useOn) return { kind: 'use-on', action: useOn.action, target: useOn.target };

  const travel = TRAVEL.exec(text)?.groups;
  if (travel) return { kind: 'travel', location: travel.id };

  const goingTo = GOTO.exec(text)?.groups;
  if (goingTo) return { kind: 'goto', location: goingTo.id };

  const craft = CRAFT.exec(text)?.groups;
  if (craft) return { kind: 'craft', recipe: craft.id };

  const shopping = SHOP.exec(text)?.groups;
  if (shopping) return { kind: 'shop', shop: shopping.id };

  const begin = BEGIN.exec(text)?.groups;
  if (begin) return parseBegin(text, begin.verb, begin.rest);

  const assert = ASSERT.exec(text)?.groups;
  if (assert)
    return {
      kind: 'assert',
      condition: parseWhole(condition, assert.cond, 0, 'an assert condition'),
    };

  const journal = JOURNAL.exec(text)?.groups;
  if (journal) return { kind: 'journal', quest: journal.quest!, text: journal.text! };

  const expectOnly = EXPECT_ONLY.exec(text)?.groups;
  if (expectOnly) return { kind: 'expect-only', save: expectOnly.id };

  const expect = EXPECT.exec(text)?.groups;
  if (expect) return { kind: 'expect', save: expect.id };

  const load = LOAD.exec(text)?.groups;
  if (load) return { kind: 'load', save: load.id };

  const setting = SETTING.exec(text)?.groups;
  if (setting) return { kind: 'setting', setting: setting.setting, value: setting.value };

  const switched = DEBUG.exec(text)?.groups;
  if (switched) return { kind: 'debug', which: switched.which as DebugSwitch };

  if (CANCEL.test(text)) return { kind: 'cancel' };

  const wait = WAIT.exec(text)?.groups;
  if (wait) return { kind: 'wait', seconds: Number(wait.seconds) };

  if (WAIT_OUT.test(text)) return { kind: 'wait-out', until: 'done' };

  const times = WAIT_TIMES.exec(text)?.groups;
  if (times) return { kind: 'wait-out', until: { times: Number(times.times) } };

  const equip = EQUIP.exec(text)?.groups;
  if (equip) return { kind: 'equip', item: equip.item };

  const unequip = UNEQUIP.exec(text)?.groups;
  if (unequip) return { kind: 'unequip', slot: unequip.slot };

  const swap = SWAP.exec(text)?.groups;
  if (swap) return { kind: 'swap', one: swap.one, other: swap.other };

  const growing = GROWTH_VERB.exec(text)?.groups;
  if (growing) return parseGrowth(growing.verb as GrowthVerb, GROWTH_LINE, text, text);

  if (REFUSE_VERB.test(text)) {
    const refuse = REFUSE.exec(text)?.groups;
    if (!refuse) throw new DslError(`unknown refuse: verb (expected one of ${GROWTH_VERBS.join(', ')}): ${text}`);
    return {
      kind: 'refuse',
      inner: parseGrowth(refuse.verb as GrowthVerb, GROWTH_INLINE, refuse.rest, text),
    };
  }

  const opening = OPEN_MODAL.exec(text)?.groups;
  if (opening) {
    if (!isModalScreen(opening.name)) throw new DslError(modalScreenRefusal(opening.name));
    return { kind: 'open-modal', modal: opening.name };
  }

  if (SUBMIT_MODAL_VERB.test(text)) {
    const submit = SUBMIT_MODAL.exec(text)?.groups;
    if (!submit) throw new DslError(`malformed submit-modal: payload (expected <key>=<value>): ${text}`);
    return { kind: 'submit-modal', key: submit.key, value: submit.value };
  }

  return null;
}

export function printTerminator(value: Terminator): string {
  if (value === 'done') return 'done';
  return isCycles(value) ? `${value.times} times` : condition.print(value);
}

function inlined(inner: Directive, verb = inner.kind): string {
  return `${verb} ${printDirective(inner).replace(/^[a-z-]+:[ \t]*/, '')}`;
}

export const printRounds = (value: Rounds): string => `until ${printTerminator(value)}:`;

export function printDirectiveLines(value: Directive): string[] {
  return value.kind === 'loop' ? [printRounds(value.until), ...indentLines(value.body.flatMap(printDirectiveLines))] : [printDirective(value)];
}

export function printDirective(value: Directive): string {
  switch (value.kind) {
    case 'loop':
      return printDirectiveLines(value).join('\n');
    case 'run':
      return `run: ${value.test}`;
    case 'talk':
      return `talk: ${value.entity}`;
    case 'choose':
      return `choose: ${value.text}`;
    case 'use':
      return `use: ${usePayload(value)}`;
    case 'use-on':
      return `use: ${value.action} on ${value.target}`;
    case 'travel':
      return `travel: ${value.location}`;
    case 'goto':
      return `goto: ${value.location}`;
    case 'craft':
      return `craft: ${value.recipe}`;
    case 'shop':
      return `shop: ${value.shop}`;
    case 'begin':
      return `begin: ${inlined(value.inner, value.inner.kind === 'use-on' ? 'use' : value.inner.kind)}`;
    case 'refuse':
      return `refuse: ${inlined(value.inner)}`;
    case 'until':
      return `${printDirective(value.inner)} until ${printTerminator(value.until)}`;
    case 'assert':
      return `assert: ${condition.print(value.condition)}`;
    case 'journal':
      return `journal: ${value.quest} says ${value.text}`;
    case 'expect':
      return `expect: ${value.save}`;
    case 'expect-only':
      return `expect only: ${value.save}`;
    case 'load':
      return `load: ${value.save}`;
    case 'setting':
      return `setting: ${value.setting} ${value.value}`;
    case 'debug':
      return value.which;
    case 'cancel':
      return 'cancel';
    case 'wait':
      return `wait: ${value.seconds}`;
    case 'wait-out':
      return `wait: ${printTerminator(value.until)}`;
    case 'equip':
      return `equip: ${value.item}`;
    case 'unequip':
      return `unequip: ${value.slot}`;
    case 'swap':
      return `swap: ${value.one} with ${value.other}`;
    case 'slot':
      return `slot: ${value.target} at ${hexKey(value.hex)} ${value.direction} with ${value.jewel}`;
    case 'allocate':
    case 'unallocate':
      return `${value.kind}: ${value.target} at ${hexKey(value.node.hex)} ${value.node.kind === 'position' ? `position ${value.node.position}` : `slot ${value.node.direction}`}`;
    case 'apply':
      return `apply: ${value.target} at ${hexKey(value.hex)} with ${value.effect}`;
    case 'open-modal':
      return `open-modal: ${value.modal}`;
    case 'submit-modal':
      return `submit-modal: ${value.key}=${value.value}`;
    case 'note':
      return `${value.field}: ${value.text}`;
    case 'refused':
      return 'refused';
    case 'page':
      return `page: ${value.layer}/${value.subpage}`;
    default: {
      const unreached: never = value;
      return unreached;
    }
  }
}

const USED = { names: { id: '<kind>', action: null } };

const UNTIL_NOTE = 'performs the directive, then waits it out exactly as the matching `wait:` does';

const LOOP_NOTE =
  'goes round the lines under it, asking before each pass whether the condition holds and stopping the moment it does — so a death that cuts an action short ends that pass and not the route, and a pass that leaves the world exactly as it found it is refused rather than gone round again forever';

const REFUSED_STANDS_UNDER =
  'refused is about the line above it, which has to be a line the engine was asked to take';

function refusalStands(above: Directive | undefined, span: Span): void {
  if (above === undefined) throw new DslError(`${REFUSED_STANDS_UNDER}; nothing stands there`, span);
  if (above.kind === 'note' || above.kind === 'page' || above.kind === 'refused') {
    throw new DslError(`${REFUSED_STANDS_UNDER}; ${JSON.stringify(printDirective(above))} is not one`, span);
  }
}

function heldByTest(): readonly Written[] {
  return test.grammar;
}

function parseLines(lines: readonly RawLine[]): Directive[] {
  const directives: Directive[] = [];
  for (const line of lines) {
    const loop = LOOP.exec(line.text)?.groups;
    if (loop) {
      if (!hasBlock(line)) throw new DslError(`${JSON.stringify(line.text)} opens a block and nothing stands under it`, line.span);
      directives.push({ kind: 'loop', until: parseRounds(loop.rounds, line.span), body: parseLines(takeBlock(line)) });
      continue;
    }
    if (hasBlock(line)) throw new DslError(`${OPENS_A_BLOCK}: ${line.text}`, line.span);
    const directive = parseDirectiveLine(line.text);
    if (!directive) throw new DslError(`unexpected line in # test: ${JSON.stringify(line.text)}`, line.span);
    if (directive.kind === 'refused') refusalStands(directives[directives.length - 1], line.span);
    directives.push(directive);
  }
  return directives;
}

export const test = section<Test>()({
  kind: 'test',
  ids: 'owned',
  vocabulary: 'declared',
  merge: writtenWhole,
  map: 'tests',
  grammar: [
    { form: 'run: <test>', example: 'run: opening' },
    { form: 'talk: <entity>', example: 'talk: guide' },
    {
      form: 'choose: <the words the line is written with>',
      example: 'choose: I am here about the bees.',
      note: 'the choice as this file writes it, not as the screen now reads it — a translated world moves the words on the screen and leaves the line here alone',
    },
    {
      form: 'choose: <thread>',
      example: 'choose: sunny.the-stove',
      note: 'the thread to pick out of the list, answerable by any tail of its name that fits only one of them',
    },
    {
      form: 'choose: <position>',
      example: 'choose: 0',
      note: 'where it stands in the list, counting from nothing — safe under one node, whose choices stand in the order they are written, and not safe for a list of threads',
    },
    { form: 'use: <kind>.<id>.<action>', example: 'use: item.rusty-sword.swing', ...USED },
    { form: 'use: <action> on <entity>', example: 'use: chop on oak' },
    { form: 'travel: <location>', example: 'travel: camp' },
    {
      form: 'goto: <place>',
      example: 'goto: camp',
      holds: () => ({ place }),
      note: 'puts the player there outright — no road walked, no time passed — which is how a route sets its scene rather than how a player moves: `travel:` walks the road, and pays for every hop of it',
    },
    { form: 'craft: <recipe>', example: 'craft: plank' },
    { form: 'shop: <shop>', example: 'shop: general-store' },
    { form: 'begin: use <kind>.<id>.<action>', example: 'begin: use item.rusty-sword.swing', ...USED },
    { form: 'begin: travel <location>', example: 'begin: travel camp' },
    { form: 'begin: craft <recipe>', example: 'begin: craft plank' },
    { form: 'assert: <condition>', example: 'assert: has-key', holds: () => ({ condition }) },
    {
      form: 'journal: <quest> says <text>',
      example: 'journal: finding-your-feet says Talk to Miki in the guide house.',
      note: 'the line the journal is standing on for that quest, and nothing once the quest is over',
    },
    { form: 'expect: <save>', example: 'expect: after-intro' },
    { form: 'expect only: <save>', example: 'expect only: after-intro' },
    { form: 'load: <save>', example: 'load: after-intro' },
    { form: 'setting: <setting> <value>', example: 'setting: hardcore on', note: 'plays the rest of the run by that preference, as the settings page and /settings do — a claim about what a setting changes starts by writing it' },
    ...DEBUG_SWITCH_NAMES.map((name) => ({ form: name, example: name, note: `${DEBUG_SWITCHES[name]} — ${DEBUG_NOTE}` })),
    { form: 'cancel', example: 'cancel' },
    { form: 'wait: <seconds>', example: 'wait: 1' },
    { form: 'wait: done', example: 'wait: done', note: 'stands until whatever is under way has finished, rather than a number of seconds guessed large enough to cover it' },
    {
      form: 'wait: <n> times',
      example: 'wait: 4 times',
      note: 'stands while what is under way comes round n more times',
    },
    {
      form: '<a directive that starts an action> until done',
      example: 'use: melee-combat on giant-rat until done',
      note: UNTIL_NOTE,
    },
    {
      form: '<a directive that starts an action> until <n> times',
      example: 'use: melee-combat on giant-rat until 4 times',
      note: UNTIL_NOTE,
    },
    {
      form: '<a directive that starts an action> until <condition>',
      example: 'use: melee-combat on giant-rat until resource.health < 10',
      note: UNTIL_NOTE,
      holds: () => ({ condition }),
    },
    {
      form: 'until <condition>:',
      example: 'until level.thieving >= 30:',
      note: LOOP_NOTE,
      holds: () => ({ condition }),
      block: heldByTest,
    },
    {
      form: 'until <n> times:',
      example: 'until 4 times:',
      note: 'goes round the lines under it that many times',
      block: heldByTest,
    },
    { form: 'equip: <item>', example: 'equip: rusty-sword' },
    { form: 'unequip: <slot>', example: 'unequip: main-hand' },
    { form: 'swap: <item> with <item>', example: 'swap: rusty-sword with bread', note: 'exchanges where two things sit in the pack, which is the order the pack is drawn in and the order a save carries' },
    { form: 'slot: <item> at <q>,<r> <direction> with <jewel item>', example: 'slot: cluster-jewel at 0,0 ne with small-jewel' },
    { form: 'allocate: <item> at <q>,<r> position <n>', example: 'allocate: cluster-jewel at 0,0 position 1' },
    { form: 'allocate: <item> at <q>,<r> slot <direction>', example: 'allocate: cluster-jewel at 0,0 slot ne' },
    {
      form: 'unallocate: <item> at <q>,<r> position <n>',
      example: 'unallocate: cluster-jewel at 0,0 position 1',
      note: 'gives the point back, and is refused where taking it back would leave anything still allocated touching nothing — so a plane is unwound from its leaves inward',
    },
    {
      form: 'unallocate: <item> at <q>,<r> slot <direction>',
      example: 'unallocate: cluster-jewel at 0,0 slot ne',
      note: 'always refused: a jewel socket is spent for good, so what this writes down is that a plane cannot be shrunk out from under a jewel',
    },
    { form: 'apply: <item> at <q>,<r> with <effect item>', example: 'apply: cluster-jewel at 0,0 with polish' },
    { form: 'refuse: <the growth directive that must not take>', example: 'refuse: slot cluster-jewel at 0,0 ne with small-jewel' },
    { form: 'open-modal: <modal>', example: `open-modal: ${MODAL_SCREENS[0]}`, holds: () => ({ modal: modalScreen }) },
    { form: 'submit-modal: <key>=<value>', example: 'submit-modal: name=Ash' },
    ...NOTE_FIELDS.map((field) => ({
      form: `${field.name}: <${field.records}>`,
      example: `${field.name}: the mirror answered, but nothing said what it cost`,
    })),
    { form: 'refused', example: 'refused', note: REFUSED_STANDS_UNDER },
    {
      form: 'page: <layer>/<page>',
      example: 'page: character/inventory',
      note: 'where in the app the player went, which the engine has no pages to honour and passes over',
    },
  ],
  parse: (raw) => {
    if (!raw.id) throw new DslError('# test requires an id', raw.span);
    return { id: raw.id, directives: parseLines(raw.body) };
  },
  print: (value, { moduleId }) => [`# test ${moduleLocalId(moduleId, value.id)}`, ...value.directives.flatMap(printDirectiveLines)],
  visit: (value, where, visit) => {
    for (const directive of value.directives ?? []) visitDirective(directive, where, visit);
  },
});

export function visitDirective(value: Directive, where: string, visit: Visit): void {
  switch (value.kind) {
    case 'run':
      put(value, 'test', 'test', `${where} run:`, visit);
      return;
    case 'talk':
      put(value, 'entity', 'entity', `${where} talk:`, visit);
      return;
    case 'travel':
      put(value, 'location', 'location', `${where} travel:`, visit);
      return;
    case 'goto':
      putLocation(value, 'location', `${where} goto:`, visit);
      return;
    case 'craft':
      put(value, 'recipe', 'recipe', `${where} craft:`, visit);
      return;
    case 'shop':
      put(value, 'shop', 'shop', `${where} shop:`, visit);
      return;
    case 'expect':
    case 'expect-only':
    case 'load':
      put(value, 'save', 'save', `${where} ${value.kind}:`, visit);
      return;
    case 'assert':
      visitCondition(value.condition, `${where} assert:`, visit);
      return;
    case 'journal':
      put(value, 'quest', 'quest', `${where} journal:`, visit);
      return;
    case 'begin':
      visitDirective(value.inner, `${where} begin:`, visit);
      return;
    case 'use': {
      if (!isActionOwnerKind(value.obj)) return;
      put(value, 'objId', value.obj, `${where} use:`, visit);
      value.actionId = lastSegment(visit(ACTION_MEMBER, memberKey(ACTION_MEMBER, value.obj, value.objId, value.actionId), `${where} use:`));
      return;
    }
    case 'use-on':
      put(value, 'action', 'action', `${where} use:`, visit);
      put(value, 'target', 'entity', `${where} use: on`, visit);
      return;
    case 'equip':
      putCarried(value, 'item', `${where} equip:`, visit);
      return;
    case 'swap':
      putCarried(value, 'one', `${where} swap:`, visit);
      putCarried(value, 'other', `${where} swap: with`, visit);
      return;
    case 'slot':
      putCarried(value, 'target', `${where} slot:`, visit);
      put(value, 'jewel', 'item', `${where} slot: with`, visit);
      return;
    case 'apply':
      putCarried(value, 'target', `${where} apply:`, visit);
      put(value, 'effect', 'item', `${where} apply: with`, visit);
      return;
    case 'allocate':
    case 'unallocate':
      putCarried(value, 'target', `${where} ${value.kind}:`, visit);
      return;
    case 'refuse':
      visitDirective(value.inner, `${where} refuse:`, visit);
      return;
    case 'until':
      visitDirective(value.inner, `${where} until:`, visit);
      if (value.until !== 'done' && !isCycles(value.until)) visitCondition(value.until, `${where} until:`, visit);
      return;
    case 'loop':
      if (!isCycles(value.until)) visitCondition(value.until, `${where} until:`, visit);
      for (const inner of value.body) visitDirective(inner, `${where} until:`, visit);
      return;
    case 'note':
    case 'refused':
    case 'page':
    case 'unequip':
    case 'setting':
    case 'debug':
    case 'open-modal':
    case 'submit-modal':
    case 'choose':
    case 'cancel':
    case 'wait':
    case 'wait-out':
      return;
    default: {
      const unreached: never = value;
      void unreached;
    }
  }
}
