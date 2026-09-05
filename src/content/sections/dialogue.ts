import { ActionResult, itemCost, parseResultLine, resultGrammar, resultLines, startsResult } from '../../grammar/actionResult';
import { Condition, condition } from '../../grammar/condition';
import { Cursor, DslError, calledBlock, parseWhole, Written } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { fragment, parseSegments, printSegments, TextSegment } from '../../grammar/segment';
import { indentLines, RawLine, REFERENCE, takeBlock } from '../../grammar/structure';
import { overlay } from '../merge';
import { DIALOGUE_NODE } from '../namespace';
import { section } from './define';
import { condition as visitCondition, put, results, segments, type Visit } from '../refs';

export interface Spoken {
  segments: TextSegment[];
  key?: string;
}

export interface Choice extends Spoken {
  when?: Condition;
  effects: ActionResult[];
  goto?: string;
}

export type NodeStep = ({ kind: 'say' } & Spoken) | { kind: 'effect'; result: ActionResult } | { kind: 'goto'; target: string } | { kind: 'menu'; choices: Choice[] };

type Asked = Extract<ActionResult, { kind: 'say' }>;

export interface DialogueNode {
  name: string;
  always?: boolean;
  when?: Condition;
  ask?: Asked;
  sticky?: boolean;
  again?: Spoken;
  steps: NodeStep[];
}

export const offering = (node: DialogueNode): boolean => node.always === true || node.when !== undefined;

export const isThread = (node: DialogueNode): boolean => node.when !== undefined || node.ask !== undefined;

export const nodeEffects = (node: DialogueNode): ActionResult[] => node.steps.flatMap((step) => (step.kind === 'effect' ? [step.result] : []));

export interface Dialogue {
  id: string;
  owner?: string;
  fromQuest?: string;
  nodes: DialogueNode[];
}

export const givenByQuest = (dialogue: Dialogue): boolean => dialogue.fromQuest !== undefined;

const PATH = REFERENCE.source;
const OWNER = new RegExp(`^owner[ \\t]*=[ \\t]*(?<id>${PATH})$`);
const NODE = /^node[ \t]+(?<name>[a-z][a-z0-9-]*):$/;
const WHEN = /^when:[ \t]*(?<cond>.+)$/;
const AGAIN = /^again:[ \t]?(?<text>.*)$/;
const ASK = /^ask:[ \t]?(?<text>.*)$/;
const GOTO = /^goto[ \t]+(?<target>[a-z][a-z0-9-]*)$/;
const CHOICE = /^->[ \t]+(?<text>.*?)(?:[ \t]+\(when[ \t]+(?<cond>[^)]+)\))?[ \t]*$/;

function parseChoice(source: RawLine): Choice {
  const match = CHOICE.exec(source.text)?.groups;
  if (!match?.text) throw new DslError(`malformed choice: ${source.text}`, source.span);
  const choice: Choice = {
    segments: parseSegments(match.text, source.span.start),
    effects: [],
  };
  if (match.cond) choice.when = parseWhole(condition, match.cond, source.span.start, 'a choice when');
  for (const line of takeBlock(source)) {
    const goto = GOTO.exec(line.text)?.groups;
    if (goto) choice.goto = goto.target;
    else choice.effects.push(...parseResultLine(line));
  }
  return choice;
}

const GOES = (goes: { hole: string; like: string }): Written => ({
  form: `goto <${goes.hole}>`,
  example: `goto ${goes.like}`,
  family: 'where it goes',
  note: 'the next place in whatever this node is written in: a node of the dialogue, or a stage of the quest',
});

