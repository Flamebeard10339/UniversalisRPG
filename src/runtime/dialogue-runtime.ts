import { RuntimeError } from './error';
import { evaluateCondition, renderSegments } from './conditions';
import { Choice, Dialogue, DialogueNode, isThread, NodeStep, offering, Spoken, spokenBy } from '../content/sections/dialogue';
import { applyResultsNow } from './effects';
import { BASE_LANGUAGE, Localized, Localizer, localizerFor, localizerOf } from './localized';
import { Registry } from '../content/registry';
import { type DialogueCursor, GameState } from './state';

function spokenLine(registry: Registry, state: GameState, line: Spoken): Localized {
  if (line.key === undefined) throw new RuntimeError(`a dialogue line reached the log with no address: ${JSON.stringify(renderSegments(line.segments, state, registry))}`);
  return localizerOf(registry, state).line(line.key, (segments) => renderSegments(segments, state, registry));
}

function findNode(dialogue: Dialogue, name: string): DialogueNode {
  const node = dialogue.nodes.find((n) => n.name === name);
  if (!node) throw new RuntimeError(`goto target not found: ${name} in dialogue ${dialogue.id}`);
  return node;
}

// Talking to somebody with more than one thread open is itself a menu, and nothing in the registry holds that one: which of their threads are open is a fact about the state now. The cursor standing on it names the entity and stands at no step, which no menu cursor does — a menu resumes after the step it was put at, so its index is always at least one.
const AT_THE_THREADS = 0;

const threadsCursor = (entityId: string): DialogueCursor => ({ dialogue: entityId, node: '', resumeIndex: AT_THE_THREADS, replay: false });

const askedOf = (cursor: DialogueCursor): string | null => (cursor.resumeIndex === AT_THE_THREADS ? cursor.dialogue : null);

