import { RuntimeError } from './error';
import { evaluateCondition, renderSegments } from './conditions';
import { Choice, Dialogue, DialogueNode, Spoken, spokenBy } from '../content/sections/dialogue';
import { applyResultsNow } from './effects';
import { BASE_LANGUAGE, Localized, Localizer, localizerFor, localizerOf } from './localized';
import { Registry } from '../content/registry';
import { type DialogueCursor, GameState } from './state';

function spokenLine(registry: Registry, state: GameState, line: Spoken): Localized {
  if (line.key === undefined) throw new RuntimeError(`a dialogue line reached the log with no address: ${JSON.stringify(renderSegments(line.segments, state))}`);
  return localizerOf(registry, state).line(line.key, (segments) => renderSegments(segments, state));
}

function findNode(dialogue: Dialogue, name: string): DialogueNode {
  const node = dialogue.nodes.find((n) => n.name === name);
  if (!node) throw new RuntimeError(`goto target not found: ${name} in dialogue ${dialogue.id}`);
  return node;
}

export function cursorProblem(localizer: Localizer, cursor: DialogueCursor, registry: Registry): Localized | null {
  const named = { dialogue: localizer.identifier(cursor.dialogue), node: localizer.identifier(cursor.node) };
  const dialogue = registry.dialogues.get(cursor.dialogue);
  if (!dialogue) return localizer.engine('engine.dialogue.stale.unloaded', named);
  const node = dialogue.nodes.find((n) => n.name === cursor.node);
  if (!node) return localizer.engine('engine.dialogue.stale.no-node', named);
  if (node.steps[cursor.resumeIndex - 1]?.kind !== 'menu') return localizer.engine('engine.dialogue.stale.no-menu', named);
  return null;
}

function resolveMenu(cursor: DialogueCursor, registry: Registry): { dialogue: Dialogue; node: DialogueNode; choices: Choice[] } {
  const problem = cursorProblem(localizerFor(registry, BASE_LANGUAGE), cursor, registry);
  if (problem) throw new RuntimeError(`stale dialogue cursor: ${problem}`);
  const dialogue = registry.dialogues.get(cursor.dialogue)!;
  const node = findNode(dialogue, cursor.node);
  const step = node.steps[cursor.resumeIndex - 1];
  return { dialogue, node, choices: step.kind === 'menu' ? step.choices : [] };
}

function runSteps(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState, start: number, replay: boolean): DialogueCursor | null {
  for (let i = start; i < node.steps.length; i++) {
    const step = node.steps[i];
    switch (step.kind) {
      case 'say':
        if (replay) state.log.push(spokenLine(registry, state, step));
        break;
      case 'effect':
        if (replay) applyResultsNow(state, registry, [step.result]);
        break;
      case 'goto':
        return enterNode(dialogue, findNode(dialogue, step.target), registry, state);
      case 'menu':
        return { dialogue: dialogue.id, node: node.name, resumeIndex: i + 1, replay };
      default: {
        const unreached: never = step;
        void unreached;
      }
    }
  }
  return null;
}

function enterNode(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState): DialogueCursor | null {
  const counter = `${dialogue.id}.${node.name}`;
  const visit = (state.visits[counter] = (state.visits[counter] ?? 0) + 1);
  const replay = visit === 1 || node.sticky === true;
  if (!replay && node.again) state.log.push(spokenLine(registry, state, node.again));
  return runSteps(dialogue, node, registry, state, 0, replay);
}

// The one thing this entity has to say now, out of everything anyone has given it to say. Every node an author wrote a `when:` on is a claim on this moment, and the last such claim wins — within a dialogue by the order its nodes are written, and between dialogues by the order their modules loaded.
export function reachedNow(registry: Registry, state: GameState, entityId: string): { dialogue: Dialogue; node: DialogueNode } | null {
  let chosen: { dialogue: Dialogue; node: DialogueNode } | null = null;
  for (const dialogue of spokenBy(registry.dialogues, entityId)) {
    for (const node of dialogue.nodes) if (node.when && evaluateCondition(node.when, state)) chosen = { dialogue, node };
  }
  return chosen;
}

export function talk(entityId: string, registry: Registry, state: GameState): DialogueCursor | null {
  const reached = reachedNow(registry, state, entityId);
  if (!reached) {
    if (spokenBy(registry.dialogues, entityId).length === 0) throw new RuntimeError(`no dialogue owned by entity: ${entityId}`);
    throw new RuntimeError(`no reachable node in any dialogue owned by entity: ${entityId}`);
  }
  return enterNode(reached.dialogue, reached.node, registry, state);
}

function offered(cursor: DialogueCursor, registry: Registry, state: GameState): Array<{ choice: Choice; index: number }> {
  return resolveMenu(cursor, registry)
    .choices.map((choice, index) => ({ choice, index }))
    .filter((entry) => !entry.choice.when || evaluateCondition(entry.choice.when, state));
}

export function menuChoices(cursor: DialogueCursor, registry: Registry, state: GameState): Array<{ index: number; display: Localized }> {
  return offered(cursor, registry, state).map((entry) => ({ index: entry.index, display: spokenLine(registry, state, entry.choice) }));
}

export function choose(answer: string, cursor: DialogueCursor, registry: Registry, state: GameState): DialogueCursor | null {
  const { dialogue, node } = resolveMenu(cursor, registry);
  const match = offered(cursor, registry, state).find((entry) => String(entry.index) === answer)?.choice;
  if (!match) throw new RuntimeError(`no choice matches: ${JSON.stringify(answer)}`);

  applyResultsNow(state, registry, match.effects);
  if (match.goto) return enterNode(dialogue, findNode(dialogue, match.goto), registry, state);
  return runSteps(dialogue, node, registry, state, cursor.resumeIndex, cursor.replay);
}
