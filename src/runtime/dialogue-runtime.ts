import { evaluateCondition, renderSegments } from './conditions';
import { Choice, Dialogue, DialogueNode } from '../content/dialogue';
import { applyResultsNow } from './effects';
import { Registry } from '../content/registry';
import { GameState, RuntimeError } from './state';

// A resumable cursor, not a loop: a menu hands control back to the driver.
// Named, not held: every field is an id or a number, so the cursor survives a
// save and a driver never holds a registry object it would have to re-resolve.

export interface DialogueCursor {
  dialogue: string;
  node: string;
  // The step after the menu, so the menu itself is at resumeIndex - 1.
  resumeIndex: number;
  replay: boolean;
}

function findNode(dialogue: Dialogue, name: string): DialogueNode {
  const node = dialogue.nodes.find((n) => n.name === name);
  if (!node) throw new RuntimeError(`goto target not found: ${name} in dialogue ${dialogue.id}`);
  return node;
}

export function cursorProblem(cursor: DialogueCursor, registry: Registry): string | null {
  const dialogue = registry.dialogues.get(cursor.dialogue);
  if (!dialogue) return `dialogue ${cursor.dialogue} is not loaded`;
  const node = dialogue.nodes.find((n) => n.name === cursor.node);
  if (!node) return `dialogue ${cursor.dialogue} has no node ${cursor.node}`;
  if (node.steps[cursor.resumeIndex - 1]?.kind !== 'menu') return `dialogue ${cursor.dialogue} node ${cursor.node} no longer offers a menu there`;
  return null;
}

function resolveMenu(cursor: DialogueCursor, registry: Registry): { dialogue: Dialogue; node: DialogueNode; choices: Choice[] } {
  const problem = cursorProblem(cursor, registry);
  if (problem) throw new RuntimeError(`stale dialogue cursor: ${problem}`);
  const dialogue = registry.dialogues.get(cursor.dialogue)!;
  const node = findNode(dialogue, cursor.node);
  const step = node.steps[cursor.resumeIndex - 1];
  return { dialogue, node, choices: step.kind === 'menu' ? step.choices : [] };
}

// A choice with no goto falls through to the rest of the node.
function runSteps(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState, start: number, replay: boolean): DialogueCursor | null {
  for (let i = start; i < node.steps.length; i++) {
    const step = node.steps[i];
    switch (step.kind) {
      case 'say':
        if (replay) state.log.push(renderSegments(step.segments, state));
        break;
      case 'effect':
        if (replay) applyResultsNow(state, registry, [step.result]);
        break;
      case 'goto':
        return enterNode(dialogue, findNode(dialogue, step.target), registry, state);
      case 'menu':
        return { dialogue: dialogue.id, node: node.name, resumeIndex: i + 1, replay };
    }
  }
  return null;
}

function enterNode(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState): DialogueCursor | null {
  // Keyed by the node's path, not its bare name: two dialogues may each have a
  // node called greeting, and they are not the same counter.
  const counter = `${dialogue.id}.${node.name}`;
  const visit = (state.visits[counter] = (state.visits[counter] ?? 0) + 1);
  const replay = visit === 1 || node.sticky === true;
  if (!replay && node.again) state.log.push(renderSegments(node.again, state));
  return runSteps(dialogue, node, registry, state, 0, replay);
}

export function talk(entityId: string, registry: Registry, state: GameState): DialogueCursor | null {
  const dialogue = registry.dialoguesByOwner.get(entityId);
  if (!dialogue) throw new RuntimeError(`no dialogue owned by entity: ${entityId}`);

  let chosen: DialogueNode | undefined;
  for (const node of dialogue.nodes) {
    if (node.when && evaluateCondition(node.when, state)) chosen = node;
  }
  if (!chosen) throw new RuntimeError(`no reachable node in dialogue: ${dialogue.id}`);
  return enterNode(dialogue, chosen, registry, state);
}

// One gate, one rendering: the offer and the answer are read off the same list,
// so a choice withheld by its `when:` cannot be reachable by typing its text.
function offered(cursor: DialogueCursor, registry: Registry, state: GameState): Array<{ choice: Choice; text: string }> {
  return resolveMenu(cursor, registry)
    .choices.filter((choice) => !choice.when || evaluateCondition(choice.when, state))
    .map((choice) => ({ choice, text: renderSegments(choice.segments, state) }));
}

export function menuTexts(cursor: DialogueCursor, registry: Registry, state: GameState): string[] {
  return offered(cursor, registry, state).map((entry) => entry.text);
}

export function choose(text: string, cursor: DialogueCursor, registry: Registry, state: GameState): DialogueCursor | null {
  const { dialogue, node } = resolveMenu(cursor, registry);
  const match = offered(cursor, registry, state).find((entry) => entry.text === text)?.choice;
  if (!match) throw new RuntimeError(`no choice matches: ${JSON.stringify(text)}`);

  applyResultsNow(state, registry, match.effects);
  if (match.goto) return enterNode(dialogue, findNode(dialogue, match.goto), registry, state);
  return runSteps(dialogue, node, registry, state, cursor.resumeIndex, cursor.replay);
}
