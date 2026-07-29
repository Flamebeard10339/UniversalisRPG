import { Condition, condition } from '../grammar/condition';
import { Cursor, DslError } from '../grammar/parser';
import { RawSection } from '../grammar/structure';

export type Directive =
  | { kind: 'run'; test: string }
  | { kind: 'talk'; entity: string }
  | { kind: 'choose'; text: string }
  | { kind: 'use'; obj: string; objId: string; actionId: string }
  | { kind: 'travel'; location: string }
  | { kind: 'craft'; recipe: string }
  | { kind: 'begin'; inner: Extract<Directive, { kind: 'use' | 'travel' | 'craft' }> }
  | { kind: 'assert'; condition: Condition }
  | { kind: 'expect'; save: string }
  | { kind: 'load'; save: string }
  | { kind: 'cancel' }
  | { kind: 'wait'; seconds: number };

export interface Test {
  id: string;
  directives: Directive[];
}

// Factored out so `begin:` can take the same payload with the verb inline.
const PATH = '[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)*';
const USE_PAYLOAD = `(?<obj>[a-z][a-z0-9-]*)\\.(?<objId>${PATH})\\.(?<actionId>.+)`;
const TRAVEL_PAYLOAD = `(?<id>${PATH})`;
const CRAFT_PAYLOAD = `(?<id>${PATH})`;

const RUN = new RegExp(`^run:[ \\t]*(?<id>${PATH})$`);
const TALK = new RegExp(`^talk:[ \\t]*(?<id>${PATH})$`);
const CHOOSE = /^choose:[ \t]*(?<text>.*)$/;
const USE = new RegExp(`^use:[ \\t]*${USE_PAYLOAD}$`);
const TRAVEL = new RegExp(`^travel:[ \\t]*${TRAVEL_PAYLOAD}$`);
const CRAFT = new RegExp(`^craft:[ \\t]*${CRAFT_PAYLOAD}$`);
const BEGIN = /^begin:[ \t]*(?<verb>use|travel|craft)[ \t]+(?<rest>.+)$/;
const BEGIN_USE = new RegExp(`^${USE_PAYLOAD}$`);
const BEGIN_TRAVEL = new RegExp(`^${TRAVEL_PAYLOAD}$`);
const BEGIN_CRAFT = new RegExp(`^${CRAFT_PAYLOAD}$`);
const ASSERT = /^assert:[ \t]*(?<cond>.+)$/;
const EXPECT = new RegExp(`^expect:[ \\t]*(?<id>${PATH})$`);
const LOAD = new RegExp(`^load:[ \\t]*(?<id>${PATH})$`);
const CANCEL = /^cancel$/;
const WAIT = /^wait:[ \t]*(?<seconds>\d+(?:\.\d+)?)$/;

function parseBegin(text: string, verb: string, rest: string): Directive {
  if (verb === 'use') {
    const m = BEGIN_USE.exec(rest)?.groups;
    if (!m) throw new DslError(`malformed begin: use payload (expected obj.objId.actionId): ${text}`);
    return { kind: 'begin', inner: { kind: 'use', obj: m.obj, objId: m.objId, actionId: m.actionId } };
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

  const use = USE.exec(text)?.groups;
  if (use) return { kind: 'use', obj: use.obj, objId: use.objId, actionId: use.actionId };

  const travel = TRAVEL.exec(text)?.groups;
  if (travel) return { kind: 'travel', location: travel.id };

  const craft = CRAFT.exec(text)?.groups;
  if (craft) return { kind: 'craft', recipe: craft.id };

  const begin = BEGIN.exec(text)?.groups;
  if (begin) return parseBegin(text, begin.verb, begin.rest);

  const assert = ASSERT.exec(text)?.groups;
  if (assert) return { kind: 'assert', condition: condition.parse(new Cursor(assert.cond)) };

  const expect = EXPECT.exec(text)?.groups;
  if (expect) return { kind: 'expect', save: expect.id };

  const load = LOAD.exec(text)?.groups;
  if (load) return { kind: 'load', save: load.id };

  if (CANCEL.test(text)) return { kind: 'cancel' };

  const wait = WAIT.exec(text)?.groups;
  if (wait) return { kind: 'wait', seconds: Number(wait.seconds) };

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