export const nodeGrammar = (goes = { hole: 'node', like: 'farewell' }): Written[] =>
  calledBlock('node', [
  { form: 'always', example: 'always', family: 'reached when', note: 'what this entity says when no thread of theirs is open, and nothing they say while one is — a greeting, not a thread, and never put up in a list beside one. `when: always` is the other word and the opposite thing: a thread of its own that stands open whatever the state of the world, which is how a line is put up beside the rest unconditionally' },
  { form: 'when: <condition>', example: 'when: has-key', family: 'reached when', holds: () => ({ condition }), note: 'a thread of its own, open while this holds, and put up beside whatever else the entity has open then' },
  { form: 'ask: <text>', example: 'ask: About the bees.', family: 'reached when', note: 'what the player picks to open this thread; a thread with no `ask:` is named in the list by the first line it says' },
  { form: 'sticky', example: 'sticky', family: 'reached when', note: 'without this, a node is said once and falls silent on every visit after — sticky says it again in full every time' },
  { form: 'again: <text>', example: 'again: We have spoken already.', family: 'what is said', holds: () => ({ text: fragment }), note: 'what a node without `sticky` says on a visit after its first, instead of the silence it would fall to' },
  { form: '<what is said>', example: 'A traveller, out here?', family: 'what is said', note: 'the words as the player hears them. A bare line is read as this wherever it is no other shape, so it holds no grammar of its own — but any number of `<fragment>` may stand in it, and a line left with nothing once they are weighed is not said at all rather than said blank: a clause only sometimes true can stand alone on its own line' },
  GOES(goes),
  { form: '-> <choice>[ (when <condition>)]', example: '-> Tell me more', family: 'where it goes', holds: () => ({ condition, choice: fragment }), block: () => [{ ...GOES(goes), note: 'where picking this choice leads' }, ...resultGrammar()] },
  ...resultGrammar(),
  ]);

function contradiction(node: DialogueNode): string | undefined {
  if (node.sticky && node.again) return `node ${node.name} is sticky and also writes again:, and a sticky node says everything again on every visit, so its again: line is never reached`;
  const cost = [...itemCost(nodeEffects(node)).keys()];
  if (cost.length > 0 && offering(node) && !isThread(node))
    return `node ${node.name} is what is said when no thread is open and also takes ${cost.join(', ')}, so a player who has not got it is offered nothing at all: write the take: under a -> choice, or make the node a thread with when: or ask:`;
  return undefined;
}

export function parseNode(name: string, source: RawLine): DialogueNode {
  const node: DialogueNode = { name, steps: [] };
  let menu: Choice[] | null = null;
  const flush = () => {
    if (menu) node.steps.push({ kind: 'menu', choices: menu });
    menu = null;
  };

  for (const line of takeBlock(source)) {
    if (line.text.startsWith('->')) {
      (menu ??= []).push(parseChoice(line));
      continue;
    }
    flush();

    const when = WHEN.exec(line.text)?.groups;
    const again = AGAIN.exec(line.text)?.groups;
    const ask = ASK.exec(line.text)?.groups;
    const goto = GOTO.exec(line.text)?.groups;
    if (when) node.when = parseWhole(condition, when.cond, line.span.start, 'a node when');
    else if (again) node.again = { segments: parseSegments(again.text, line.span.start) };
    else if (ask) node.ask = { kind: 'say', text: ask.text! };
    else if (line.text === 'always') node.always = true;
    else if (line.text === 'sticky') node.sticky = true;
    else if (goto) node.steps.push({ kind: 'goto', target: goto.target });
    else if (startsResult(new Cursor(line.text))) for (const result of parseResultLine(line)) node.steps.push({ kind: 'effect', result });
    else
      node.steps.push({
        kind: 'say',
        segments: parseSegments(line.text, line.span.start),
      });
  }
  flush();
  const problem = contradiction(node);
  if (problem) throw new DslError(problem, source.span);
  return node;
}

function mergeNodes(into: Dialogue, from: Dialogue): Dialogue {
  const nodes = [...into.nodes];
  for (const node of from.nodes) {
    const at = nodes.findIndex((existing) => existing.name === node.name);
    if (at === -1) nodes.push(node);
    else {
      const merged = overlay(nodes[at] as unknown as Record<string, unknown>, node as unknown as Record<string, unknown>) as unknown as DialogueNode;
      const problem = contradiction(merged);
      if (problem) throw new DslError(`${into.id}: ${problem}`);
      nodes[at] = merged;
    }
  }
  return {
    ...into,
    ...(from.owner !== undefined ? { owner: from.owner } : {}),
    nodes,
  };
}

export const nodeLines = (node: DialogueNode): string[] => [`node ${node.name}:`, ...nodeBody(node)];

