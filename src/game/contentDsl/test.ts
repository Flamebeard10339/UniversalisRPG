import { Condition, condition } from './condition';
import { Cursor, DslError } from './parser';
import { RawSection } from './structure';

export type Directive =
  | { kind: 'run'; test: string }
  | { kind: 'talk'; entity: string }
  | { kind: 'choose'; text: string }
  | { kind: 'use'; obj: string; objId: string; actionId: string }
  | { kind: 'travel'; location: string }
  | { kind: 'expect'; condition: Condition };

export interface Test {
  id: string;
  directives: Directive[];
}

const RUN = /^run:[ \t]*(?<id>[a-z][a-z0-9-]*)$/;
const TALK = /^talk:[ \t]*(?<id>[a-z][a-z0-9-]*)$/;
const CHOOSE = /^choose:[ \t]*(?<text>.*)$/;
const USE = /^use:[ \t]*(?<obj>[a-z][a-z0-9-]*)\.(?<objId>[a-z][a-z0-9-]*)\.(?<actionId>.+)$/;
const TRAVEL = /^travel:[ \t]*(?<id>[a-z][a-z0-9-]*)$/;
const EXPECT = /^expect:[ \t]*(?<cond>.+)$/;

export function parseTest(section: RawSection): Test {
  if (!section.id) throw new DslError('# test requires an id', section.span);
  const directives: Directive[] = [];

  for (const line of section.body) {
    if (line.children.length > 0) throw new DslError(`# test directives are single-line: ${line.text}`, line.span);

    const run = RUN.exec(line.text)?.groups;
    const talk = TALK.exec(line.text)?.groups;
    const choose = CHOOSE.exec(line.text)?.groups;
    const use = USE.exec(line.text)?.groups;
    const travel = TRAVEL.exec(line.text)?.groups;
    const expect = EXPECT.exec(line.text)?.groups;

    if (run) directives.push({ kind: 'run', test: run.id });
    else if (talk) directives.push({ kind: 'talk', entity: talk.id });
    else if (choose) directives.push({ kind: 'choose', text: choose.text });
    else if (use) directives.push({ kind: 'use', obj: use.obj, objId: use.objId, actionId: use.actionId });
    else if (travel) directives.push({ kind: 'travel', location: travel.id });
    else if (expect) directives.push({ kind: 'expect', condition: condition.parse(new Cursor(expect.cond)) });
    else throw new DslError(`unexpected line in # test: ${JSON.stringify(line.text)}`, line.span);
  }

  return { id: section.id, directives };
}