export function cursorProblem(localizer: Localizer, cursor: DialogueCursor, registry: Registry): Localized | null {
  // A list of threads goes stale by emptying, which the screen already reads off having nothing left to answer with.
  if (askedOf(cursor) !== null) return null;
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

// What a step still does on a visit the node is not replaying: what is said and what it does are held back, a menu is still put to the player and a goto still followed. A step kind added to the grammar does not compile until it says which it is, and both the loop below and `speaksNow` read the answer here.
const WHEN_SPENT: Record<NodeStep['kind'], boolean> = { say: false, effect: false, goto: true, menu: true };

const visitCounter = (dialogue: Dialogue, node: DialogueNode): string => `${dialogue.id}.${node.name}`;

function runSteps(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState, start: number, replay: boolean): DialogueCursor | null {
  for (let i = start; i < node.steps.length; i++) {
    const step = node.steps[i];
    const kept = replay || WHEN_SPENT[step.kind];
    switch (step.kind) {
      case 'say':
        if (kept) state.log.push(spokenLine(registry, state, step));
        break;
      case 'effect':
        if (kept) applyResultsNow(state, registry, [step.result]);
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
  const counter = visitCounter(dialogue, node);
  const visit = (state.visits[counter] = (state.visits[counter] ?? 0) + 1);
  const replay = visit === 1 || node.sticky === true;
  if (!replay && node.again) state.log.push(spokenLine(registry, state, node.again));
  return runSteps(dialogue, node, registry, state, 0, replay);
}

// Whether entering this node now would put anything in front of the player. A node already visited that neither replays nor writes an `again:` holds back everything it says, and offering the conversation anyway is how a player comes to click talk and watch the view redraw with nothing new in it.
const speaksNow = (dialogue: Dialogue, node: DialogueNode, state: GameState): boolean =>
  (state.visits[visitCounter(dialogue, node)] ?? 0) === 0 || node.sticky === true || node.again !== undefined || node.steps.some((step) => WHEN_SPENT[step.kind]);

// One thing this entity can be talked to about now.
export interface Opener {
  dialogue: Dialogue;
  node: DialogueNode;
}

// What names a thread in the list: the phrase its author gave it, or failing that the first line it says, which is the only other thing about it a player would recognise.
export function openerShown(registry: Registry, state: GameState, node: DialogueNode): Localized {
  const localizer = localizerOf(registry, state);
  if (node.ask?.key !== undefined) return localizer.spoken(node.ask.key);
  const first = node.steps.find((step): step is Extract<NodeStep, { kind: 'say' }> => step.kind === 'say');
  return first ? spokenLine(registry, state, first) : localizer.identifier(node.name);
}

// Everything this entity has open to be talked about now, out of everything anyone has given it to say. Every thread reachable at this moment is offered at once and the player picks; what an entity says when no thread of theirs is open is offered only then. The order is the order of the words a player reads, so no module takes a place in the list by having loaded earlier.
export function openersNow(registry: Registry, state: GameState, entityId: string): Opener[] {
  const threads: Array<Opener & { shown: Localized }> = [];
  const otherwise: Array<Opener & { shown: Localized }> = [];
  for (const dialogue of spokenBy(registry.dialogues, entityId)) {
    for (const node of dialogue.nodes) {
      if (!offering(node) || !speaksNow(dialogue, node, state)) continue;
      if (node.when !== undefined && !evaluateCondition(node.when, state, registry)) continue;
      (isThread(node) ? threads : otherwise).push({ dialogue, node, shown: openerShown(registry, state, node) });
    }
  }
  const open = threads.length > 0 ? threads : otherwise;
  return open.sort((left, right) => (left.shown < right.shown ? -1 : left.shown > right.shown ? 1 : 0)).map(({ dialogue, node }) => ({ dialogue, node }));
}

// Whether talking to this entity would reach anything, and what it opens on where that is one thing.
export const reachedNow = (registry: Registry, state: GameState, entityId: string): Opener | null => openersNow(registry, state, entityId)[0] ?? null;

export function talk(entityId: string, registry: Registry, state: GameState): DialogueCursor | null {
  const open = openersNow(registry, state, entityId);
  if (open.length === 0) {
    if (spokenBy(registry.dialogues, entityId).length === 0) throw new RuntimeError(`no dialogue owned by entity: ${entityId}`);
    throw new RuntimeError(`no node with anything to say in any dialogue owned by entity: ${entityId}`);
  }
  // One thread open is the whole of talking to them, so it is entered rather than put to them as a list of one.
  if (open.length === 1) return enterNode(open[0].dialogue, open[0].node, registry, state);
  return threadsCursor(entityId);
}

function offered(cursor: DialogueCursor, registry: Registry, state: GameState): Array<{ choice: Choice; index: number }> {
  return resolveMenu(cursor, registry)
    .choices.map((choice, index) => ({ choice, index }))
    .filter((entry) => !entry.choice.when || evaluateCondition(entry.choice.when, state, registry));
}

export function menuChoices(cursor: DialogueCursor, registry: Registry, state: GameState): Array<{ index: number; display: Localized }> {
  const asked = askedOf(cursor);
  if (asked !== null) return openersNow(registry, state, asked).map((opener, index) => ({ index, display: openerShown(registry, state, opener.node) }));
  return offered(cursor, registry, state).map((entry) => ({ index: entry.index, display: spokenLine(registry, state, entry.choice) }));
}

export function choose(answer: string, cursor: DialogueCursor, registry: Registry, state: GameState): DialogueCursor | null {
  const asked = askedOf(cursor);
  if (asked !== null) {
    const opener = openersNow(registry, state, asked).find((_, index) => String(index) === answer);
    if (!opener) throw new RuntimeError(`no choice matches: ${JSON.stringify(answer)}`);
    return enterNode(opener.dialogue, opener.node, registry, state);
  }
  const { dialogue, node } = resolveMenu(cursor, registry);
  const match = offered(cursor, registry, state).find((entry) => String(entry.index) === answer)?.choice;
  if (!match) throw new RuntimeError(`no choice matches: ${JSON.stringify(answer)}`);

  applyResultsNow(state, registry, match.effects);
  if (match.goto) return enterNode(dialogue, findNode(dialogue, match.goto), registry, state);
  return runSteps(dialogue, node, registry, state, cursor.resumeIndex, cursor.replay);
}