export function nodeBody(node: DialogueNode): string[] {
  const lines: string[] = [];
  if (node.always) lines.push('  always');
  if (node.when) lines.push(`  when: ${condition.print(node.when)}`);
  if (node.ask) lines.push(`  ask: ${node.ask.text}`);
  if (node.sticky) lines.push('  sticky');
  if (node.again) lines.push(`  again: ${printSegments(node.again.segments)}`);
  for (const step of node.steps) {
    if (step.kind === 'say') lines.push(`  ${printSegments(step.segments)}`);
    else if (step.kind === 'effect') lines.push(...indentLines(resultLines(step.result)));
    else if (step.kind === 'goto') lines.push(`  goto ${step.target}`);
    else {
      for (const choice of step.choices) {
        lines.push(`  -> ${printSegments(choice.segments)}${choice.when ? ` (when ${condition.print(choice.when)})` : ''}`);
        if (choice.goto) lines.push(`    goto ${choice.goto}`);
        for (const effect of choice.effects) lines.push(...indentLines(resultLines(effect), 4));
      }
    }
  }
  return lines;
}

function unknownNode(value: Dialogue): string | undefined {
  const names = new Set(value.nodes.map((node) => node.name));
  for (const node of value.nodes) {
    const where = `node ${node.name}`;
    if (node.ask && !offering(node)) return `${where} writes ask: and is only ever arrived at from another node, so nothing ever puts its phrase to a player: write always or a when: beside it`;
    for (const step of node.steps) {
      if (step.kind === 'goto' && !names.has(step.target)) return `${where} goto names an unknown node: ${step.target}`;
      if (step.kind !== 'menu') continue;
      for (const choice of step.choices) if (choice.goto !== undefined && !names.has(choice.goto)) return `${where} choice goto names an unknown node: ${choice.goto}`;
    }
  }
  return undefined;
}

export const dialogue = section<Dialogue>()({
  kind: 'dialogue',
  ids: 'owned',
  vocabulary: 'declared',
  validate: unknownNode,
  map: 'dialogues',
  says: (value) => value.nodes.map((node) => (node.ask === undefined ? [] : [node.ask])),
  members: (value) => value.nodes.map((node) => ({ kind: DIALOGUE_NODE, name: node.name })),
  grammar: [
    {
      form: 'owner = <entity>',
      example: 'owner = guide',
      note: 'who speaks it, and every dialogue anyone has given them answers at once: talking to them puts up everything they hold open, whoever wrote it, and they pick. One thing open is said outright with no list to pick from, which is what a route reaches after a bare `talk:`. A plain `always` node is not one of those things — it is what they say when nothing else stands open — so an entity holding a thread says the thread and keeps the greeting to itself',
    },
    { form: 'node <name>:', example: 'node greet:', over: 'by name', block: () => nodeGrammar() },
  ],
  parse: (raw) => {
    if (!raw.id) throw new DslError('# dialogue requires an id', raw.span);
    const parsed: Dialogue = { id: raw.id, nodes: [] };

    for (const line of raw.body) {
      const owner = OWNER.exec(line.text)?.groups;
      const node = NODE.exec(line.text)?.groups;
      if (owner) parsed.owner = owner.id;
      else if (node) parsed.nodes.push(parseNode(node.name, line));
      else throw new DslError(`unexpected line in # dialogue: ${JSON.stringify(line.text)}`, line.span);
    }
    return parsed;
  },
  print: (value, { moduleId }) => [`# dialogue ${moduleLocalId(moduleId, value.id)}`, ...(value.owner ? [`owner = ${value.owner}`] : []), ...value.nodes.flatMap((node, at) => (at === 0 && !value.owner ? nodeLines(node) : ['', ...nodeLines(node)]))],
  merge: (into, from) => (into === undefined ? from : mergeNodes(into as Dialogue, from as Dialogue)),
  visit: visitDialogue,
});

export const spokenBy = (dialogues: ReadonlyMap<string, Dialogue>, owner: string): Dialogue[] => [...dialogues.values()].filter((each) => each.owner === owner);

export function visitDialogue(value: Dialogue, where: string, visit: Visit): void {
  put(value, 'owner', 'entity', `${where} owner`, visit);
  for (const node of value.nodes ?? []) {
    const at = `${where} node ${node.name}`;
    visitCondition(node.when, `${at} when:`, visit);
    segments(node.again?.segments, at, visit);
    for (const step of node.steps ?? []) {
      if (step.kind === 'effect') results([step.result], at, visit);
      if (step.kind === 'say') segments(step.segments, at, visit);
      if (step.kind === 'menu') {
        for (const choice of step.choices) {
          segments(choice.segments, `${at} choice`, visit);
          visitCondition(choice.when, `${at} choice when`, visit);
          results(choice.effects, `${at} choice`, visit);
        }
      }
    }
  }
}
