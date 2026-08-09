import { choose, cursorProblem, DialogueCursor, menuTexts } from './dialogue-runtime';
import { GameState, RuntimeError } from './state';
import { Registry } from '../content/registry';

// A modal is a named screen that presents options, sits atop whatever is
// beneath it, and is cleared once every option has an answer. Nothing here
// says how one is drawn: a rendering layer is handed a name and a list of
// options and decides the rest for itself.

export interface ModalOption {
  key: string;
  label: string;
  // What this option will accept, or null where it takes free text.
  values: readonly string[] | null;
}

// The whole of what leaves src/runtime: a name, and the options still to be
// answered. A driver can render a modal it has never heard of from this alone.
export interface Modal {
  name: string;
  options: readonly ModalOption[];
}

export type ModalAnswers = Readonly<Record<string, string>>;

export type ModalFrame =
  | { readonly name: 'character-creation'; readonly answers: ModalAnswers }
  | { readonly name: 'dialogue'; readonly answers: ModalAnswers; readonly cursor: DialogueCursor };

export type ModalName = ModalFrame['name'];

interface ModalDefinition<F extends ModalFrame> {
  // The frame a bare `open modal: <name>` makes, or null for a modal that
  // carries a payload no result line can spell.
  open(): F | null;
  options(frame: F, state: GameState, registry: Registry): readonly ModalOption[];
  // What replaces this frame once every option is answered, or null to close.
  submit(frame: F, state: GameState, registry: Registry): ModalFrame | null;
}

const RACES = ['Human', 'Elf', 'Dwarf', 'Orc'];

export function dialogueFrame(cursor: DialogueCursor): ModalFrame {
  return { name: 'dialogue', answers: {}, cursor };
}

const DEFINITIONS: { [K in ModalName]: ModalDefinition<Extract<ModalFrame, { name: K }>> } = {
  'character-creation': {
    open: () => ({ name: 'character-creation', answers: {} }),
    options: () => [
      { key: 'name', label: 'Name', values: null },
      { key: 'race', label: 'Race', values: RACES },
    ],
    submit: (frame, state) => {
      state.player = { name: frame.answers.name, race: frame.answers.race };
      return null;
    },
  },
  dialogue: {
    open: () => null,
    options: (frame, state, registry) => [{ key: 'choice', label: 'Choice', values: menuTexts(frame.cursor, registry, state) }],
    submit: (frame, state, registry) => {
      const cursor = choose(frame.answers.choice, frame.cursor, registry, state);
      return cursor ? dialogueFrame(cursor) : null;
    },
  },
};

// The one cast that opens the modal stack for writing, and the one that opens a
// frame's answers: everything outside this module holds both as readonly, which
// is what leaves open and close with a single implementation each.
function stack(state: GameState): ModalFrame[] {
  return state.modals as ModalFrame[];
}

function answersOf(frame: ModalFrame): Record<string, string> {
  return frame.answers as Record<string, string>;
}

function definitionFor<F extends ModalFrame>(frame: F): ModalDefinition<F> {
  return DEFINITIONS[frame.name] as ModalDefinition<F>;
}

export function openModal(state: GameState, frame: ModalFrame): void {
  // A screen cannot sit atop itself, so a result applied once per repetition of
  // a batch opens one modal rather than one per repetition.
  if (state.modals.some((open) => open.name === frame.name)) return;
  stack(state).push(frame);
}

export function openModalNamed(state: GameState, name: string): void {
  const definition = DEFINITIONS[name as ModalName] as ModalDefinition<ModalFrame> | undefined;
  if (!definition) throw new RuntimeError(`unknown modal: ${name}`);
  const frame = definition.open();
  if (!frame) throw new RuntimeError(`modal ${name} is not opened by name`);
  openModal(state, frame);
}

export function topModal(state: GameState): ModalFrame | null {
  return state.modals.length > 0 ? state.modals[state.modals.length - 1] : null;
}

function allOptions(frame: ModalFrame, state: GameState, registry: Registry): readonly ModalOption[] {
  return definitionFor(frame).options(frame, state, registry);
}

export function publishModal(frame: ModalFrame, state: GameState, registry: Registry): Modal {
  return { name: frame.name, options: allOptions(frame, state, registry).filter((option) => !(option.key in frame.answers)) };
}

// Answers land on the top modal; it closes on the answer that completes it, so
// a half-answered modal is still open and a driver can ask one field at a time.
export function answerModal(state: GameState, registry: Registry, answers: ModalAnswers): void {
  const frame = topModal(state);
  if (!frame) throw new RuntimeError(`no modal is open to answer: ${Object.keys(answers).join(', ')}`);

  const options = allOptions(frame, state, registry);
  for (const [key, value] of Object.entries(answers)) {
    const option = options.find((each) => each.key === key);
    if (!option) throw new RuntimeError(`modal ${frame.name} has no option ${key}`);
    if (option.values && !option.values.includes(value)) throw new RuntimeError(`modal ${frame.name} option ${key} does not take ${JSON.stringify(value)}`);
    answersOf(frame)[key] = value;
  }

  if (options.some((option) => !(option.key in frame.answers))) return;
  // Popped before the modal acts, so anything its answer opens stacks on what
  // is left rather than on a frame that is already spent.
  stack(state).pop();
  const next = definitionFor(frame).submit(frame, state, registry);
  if (next) openModal(state, next);
}

function frameProblem(frame: ModalFrame, registry: Registry): string | null {
  if (!(frame.name in DEFINITIONS)) return 'it is not a modal this engine knows';
  return frame.name === 'dialogue' ? cursorProblem(frame.cursor, registry) : null;
}

export function pruneModals(state: GameState, registry: Registry): Array<{ name: string; reason: string }> {
  const dropped: Array<{ name: string; reason: string }> = [];
  const kept: ModalFrame[] = [];
  for (const frame of state.modals) {
    const problem = frameProblem(frame, registry);
    if (problem) dropped.push({ name: frame.name, reason: problem });
    else kept.push(frame);
  }
  if (dropped.length > 0) stack(state).splice(0, state.modals.length, ...kept);
  return dropped;
}
