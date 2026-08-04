import { ActionResult, parseResultLine, startsResult } from '../grammar/actionResult';
import { Condition, condition, Reference } from '../grammar/condition';
import { Cursor, DslError, parseWhole } from '../grammar/parser';
import { RawLine, RawSection } from '../grammar/structure';
import { REFERENCE } from '../grammar/values';

export type TextSegment =
  | { kind: 'literal'; text: string }
  | { kind: 'interpolate'; reference: Reference }
  | { kind: 'conditional'; condition: Condition; text: string };

export interface Choice {
  segments: TextSegment[];
  when?: Condition;
  effects: ActionResult[];
  goto?: string;
}

export type NodeStep =
  | { kind: 'say'; segments: TextSegment[] }
  | { kind: 'effect'; result: ActionResult }
  | { kind: 'goto'; target: string }
  | { kind: 'menu'; choices: Choice[] };

export interface DialogueNode {
  name: string;
  when?: Condition;
  once?: boolean;
  sticky?: boolean;
  again?: TextSegment[];
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

function parseFragment(raw: string, base: number): TextSegment {
  const colon = raw.indexOf(':');
  if (colon === -1) {
    const match = REFERENCE.exec(raw);
    if (!match || match[0] !== raw) throw new DslError(`malformed interpolation: {${raw}}`, { start: base, end: base + raw.length });
    return { kind: 'interpolate', reference: { path: raw.split('.') } };
  }
  const parsedCondition = parseWhole(condition, raw.slice(0, colon), base, 'a conditional fragment');
  return { kind: 'conditional', condition: parsedCondition, text: raw.slice(colon + 1).replace(/^[ \t]/, '') };
}

function parseSegments(text: string, base: number): TextSegment[] {
  const segments: TextSegment[] = [];
  let literalStart = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '{') {
      i++;
      continue;
    }
    if (i > literalStart) segments.push({ kind: 'literal', text: text.slice(literalStart, i) });
    const close = text.indexOf('}', i + 1);
    if (close === -1) throw new DslError(`unterminated fragment: ${text.slice(i)}`, { start: base + i, end: base + text.length });
    segments.push(parseFragment(text.slice(i + 1, close), base + i + 1));
    i = close + 1;
    literalStart = i;
  }
  if (literalStart < text.length) segments.push({ kind: 'literal', text: text.slice(literalStart) });
  return segments;
}

function parseChoice(source: RawLine): Choice {
  const match = CHOICE.exec(source.text)?.groups;
  if (!match?.text) throw new DslError(`malformed choice: ${source.text}`, source.span);
  const choice: Choice = { segments: parseSegments(match.text, source.span.start), effects: [] };
  if (match.cond) choice.when = parseWhole(condition, match.cond, source.span.start, 'a choice when');
  for (const line of source.children) {
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

  for (const line of source.children) {
    if (line.text.startsWith('->')) {
      (menu ??= []).push(parseChoice(line));
      continue;
    }
    flush();

    const when = WHEN.exec(line.text)?.groups;
    const again = AGAIN.exec(line.text)?.groups;
    const goto = GOTO.exec(line.text)?.groups;
    if (when) node.when = parseWhole(condition, when.cond, line.span.start, 'a node when');
    else if (again) node.again = parseSegments(again.text, line.span.start);
    else if (line.text === 'once') node.once = true;
    else if (line.text === 'sticky') node.sticky = true;
    else if (goto) node.steps.push({ kind: 'goto', target: goto.target });
    else if (startsResult(new Cursor(line.text))) for (const result of parseResultLine(line)) node.steps.push({ kind: 'effect', result });
    else node.steps.push({ kind: 'say', segments: parseSegments(line.text, line.span.start) });
  }
  flush();
  return node;
}

export function parseDialogue(section: RawSection): Dialogue {
  if (!section.id) throw new DslError('# dialogue requires an id', section.span);
  const dialogue: Dialogue = { id: section.id, nodes: [] };

  for (const line of section.body) {
    const owner = OWNER.exec(line.text)?.groups;
    const node = NODE.exec(line.text)?.groups;
    if (owner) dialogue.owner = owner.id;
    else if (node) dialogue.nodes.push(parseNode(node.name, line));
    else throw new DslError(`unexpected line in # dialogue: ${JSON.stringify(line.text)}`, line.span);
  }
  return dialogue;
}
