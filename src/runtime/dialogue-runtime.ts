import { RuntimeError } from './error';
import { costLimit } from './actions';
import { ActionResult, itemCost } from '../grammar/actionResult';
import { evaluateCondition, renderSegments, weighing } from './conditions';
import { Choice, Dialogue, DialogueNode, givenByQuest, isThread, nodeEffects, NodeStep, offering, Spoken, spokenBy } from '../content/sections/dialogue';
import { applyResultsNow } from './effects';
import { BASE_LANGUAGE, Localized, Localizer, localizerFor, localizerOf } from './localized';
import { namesSection } from '../content/namespace';
import { Registry } from '../content/registry';
import { withoutNote } from '../grammar/note';
import { printSegments } from '../grammar/segment';
import { type DialogueCursor, GameState } from './state';

function spokenLine(registry: Registry, state: GameState, line: Spoken): Localized {
  if (line.key === undefined) throw new RuntimeError(`a dialogue line reached the log with no address: ${JSON.stringify(renderSegments(line.segments, state, registry))}`);
  return localizerOf(registry, state).line(line.key, weighing(state, registry));
}

function speak(registry: Registry, state: GameState, line: Spoken): void {
  const words = spokenLine(registry, state, line);
  if (words.trim() !== '') state.log.push(words);
}

function findNode(dialogue: Dialogue, name: string): DialogueNode {
  const node = dialogue.nodes.find((n) => n.name === name);
  if (!node) throw new RuntimeError(`goto target not found: ${name} in dialogue ${dialogue.id}`);
  return node;
}

const AT_THE_THREADS = 0;

const AT_WHAT_WAS_SAID = -1;

const threadsCursor = (entityId: string): DialogueCursor => ({ dialogue: entityId, node: '', resumeIndex: AT_THE_THREADS, replay: false });

const readCursor = (): DialogueCursor => ({ dialogue: '', node: '', resumeIndex: AT_WHAT_WAS_SAID, replay: false });

const askedOf = (cursor: DialogueCursor): string | null => (cursor.resumeIndex === AT_THE_THREADS ? cursor.dialogue : null);

export const standsAtWords = (cursor: DialogueCursor): boolean => cursor.resumeIndex === AT_WHAT_WAS_SAID;

function standingAfter(state: GameState, step: () => DialogueCursor | null): DialogueCursor | null {
  const before = state.log.length;
  const cursor = step();
  return cursor !== null || state.log.length === before ? cursor : readCursor();
}

