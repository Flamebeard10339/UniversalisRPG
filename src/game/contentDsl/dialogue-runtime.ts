import { evaluateCondition, renderSegments } from './conditions';
import { Choice, Dialogue, DialogueNode } from './dialogue';
import { applyResultsNow } from './effects';
import { Registry } from './registry';
import { GameState, RuntimeError } from './state';

// Walking a `# dialogue` node's beats, one menu at a time. A session is a
// resumable cursor rather than a loop, because a menu hands control back to the
// driver and the node has to pick up at the step after it.

export interface DialogueSession {
  dialogue: Dialogue;
  node: DialogueNode;
  resumeIndex: number;
  replay: boolean;
  choices: Choice[] | null;
}

function findNode(dialogue: Dialogue, name: string): DialogueNode {
  const node = dialogue.nodes.find((n) => n.name === name);
  if (!node) throw new RuntimeError(`goto target not found: ${name} in dialogue ${dialogue.id}`);
  return node;
}

// A `menu` step hands control back for a choice; the node then resumes at the
// step after it, so a choice with no goto falls through to the rest of the node.
//
// TODO(dialogue-pacing): consecutive `say` beats between menus are all pushed to
// the log in one turn, so a multi-line node dumps everything at once with no
// "continue" beat (the playtest praised the first, gated dialogue but found the
// rest a wall of text). Two options the playtest raised: (a) treat each say beat
// as an implicit single-choice "continue" menu so the player advances line by
// line; (b) model dialogue as a first-class modal (pendingModal) so a GUI need
// not reverse-engineer pacing. Deferred as an out-of-MVP dialogue-engine change.
function runSteps(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState, start: number, replay: boolean): DialogueSession {
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
        return { dialogue, node, resumeIndex: i + 1, replay, choices: step.choices };
    }
  }
  return { dialogue, node, resumeIndex: node.steps.length, replay, choices: null };
}

// On a revisit, only a `sticky` node replays its beats and effects; otherwise
// they fire once and later visits show `again` instead.
function enterNode(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState): DialogueSession {
  const visit = (state.visits[node.name] = (state.visits[node.name] ?? 0) + 1);
  const replay = visit === 1 || node.sticky === true;
  if (!replay && node.again) state.log.push(renderSegments(node.again, state));
  return runSteps(dialogue, node, registry, state, 0, replay);
}

export function talk(entityId: string, registry: Registry, state: GameState): DialogueSession {
  const dialogue = registry.dialoguesByOwner.get(entityId);
  if (!dialogue) throw new RuntimeError(`no dialogue owned by entity: ${entityId}`);

  let chosen: DialogueNode | undefined;
  for (const node of dialogue.nodes) {
    if (node.when && evaluateCondition(node.when, state)) chosen = node;
  }
  if (!chosen) throw new RuntimeError(`no reachable node in dialogue: ${dialogue.id}`);
  return enterNode(dialogue, chosen, registry, state);
}

export function choose(text: string, session: DialogueSession, registry: Registry, state: GameState): DialogueSession {
  if (!session.choices) throw new RuntimeError('no active menu to choose from');
  const match = session.choices.find((c) => (!c.when || evaluateCondition(c.when, state)) && renderSegments(c.segments, state) === text);
  if (!match) throw new RuntimeError(`no choice matches: ${JSON.stringify(text)}`);

  applyResultsNow(state, registry, match.effects);
  if (match.goto) return enterNode(session.dialogue, findNode(session.dialogue, match.goto), registry, state);
  return runSteps(session.dialogue, session.node, registry, state, session.resumeIndex, session.replay);
}
