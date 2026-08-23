import { Condition, condition } from '../../grammar/condition';
import { DslError, parseWhole } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { hasBlock } from '../../grammar/structure';
import { Direction, DIRECTIONS, Hex, hexKey, parseHexKey, PlaneNode } from '../hex';

import { section } from './define';
import { condition as visitCondition, put, putCarried, type Visit } from '../refs';
import { isActionOwnerKind } from './define';
import { ACTION_MEMBER, memberKey } from '../namespace';
import { lastSegment } from '../../grammar/values';

export type Directive =
  | { kind: 'run'; test: string }
  | { kind: 'talk'; entity: string }
  | { kind: 'choose'; text: string }
  | { kind: 'use'; obj: string; objId: string; actionId: string }
  | { kind: 'use-on'; action: string; target: string }
  | { kind: 'travel'; location: string }
  | { kind: 'goto'; location: string }
  | { kind: 'craft'; recipe: string }
  | {
      kind: 'begin';
      inner: Extract<Directive, { kind: 'use' | 'use-on' | 'travel' | 'craft' }>;
    }
  | { kind: 'assert'; condition: Condition }
  | { kind: 'expect'; save: string }
  | { kind: 'expect-only'; save: string }
  | { kind: 'load'; save: string }
  | { kind: 'cancel' }
  | { kind: 'wait'; seconds: number }
  | { kind: 'wait-out' }
  | { kind: 'equip'; item: string }
  | { kind: 'unequip'; slot: string }
  | { kind: 'feed'; target: string; food: string }
  | {
      kind: 'slot';
      target: string;
      hex: Hex;
      direction: Direction;
      jewel: string;
    }
  | { kind: 'allocate'; target: string; node: PlaneNode }
  | { kind: 'apply'; target: string; hex: Hex; effect: string }
  | { kind: 'refuse'; inner: GrowthDirective }
  | { kind: 'until'; inner: Directive; until: Terminator }
  | { kind: 'open-modal'; modal: string }
  | { kind: 'submit-modal'; key: string; value: string };

export type GrowthDirective = Extract<Directive, { kind: 'feed' | 'slot' | 'allocate' | 'apply' }>;

// `done` is a fact about the action system — nothing is under way — not a fact about game state, so no engine root could ever spell it and it stays a word rather than a condition.
export type Terminator = 'done' | Condition;

export interface Test {
  id: string;
  directives: Directive[];
}

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
const BEGIN = /^begin:[ \t]*(?<verb>use|travel|craft)[ \t]+(?<rest>.+)$/;
const BEGIN_USE = new RegExp(`^${USE_PAYLOAD}$`);
const BEGIN_USE_ON = new RegExp(`^${USE_ON_PAYLOAD}$`);
const BEGIN_TRAVEL = new RegExp(`^${TRAVEL_PAYLOAD}$`);
const BEGIN_CRAFT = new RegExp(`^${CRAFT_PAYLOAD}$`);
const ASSERT = /^assert:[ \t]*(?<cond>.+)$/;
const EXPECT = new RegExp(`^expect:[ \\t]*(?<id>${PATH})$`);
const EXPECT_ONLY = new RegExp(`^expect only:[ \\t]*(?<id>${PATH})$`);
const LOAD = new RegExp(`^load:[ \\t]*(?<id>${PATH})$`);
const CANCEL = /^cancel$/;
const WAIT = /^wait:[ \t]*(?<seconds>\d+(?:\.\d+)?)$/;
const WAIT_OUT = /^wait:[ \t]*done$/;
const UNTIL = /^(?<rest>.+)[ \t]+until[ \t]+(?<terminator>.+)$/;

function parseTerminator(text: string): Terminator | null {
  if (text.trim() === 'done') return 'done';
  try {
    return parseWhole(condition, text, 0, 'an until condition');
  } catch {
    return null;
  }
}
const CARRIED = `(?:${PATH}|[0-9]+)`;
const HEX = '-?\\d+,-?\\d+';
const DIRECTION = [...DIRECTIONS].sort((a, b) => b.length - a.length).join('|');

const EQUIP = new RegExp(`^equip:[ \\t]*(?<item>${CARRIED})$`);
const UNEQUIP = new RegExp(`^unequip:[ \\t]*(?<slot>${PATH})$`);

const GROWTH_PAYLOAD = {
  feed: `(?<target>${CARRIED})[ \\t]+with[ \\t]+(?<food>${PATH})`,
  slot: `(?<target>${CARRIED})[ \\t]+at[ \\t]+(?<hex>${HEX})[ \\t]+(?<direction>${DIRECTION})[ \\t]+with[ \\t]+(?<jewel>${PATH})`,
  allocate: `(?<target>${CARRIED})[ \\t]+at[ \\t]+(?<hex>${HEX})[ \\t]+(?:position[ \\t]+(?<position>[0-9]+)|slot[ \\t]+(?<direction>${DIRECTION}))`,
  apply: `(?<target>${CARRIED})[ \\t]+at[ \\t]+(?<hex>${HEX})[ \\t]+with[ \\t]+(?<effect>${PATH})`,
} as const;

