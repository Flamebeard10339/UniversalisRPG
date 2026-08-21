import { ActionResult, parseResultLine, resultGrammar, resultLines, startsResult } from '../../grammar/actionResult';
import { Condition, condition } from '../../grammar/condition';
import { Cursor, DslError, parseWhole } from '../../grammar/parser';
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

function parseNode(name: string, source: RawLine): DialogueNode {
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
  return node;
}

function mergeNodes(into: Dialogue, from: Dialogue): Dialogue {
  const nodes = [...into.nodes];
  for (const node of from.nodes) {
    const at = nodes.findIndex((existing) => existing.name === node.name);
    if (at === -1) nodes.push(node);
    else nodes[at] = overlay(nodes[at] as unknown as Record<string, unknown>, node as unknown as Record<string, unknown>) as unknown as DialogueNode;
  }
  return {
    ...into,
    ...(from.owner !== undefined ? { owner: from.owner } : {}),
    nodes,
  };
}

function nodeLines(node: DialogueNode): string[] {
  const lines = [`node ${node.name}:`];
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

export const dialogue = section<Dialogue>()({
  kind: 'dialogue',
  ids: 'owned',
  maps: {
    dialogues: (value) => [[value.id, value]],
    dialoguesByOwner: (value) => (value.owner === undefined ? [] : [[value.owner, value]]),
  },
  grammar: [
    { form: 'owner = <entity>', example: 'owner = guide' },
    {
      form: 'node <name>:',
      example: 'node greet:',
      block: () => [
        { form: 'when: <condition>', example: 'when: has-key', family: 'reached when' },
        { form: 'once', example: 'once', family: 'reached when' },
        { form: 'sticky', example: 'sticky', family: 'reached when' },
        { form: 'again: <text>', example: 'again: We have spoken already.', family: 'what is said' },
        { form: '<what is said>', example: 'A traveller, out here?', family: 'what is said' },
        { form: 'goto <node>', example: 'goto farewell', family: 'where it goes' },
        { form: '-> <choice>[ (when <condition>)]', example: '-> Tell me more', family: 'where it goes', block: () => [{ form: 'goto <node>', example: 'goto farewell', family: 'where it goes' }, ...resultGrammar()] },
        ...resultGrammar(),
      ],
    },
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
