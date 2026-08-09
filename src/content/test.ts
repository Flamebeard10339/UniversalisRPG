import { Condition, condition } from '../grammar/condition';
import { DslError, parseWhole } from '../grammar/parser';
import { RawSection } from '../grammar/structure';

export type Directive =
  | { kind: 'run'; test: string }
  | { kind: 'talk'; entity: string }
  | { kind: 'choose'; text: string }
  | { kind: 'use'; obj: string; objId: string; actionId: string }
  // The two-sided spelling, beside the form it does not replace: an action
  // brought by the player and applied to what it names.
  | { kind: 'use-on'; action: string; target: string }
  | { kind: 'travel'; location: string }
  | { kind: 'craft'; recipe: string }
  | { kind: 'begin'; inner: Extract<Directive, { kind: 'use' | 'use-on' | 'travel' | 'craft' }> }
  | { kind: 'assert'; condition: Condition }
  | { kind: 'expect'; save: string }
  | { kind: 'load'; save: string }
  | { kind: 'cancel' }
  | { kind: 'wait'; seconds: number }
  | { kind: 'equip'; item: string }
  | { kind: 'unequip'; slot: string }
  | { kind: 'submit-modal'; key: string; value: string };

export interface Test {
  id: string;
  directives: Directive[];
}

// Factored out so `begin:` can take the same payload with the verb inline.
const PATH = '[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)*';
const USE_PAYLOAD = `(?<obj>[a-z][a-z0-9-]*)\\.(?<objId>${PATH})\\.(?<actionId>.+)`;
const USE_ON_PAYLOAD = `(?<action>${PATH})[ \\t]+on[ \\t]+(?<target>${PATH})`;
const TRAVEL_PAYLOAD = `(?<id>${PATH})`;
const CRAFT_PAYLOAD = `(?<id>${PATH})`;

const RUN = new RegExp(`^run:[ \\t]*(?<id>${PATH})$`);
const TALK = new RegExp(`^talk:[ \\t]*(?<id>${PATH})$`);
const CHOOSE = /^choose:[ \t]*(?<text>.*)$/;
const USE = new RegExp(`^use:[ \\t]*${USE_PAYLOAD}$`);
const USE_ON = new RegExp(`^use:[ \\t]*${USE_ON_PAYLOAD}$`);
const TRAVEL = new RegExp(`^travel:[ \\t]*${TRAVEL_PAYLOAD}$`);
const CRAFT = new RegExp(`^craft:[ \\t]*${CRAFT_PAYLOAD}$`);
const BEGIN = /^begin:[ \t]*(?<verb>use|travel|craft)[ \t]+(?<rest>.+)$/;
const BEGIN_USE = new RegExp(`^${USE_PAYLOAD}$`);
const BEGIN_USE_ON = new RegExp(`^${USE_ON_PAYLOAD}$`);
const BEGIN_TRAVEL = new RegExp(`^${TRAVEL_PAYLOAD}$`);
const BEGIN_CRAFT = new RegExp(`^${CRAFT_PAYLOAD}$`);
const ASSERT = /^assert:[ \t]*(?<cond>.+)$/;
const EXPECT = new RegExp(`^expect:[ \\t]*(?<id>${PATH})$`);
const LOAD = new RegExp(`^load:[ \\t]*(?<id>${PATH})$`);
const CANCEL = /^cancel$/;
const WAIT = /^wait:[ \t]*(?<seconds>\d+(?:\.\d+)?)$/;
const EQUIP = new RegExp(`^equip:[ \\t]*(?<item>${PATH})$`);
const UNEQUIP = new RegExp(`^unequip:[ \\t]*(?<slot>${PATH})$`);
const SUBMIT_MODAL_VERB = /^submit-modal:/;
// One pair per line, the value running to the end of it, so an answer may hold
// the spaces and punctuation a dialogue line is written with.
const SUBMIT_MODAL = /^submit-modal:[ \t]*(?<key>[a-z][a-z0-9-]*)=(?<value>.*)$/;

function parseBegin(text: string, verb: string, rest: string): Directive {
  if (verb === 'use') {
    const m = BEGIN_USE.exec(rest)?.groups;
    if (m) return { kind: 'begin', inner: { kind: 'use', obj: m.obj, objId: m.objId, actionId: m.actionId } };
    const on = BEGIN_USE_ON.exec(rest)?.groups;
    if (!on) throw new DslError(`malformed begin: use payload (expected obj.objId.actionId, or <action> on <target>): ${text}`);
    return { kind: 'begin', inner: { kind: 'use-on', action: on.action, target: on.target } };
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

// The sole parser for directive lines, shared by parseTest and the CLI.
export function parseDirectiveLine(text: string): Directive | null {
  const run = RUN.exec(text)?.groups;
  if (run) return { kind: 'run', test: run.id };

  const talk = TALK.exec(text)?.groups;
  if (talk) return { kind: 'talk', entity: talk.id };

  const choose = CHOOSE.exec(text)?.groups;
  if (choose) return { kind: 'choose', text: choose.text };

  // The dotted form is tried first, because its `<obj>.<objId>.` prefix is the
  // narrower shape: an action LABEL may hold the word "on", and reading
  // `use: entity.mirror.look on shelf` as two-sided would make that label
  // unaddressable.
  const use = USE.exec(text)?.groups;
  if (use) return { kind: 'use', obj: use.obj, objId: use.objId, actionId: use.actionId };

  const useOn = USE_ON.exec(text)?.groups;
  if (useOn) return { kind: 'use-on', action: useOn.action, target: useOn.target };

  const travel = TRAVEL.exec(text)?.groups;
  if (travel) return { kind: 'travel', location: travel.id };

  const craft = CRAFT.exec(text)?.groups;
  if (craft) return { kind: 'craft', recipe: craft.id };

  const begin = BEGIN.exec(text)?.groups;
  if (begin) return parseBegin(text, begin.verb, begin.rest);

  const assert = ASSERT.exec(text)?.groups;
  if (assert) return { kind: 'assert', condition: parseWhole(condition, assert.cond, 0, 'an assert condition') };

  const expect = EXPECT.exec(text)?.groups;
  if (expect) return { kind: 'expect', save: expect.id };

  const load = LOAD.exec(text)?.groups;
  if (load) return { kind: 'load', save: load.id };

  if (CANCEL.test(text)) return { kind: 'cancel' };

  const wait = WAIT.exec(text)?.groups;
  if (wait) return { kind: 'wait', seconds: Number(wait.seconds) };

  const equip = EQUIP.exec(text)?.groups;
  if (equip) return { kind: 'equip', item: equip.item };

  const unequip = UNEQUIP.exec(text)?.groups;
  if (unequip) return { kind: 'unequip', slot: unequip.slot };

  if (SUBMIT_MODAL_VERB.test(text)) {
    const submit = SUBMIT_MODAL.exec(text)?.groups;
    if (!submit) throw new DslError(`malformed submit-modal: payload (expected <key>=<value>): ${text}`);
    return { kind: 'submit-modal', key: submit.key, value: submit.value };
  }

  return null;
}

export function parseTest(section: RawSection): Test {
  if (!section.id) throw new DslError('# test requires an id', section.span);
  const directives: Directive[] = [];

  for (const line of section.body) {
    if (line.children.length > 0) throw new DslError(`# test directives are single-line: ${line.text}`, line.span);

    const directive = parseDirectiveLine(line.text);
    if (!directive) throw new DslError(`unexpected line in # test: ${JSON.stringify(line.text)}`, line.span);
    directives.push(directive);
  }

  return { id: section.id, directives };
}
