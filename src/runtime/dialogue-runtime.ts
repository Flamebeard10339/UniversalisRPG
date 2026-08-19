import { RuntimeError } from './error';
import { evaluateCondition, renderSegments } from './conditions';
import { Choice, Dialogue, DialogueNode, Spoken } from '../content/dialogue';
import { applyResultsNow } from './effects';
import { BASE_LANGUAGE, Localized, Localizer, localizerFor, localizerOf } from './localized';
import { Registry } from '../content/registry';
import { GameState } from './state';

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

// A line the dialogue speaks, at the address the load path stamped on it. A
// line without one was built in code rather than loaded, and there is no
// language it could be shown in.
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

// A cursor this stale is a fault rather than a screen, so it is stated in the
// language the engine is written in and never reaches a player.
function resolveMenu(cursor: DialogueCursor, registry: Registry): { dialogue: Dialogue; node: DialogueNode; choices: Choice[] } {
  const problem = cursorProblem(localizerFor(registry, BASE_LANGUAGE), cursor, registry);
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
        if (replay) state.log.push(spokenLine(registry, state, step));
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
  if (!replay && node.again) state.log.push(spokenLine(registry, state, node.again));
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
// c2: the index is the option's place among the choices its node declares, not
// among the ones offered here, so a choice a `when:` withholds does not shift
// the answer to every choice after it.
function offered(cursor: DialogueCursor, registry: Registry, state: GameState): Array<{ choice: Choice; index: number }> {
  return resolveMenu(cursor, registry)
    .choices.map((choice, index) => ({ choice, index }))
    .filter((entry) => !entry.choice.when || evaluateCondition(entry.choice.when, state));
}

// The index is what a driver answers with and the display is what it draws:
// the two halves of a choice, and the reason a menu option is as translatable
// as the lines around it (c6).
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
