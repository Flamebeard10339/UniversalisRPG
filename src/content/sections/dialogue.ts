import { ActionResult, parseResultLine, resultGrammar, resultLines, startsResult } from '../../grammar/actionResult';
import { Condition, condition } from '../../grammar/condition';
import { Cursor, DslError, parseWhole, Written } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { parseSegments, printSegments, TextSegment } from '../../grammar/segment';
import { indentLines, RawLine, takeBlock } from '../../grammar/structure';
import { overlay } from '../merge';
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

export interface DialogueNode {
  name: string;
  // Reachable on its own rather than only by a goto, which is what an entity says when nothing further along has anything to say. A `when:` beside it narrows when that is.
  always?: boolean;
  when?: Condition;
  once?: boolean;
  sticky?: boolean;
  again?: Spoken;
  steps: NodeStep[];
}

export interface Dialogue {
  id: string;
  owner?: string;
  nodes: DialogueNode[];
}

const PATH = '[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)*';
const OWNER = new RegExp(`^owner[ \\t]*=[ \\t]*(?<id>${PATH})$`);
const NODE = /^node[ \t]+(?<name>[a-z][a-z0-9-]*):$/;
const WHEN = /^when:[ \t]*(?<cond>.+)$/;
const AGAIN = /^again:[ \t]?(?<text>.*)$/;
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

// The lines a node holds, which is the same grammar wherever a node is written — in a # dialogue of its own, or under a stage of a quest. What a goto names is the one thing that differs, because what a node sits in is what it goes to next.
export const nodeGrammar = (goes = { hole: 'node', like: 'farewell' }): Written[] => [
  { form: 'always', example: 'always', family: 'reached when', note: 'reached whenever nothing further along is, which is what this entity says by default' },
  { form: 'when: <condition>', example: 'when: has-key', family: 'reached when', holds: () => ({ condition }) },
  { form: 'once', example: 'once', family: 'reached when' },
  { form: 'sticky', example: 'sticky', family: 'reached when', note: 'without this, a node is said once and falls silent on every visit after — sticky says it again in full every time' },
  { form: 'again: <text>', example: 'again: We have spoken already.', family: 'what is said', note: 'what a node without sticky says on a visit after its first, instead of the silence it would otherwise fall to — a sticky node is refused one, because it says everything again anyway' },
  { form: '<what is said>', example: 'A traveller, out here?', family: 'what is said' },
  { form: `goto <${goes.hole}>`, example: `goto ${goes.like}`, family: 'where it goes' },
  { form: '-> <choice>[ (when <condition>)]', example: '-> Tell me more', family: 'where it goes', holds: () => ({ condition }), block: () => [{ form: `goto <${goes.hole}>`, example: `goto ${goes.like}`, family: 'where it goes' }, ...resultGrammar()] },
  ...resultGrammar(),
];

// `sticky` says a node in full on every visit, and `again:` is what a node without it says instead of the silence it would otherwise fall to. A node writing both has written a line nothing reaches.
function contradiction(node: DialogueNode): string | undefined {
  if (node.sticky && node.again) return `node ${node.name} is sticky and also writes again:, and a sticky node says everything again on every visit, so its again: line is never reached`;
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
    const goto = GOTO.exec(line.text)?.groups;
    if (when) node.when = parseWhole(condition, when.cond, line.span.start, 'a node when');
    else if (again) node.again = { segments: parseSegments(again.text, line.span.start) };
    else if (line.text === 'always') node.always = true;
    else if (line.text === 'once') node.once = true;
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

// A node's own lines, indented once, without the heading that names it — which is what a quest writes under a stage instead.
export function nodeBody(node: DialogueNode): string[] {
  const lines: string[] = [];
  if (node.always) lines.push('  always');
  if (node.when) lines.push(`  when: ${condition.print(node.when)}`);
  if (node.once) lines.push('  once');
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

// A goto names a node of this dialogue, and this dialogue holds every node it may name, so the answer is here and needs nothing else loaded.
function unknownNode(value: Dialogue): string | undefined {
  const names = new Set(value.nodes.map((node) => node.name));
  for (const node of value.nodes) {
    const where = `node ${node.name}`;
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
  validate: unknownNode,
  map: 'dialogues',
  grammar: [
    { form: 'owner = <entity>', example: 'owner = guide' },
    { form: 'node <name>:', example: 'node greet:', block: () => nodeGrammar() },
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

// Everything an entity says. A dialogue names its owner rather than an owner naming its dialogue, so an entity speaks with as many voices as there are dialogues pointing at it — its own, and whatever a quest or an expansion has since given it. They are read in the order they were loaded, so a module that loads later has the last word, which is what an expansion is for.
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