export function cursorProblem(localizer: Localizer, cursor: DialogueCursor, registry: Registry): Localized | null {
  if (standsAtWords(cursor) || askedOf(cursor) !== null) return null;
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

const WHEN_SPENT: Record<NodeStep['kind'], boolean> = { say: false, effect: false, goto: true, menu: true };

const visitCounter = (dialogue: Dialogue, node: DialogueNode): string => `${dialogue.id}.${node.name}`;

function runSteps(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState, start: number, replay: boolean): DialogueCursor | null {
  for (let i = start; i < node.steps.length; i++) {
    const step = node.steps[i];
    const kept = replay || WHEN_SPENT[step.kind];
    switch (step.kind) {
      case 'say':
        if (kept) speak(registry, state, step);
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

const replaying = (node: DialogueNode, visit: number): boolean => visit === 1 || node.sticky === true;

const nextVisit = (dialogue: Dialogue, node: DialogueNode, state: GameState): number => (state.visits[visitCounter(dialogue, node)] ?? 0) + 1;

function enterNode(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState): DialogueCursor | null {
  const counter = visitCounter(dialogue, node);
  const visit = (state.visits[counter] = (state.visits[counter] ?? 0) + 1);
  const replay = replaying(node, visit);
  if (!replay && node.again) speak(registry, state, node.again);
  return runSteps(dialogue, node, registry, state, 0, replay);
}

const affordable = (results: readonly ActionResult[], state: GameState): boolean => costLimit(itemCost(results), state).completions > 0;

const nodeAffordable = (dialogue: Dialogue, node: DialogueNode, state: GameState): boolean =>
  !replaying(node, nextVisit(dialogue, node, state)) || affordable(nodeEffects(node), state);

const speaksNow = (dialogue: Dialogue, node: DialogueNode, state: GameState): boolean =>
  (state.visits[visitCounter(dialogue, node)] ?? 0) === 0 || node.sticky === true || node.again !== undefined || node.steps.some((step) => WHEN_SPENT[step.kind]);

export interface Opener {
  dialogue: Dialogue;
  node: DialogueNode;
}

export function openerShown(registry: Registry, state: GameState, node: DialogueNode): Localized {
  const localizer = localizerOf(registry, state);
  if (node.ask?.key !== undefined) return localizer.line(node.ask.key, weighing(state, registry));
  const first = node.steps.find((step): step is Extract<NodeStep, { kind: 'say' }> => step.kind === 'say');
  return first ? spokenLine(registry, state, first) : localizer.identifier(node.name);
}

const QUEST = 0;
const THREAD = 1;
const OTHERWISE = 2;

const standing = (dialogue: Dialogue, node: DialogueNode): number => (givenByQuest(dialogue) ? QUEST : isThread(node) ? THREAD : OTHERWISE);

export function openersNow(registry: Registry, state: GameState, entityId: string): Opener[] {
  const open: Array<Opener & { shown: Localized; standing: number }> = [];
  for (const dialogue of spokenBy(registry.dialogues, entityId)) {
    for (const node of dialogue.nodes) {
      if (!offering(node) || !speaksNow(dialogue, node, state)) continue;
      if (node.when !== undefined && !evaluateCondition(node.when, state, registry)) continue;
      if (!nodeAffordable(dialogue, node, state)) continue;
      open.push({ dialogue, node, shown: openerShown(registry, state, node), standing: standing(dialogue, node) });
    }
  }
  const asked = open.filter((each) => each.standing < OTHERWISE);
  return (asked.length > 0 ? asked : open).sort((left, right) => left.standing - right.standing || (left.shown < right.shown ? -1 : left.shown > right.shown ? 1 : 0)).map(({ dialogue, node }) => ({ dialogue, node }));
}

export const reachedNow = (registry: Registry, state: GameState, entityId: string): Opener | null => openersNow(registry, state, entityId)[0] ?? null;

export function talk(entityId: string, registry: Registry, state: GameState): DialogueCursor | null {
  const open = openersNow(registry, state, entityId);
  if (open.length === 0) {
    if (spokenBy(registry.dialogues, entityId).length === 0) throw new RuntimeError(`no dialogue owned by entity: ${entityId}`);
    throw new RuntimeError(`no node with anything to say in any dialogue owned by entity: ${entityId}`);
  }
  if (open.length === 1) return standingAfter(state, () => enterNode(open[0].dialogue, open[0].node, registry, state));
  return threadsCursor(entityId);
}

function offered(cursor: DialogueCursor, registry: Registry, state: GameState): Array<{ choice: Choice; index: number }> {
  return resolveMenu(cursor, registry)
    .choices.map((choice, index) => ({ choice, index }))
    .filter((entry) => !entry.choice.when || evaluateCondition(entry.choice.when, state, registry))
    .filter((entry) => affordable(entry.choice.effects, state));
}

export interface MenuEntry {
  readonly index: number;
  readonly display: Localized;
  readonly name: string;
  readonly named: boolean;
}

const picks = (answer: string, entry: MenuEntry): boolean => answer === String(entry.index) || (entry.named ? namesSection(entry.name, answer) : answer === entry.name);

const authoredWords = (line: Spoken): string => withoutNote(printSegments(line.segments)).trim();

const READ = 'continue';

export function menuChoices(cursor: DialogueCursor, registry: Registry, state: GameState): MenuEntry[] {
  if (standsAtWords(cursor)) return [{ index: 0, display: localizerOf(registry, state).engine('engine.modal.read'), name: READ, named: false }];
  const asked = askedOf(cursor);
  if (asked !== null) return openersNow(registry, state, asked).map((opener, index) => ({ index, display: openerShown(registry, state, opener.node), name: visitCounter(opener.dialogue, opener.node), named: true }));
  return offered(cursor, registry, state).map((entry) => ({ index: entry.index, display: spokenLine(registry, state, entry.choice), name: authoredWords(entry.choice), named: false }));
}

const shownAs = (entry: MenuEntry): string => `${entry.index} ${JSON.stringify(entry.display)}${entry.name === entry.display ? '' : ` (${entry.name})`}`;

function noneMatches(answer: string, entries: readonly MenuEntry[]): RuntimeError {
  const offering = entries.map(shownAs);
  return new RuntimeError(`no choice matches ${JSON.stringify(answer)}: this list offers ${offering.length === 0 ? 'nothing' : offering.join(', ')}`);
}

function fitsMore(answer: string, matched: readonly MenuEntry[]): RuntimeError {
  return new RuntimeError(`${JSON.stringify(answer)} names more than one of this list: ${matched.map(shownAs).join(', ')}. Write more of the one you mean`);
}

export function choose(answer: string, cursor: DialogueCursor, registry: Registry, state: GameState): DialogueCursor | null {
  const entries = menuChoices(cursor, registry, state);
  const matched = entries.filter((entry) => picks(answer, entry));
  if (matched.length > 1) throw fitsMore(answer, matched);
  if (matched.length === 0) throw noneMatches(answer, entries);
  const at = entries.indexOf(matched[0]!);

  if (standsAtWords(cursor)) return null;

  const asked = askedOf(cursor);
  if (asked !== null) {
    const opener = openersNow(registry, state, asked)[at];
    return standingAfter(state, () => enterNode(opener.dialogue, opener.node, registry, state));
  }
  const { dialogue, node } = resolveMenu(cursor, registry);
  const match = offered(cursor, registry, state)[at].choice;

  return standingAfter(state, () => {
    applyResultsNow(state, registry, match.effects);
    if (match.goto) return enterNode(dialogue, findNode(dialogue, match.goto), registry, state);
    return runSteps(dialogue, node, registry, state, cursor.resumeIndex, cursor.replay);
  });
}