type GrowthVerb = GrowthDirective['kind'];
const GROWTH_VERBS = Object.keys(GROWTH_PAYLOAD) as GrowthVerb[];

const GROWTH_LINE = new Map(GROWTH_VERBS.map((verb) => [verb, new RegExp(`^${verb}:[ \\t]*${GROWTH_PAYLOAD[verb]}$`)]));
const GROWTH_INLINE = new Map(GROWTH_VERBS.map((verb) => [verb, new RegExp(`^${GROWTH_PAYLOAD[verb]}$`)]));
const GROWTH_VERB = new RegExp(`^(?<verb>${GROWTH_VERBS.join('|')}):`);
const REFUSE_VERB = /^refuse:/;
const REFUSE = new RegExp(`^refuse:[ \\t]*(?<verb>${GROWTH_VERBS.join('|')})[ \\t]+(?<rest>.+)$`);

const GROWTH_FORM: Readonly<Record<GrowthVerb, string>> = {
  feed: '<target> with <item>',
  slot: '<target> at <q>,<r> <direction> with <jewel item>',
  allocate: '<target> at <q>,<r> position <n>, or <target> at <q>,<r> slot <direction>',
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
  if (verb === 'feed') return { kind: 'feed', target, food: groups.food as string };

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
  return { kind: 'allocate', target, node };
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

  const begin = BEGIN.exec(text)?.groups;
  if (begin) return parseBegin(text, begin.verb, begin.rest);

  const assert = ASSERT.exec(text)?.groups;
  if (assert)
    return {
      kind: 'assert',
      condition: parseWhole(condition, assert.cond, 0, 'an assert condition'),
    };

  const expectOnly = EXPECT_ONLY.exec(text)?.groups;
  if (expectOnly) return { kind: 'expect-only', save: expectOnly.id };

  const expect = EXPECT.exec(text)?.groups;
  if (expect) return { kind: 'expect', save: expect.id };

  const load = LOAD.exec(text)?.groups;
  if (load) return { kind: 'load', save: load.id };

  if (CANCEL.test(text)) return { kind: 'cancel' };

  const wait = WAIT.exec(text)?.groups;
  if (wait) return { kind: 'wait', seconds: Number(wait.seconds) };

  if (WAIT_OUT.test(text)) return { kind: 'wait-out' };

  const equip = EQUIP.exec(text)?.groups;
  if (equip) return { kind: 'equip', item: equip.item };

  const unequip = UNEQUIP.exec(text)?.groups;
  if (unequip) return { kind: 'unequip', slot: unequip.slot };

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
  if (opening) return { kind: 'open-modal', modal: opening.name };

  if (SUBMIT_MODAL_VERB.test(text)) {
    const submit = SUBMIT_MODAL.exec(text)?.groups;
    if (!submit) throw new DslError(`malformed submit-modal: payload (expected <key>=<value>): ${text}`);
    return { kind: 'submit-modal', key: submit.key, value: submit.value };
  }

  return null;
}

function inlined(inner: Directive, verb = inner.kind): string {
  return `${verb} ${printDirective(inner).replace(/^[a-z-]+:[ \t]*/, '')}`;
}

export function printDirective(value: Directive): string {
  switch (value.kind) {
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
    case 'begin':
      return `begin: ${inlined(value.inner, value.inner.kind === 'use-on' ? 'use' : value.inner.kind)}`;
    case 'refuse':
      return `refuse: ${inlined(value.inner)}`;
    case 'until':
      return `${printDirective(value.inner)} until ${value.until === 'done' ? 'done' : condition.print(value.until)}`;
    case 'assert':
      return `assert: ${condition.print(value.condition)}`;
    case 'expect':
      return `expect: ${value.save}`;
    case 'expect-only':
      return `expect only: ${value.save}`;
    case 'load':
      return `load: ${value.save}`;
    case 'cancel':
      return 'cancel';
    case 'wait':
      return `wait: ${value.seconds}`;
    case 'wait-out':
      return 'wait: done';
    case 'equip':
      return `equip: ${value.item}`;
    case 'unequip':
      return `unequip: ${value.slot}`;
    case 'feed':
      return `feed: ${value.target} with ${value.food}`;
    case 'slot':
      return `slot: ${value.target} at ${hexKey(value.hex)} ${value.direction} with ${value.jewel}`;
    case 'allocate':
      return `allocate: ${value.target} at ${hexKey(value.node.hex)} ${value.node.kind === 'position' ? `position ${value.node.position}` : `slot ${value.node.direction}`}`;
    case 'apply':
      return `apply: ${value.target} at ${hexKey(value.hex)} with ${value.effect}`;
    case 'open-modal':
      return `open-modal: ${value.modal}`;
    case 'submit-modal':
      return `submit-modal: ${value.key}=${value.value}`;
    default: {
      const unreached: never = value;
      return unreached;
    }
  }
}

