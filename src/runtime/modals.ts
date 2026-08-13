import { choose, cursorProblem, DialogueCursor, menuTexts } from './dialogue-runtime';
import { carriedFrame, carriedOptions, carriedSubmit } from './carriedScreen';
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
  | { readonly name: 'carried-items'; readonly answers: ModalAnswers }
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
  'carried-items': {
    open: () => carriedFrame(),
    options: (frame, state, registry) => carriedOptions(frame.answers, state, registry),
    submit: (frame, state, registry) => carriedSubmit(frame.answers, state, registry),
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

// The keys of DEFINITIONS as a value, so a rule about the whole set of modals
// is read off the definitions rather than off a copy of their names.
export const MODAL_NAMES: readonly ModalName[] = Object.keys(DEFINITIONS) as ModalName[];

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

// Two frames are the same screen when they differ only in how much of them has
// been answered. Reopening what is already up is a no-op, which is what makes
// the count of `open modal:` applications — batched, scaled or reached once per
// repetition from inside a wrapper — not the count of screens raised.
function sameScreen(a: ModalFrame, b: ModalFrame): boolean {
  if (a.name !== b.name) return false;
  if (a.name === 'dialogue' && b.name === 'dialogue') {
    return a.cursor.dialogue === b.cursor.dialogue && a.cursor.node === b.cursor.node && a.cursor.resumeIndex === b.cursor.resumeIndex;
  }
  return true;
}

export function openModal(state: GameState, frame: ModalFrame): void {
  if (state.modals.some((open) => sameScreen(open, frame))) return;
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

  // Every pair is checked before any of them lands, so a form rejected on its
  // last field leaves the modal exactly as the player found it.
  const options = allOptions(frame, state, registry);
  for (const [key, value] of Object.entries(answers)) {
    const refusal = optionRefusal(options, key, value);
    if (refusal) throw new RuntimeError(`modal ${frame.name} ${refusal}`);
  }
  Object.assign(answersOf(frame), answers);

  if (options.some((option) => !(option.key in frame.answers))) return;
  // Popped before the modal acts, so anything its answer opens stacks on what
  // is left rather than on a frame that is already spent.
  stack(state).pop();
  const next = definitionFor(frame).submit(frame, state, registry);
  if (next) openModal(state, next);
}

// What a `# save` body has to hold to be a frame at all. Shape only: a name
// nothing defines and a cursor pointing at content that has gone are both
// well-formed here and are closed by pruneModals against a registry.
export function isModalFrame(value: unknown): boolean {
  if (!isRecord(value) || typeof value.name !== 'string') return false;
  if (!isRecord(value.answers) || !Object.values(value.answers).every((answer) => typeof answer === 'string')) return false;
  return value.name !== 'dialogue' || isCursor(value.cursor);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCursor(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.dialogue === 'string' && typeof value.node === 'string' && Number.isInteger(value.resumeIndex) && typeof value.replay === 'boolean';
}

// The one place an answer is weighed against the option it names, so what
// `answerModal` refuses live and what a `# save` may not carry cannot drift.
function optionRefusal(options: readonly ModalOption[], key: string, value: string): string | null {
  const option = options.find((each) => each.key === key);
  if (!option) return `has no option ${key}`;
  if (option.values && !option.values.includes(value)) return `has no ${key} that takes ${JSON.stringify(value)}`;
  return null;
}

function frameProblem(frame: ModalFrame, state: GameState, registry: Registry): string | null {
  if (!(frame.name in DEFINITIONS)) return 'it is not a modal this engine knows';
  if (frame.name === 'dialogue') {
    const stale = cursorProblem(frame.cursor, registry);
    if (stale) return stale;
  }
  const options = allOptions(frame, state, registry);
  for (const [key, value] of Object.entries(frame.answers)) {
    const refusal = optionRefusal(options, key, value);
    if (refusal) return `it ${refusal}`;
  }
  // Answering the last option is what closes a modal, so a frame that reaches
  // here already complete was never one this engine put down: it publishes no
  // option, withdraws the world, and nothing can clear it. An option that
  // accepts nothing is the same frame reached from the other side — no answer
  // satisfies it, so answering can never be what takes the frame down.
  const unanswerable = options.find((option) => option.values?.length === 0);
  if (unanswerable) return `it asks for ${unanswerable.key} and nothing answers it`;
  if (options.every((option) => option.key in frame.answers)) return 'it was saved with every option already answered';
  return null;
}

export function pruneModals(state: GameState, registry: Registry): Array<{ name: string; reason: string }> {
  const dropped: Array<{ name: string; reason: string }> = [];
  const kept: ModalFrame[] = [];
  for (const frame of state.modals) {
    const problem = frameProblem(frame, state, registry);
    if (problem) dropped.push({ name: frame.name, reason: problem });
    else kept.push(frame);
  }
  if (dropped.length > 0) stack(state).splice(0, state.modals.length, ...kept);
  return dropped;
}