// The id under `use:` is of whatever kind the line itself opened with, and the action after it is keyed under that id rather than declared anywhere a name could be offered from.
const USED = { names: { id: '<kind>', action: null } };

export const test = section<Test>()({
  kind: 'test',
  ids: 'owned',
  map: 'tests',
  grammar: [
    { form: 'run: <test>', example: 'run: opening' },
    { form: 'talk: <entity>', example: 'talk: guide' },
    { form: 'choose: <what the choice reads>', example: 'choose: Tell me more' },
    { form: 'use: <kind>.<id>.<action>', example: 'use: item.rusty-sword.swing', ...USED },
    { form: 'use: <action> on <entity>', example: 'use: chop on oak' },
    { form: 'travel: <location>', example: 'travel: camp' },
    { form: 'goto: <location>', example: 'goto: camp' },
    { form: 'craft: <recipe>', example: 'craft: plank' },
    { form: 'begin: use <kind>.<id>.<action>', example: 'begin: use item.rusty-sword.swing', ...USED },
    { form: 'begin: travel <location>', example: 'begin: travel camp' },
    { form: 'begin: craft <recipe>', example: 'begin: craft plank' },
    { form: 'assert: <condition>', example: 'assert: has-key', holds: () => ({ condition }) },
    { form: 'expect: <save>', example: 'expect: after-intro' },
    { form: 'expect only: <save>', example: 'expect only: after-intro' },
    { form: 'load: <save>', example: 'load: after-intro' },
    { form: 'cancel', example: 'cancel' },
    { form: 'wait: <seconds>', example: 'wait: 1' },
    { form: 'wait: done', example: 'wait: done', note: 'stands until whatever is under way has finished, rather than a number of seconds guessed large enough to cover it' },
    {
      form: '<a directive that starts an action> until done',
      example: 'use: melee-combat on giant-rat until done',
      note: 'performs the directive, then stands until whatever it started has finished, exactly as wait: done does',
    },
    {
      form: '<a directive that starts an action> until <condition>',
      example: 'use: melee-combat on giant-rat until resource.health < 10',
      note: 'performs the directive, then keeps stepping what it started, one cycle at a time, until the condition holds or nothing is left under way',
      holds: () => ({ condition }),
    },
    { form: 'equip: <item>', example: 'equip: rusty-sword' },
    { form: 'unequip: <slot>', example: 'unequip: main-hand' },
    { form: 'feed: <item> with <item>', example: 'feed: cluster-jewel with fervour' },
    { form: 'slot: <item> at <q>,<r> <direction> with <jewel item>', example: 'slot: cluster-jewel at 0,0 ne with small-jewel' },
    { form: 'allocate: <item> at <q>,<r> position <n>', example: 'allocate: cluster-jewel at 0,0 position 1' },
    { form: 'allocate: <item> at <q>,<r> slot <direction>', example: 'allocate: cluster-jewel at 0,0 slot ne' },
    { form: 'apply: <item> at <q>,<r> with <effect item>', example: 'apply: cluster-jewel at 0,0 with polish' },
    { form: 'refuse: <the growth directive that must not take>', example: 'refuse: feed cluster-jewel with fervour' },
    { form: 'open-modal: <modal>', example: 'open-modal: name-yourself' },
    { form: 'submit-modal: <key>=<value>', example: 'submit-modal: name=Ash' },
  ],
  parse: (raw) => {
    if (!raw.id) throw new DslError('# test requires an id', raw.span);
    const directives: Directive[] = [];

    for (const line of raw.body) {
      if (hasBlock(line)) throw new DslError(`# test directives are single-line: ${line.text}`, line.span);

      const directive = parseDirectiveLine(line.text);
      if (!directive) throw new DslError(`unexpected line in # test: ${JSON.stringify(line.text)}`, line.span);
      directives.push(directive);
    }

    return { id: raw.id, directives };
  },
  print: (value, { moduleId }) => [`# test ${moduleLocalId(moduleId, value.id)}`, ...value.directives.map(printDirective)],
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
      put(value, 'location', 'location', `${where} goto:`, visit);
      return;
    case 'craft':
      put(value, 'recipe', 'recipe', `${where} craft:`, visit);
      return;
    case 'expect':
    case 'expect-only':
    case 'load':
      put(value, 'save', 'save', `${where} ${value.kind}:`, visit);
      return;
    case 'assert':
      visitCondition(value.condition, `${where} assert:`, visit);
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
    case 'feed':
      putCarried(value, 'target', `${where} feed:`, visit);
      put(value, 'food', 'item', `${where} feed: with`, visit);
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
      putCarried(value, 'target', `${where} allocate:`, visit);
      return;
    case 'refuse':
      visitDirective(value.inner, `${where} refuse:`, visit);
      return;
    case 'until':
      visitDirective(value.inner, `${where} until:`, visit);
      if (value.until !== 'done') visitCondition(value.until, `${where} until:`, visit);
      return;
    case 'unequip':
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
