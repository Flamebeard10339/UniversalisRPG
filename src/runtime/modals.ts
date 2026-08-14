import { choose, cursorProblem, DialogueCursor, menuTexts } from './dialogue-runtime';
import { carriedFrame, carriedOptions, carriedSubmit, LEAVE } from './carriedScreen';
import { BACK, isPlaneFrameBody, planeFocus, planeOptions, planeStale, planeSubmit, samePlane } from './planeScreen';
import { type PlaneFocus } from './planeReport';
import { Localized, Localizer, localizerOf } from './localized';
import { GameState, RuntimeError } from './state';
import { Registry } from '../content/registry';

// A modal is a named screen that presents options, sits atop whatever is
// beneath it, and is cleared once every option has an answer. Nothing here
// says how one is drawn: a rendering layer is handed a name and a list of
// options and decides the rest for itself.

// One answer, and the words a player reads to pick it. Kept as a pair rather
// than as two lists, because the whole reason c3 kept reopening is that a value
// is both — read on the screen and replayed by a `submit-modal:` — and no
// branding of one field can hold while the other carries the same text.
export interface ModalChoice {
  readonly value: string;
  readonly shown: Localized;
}

export interface ModalOption {
  key: string;
  label: Localized;
  // What this option will accept, or null where it takes free text.
  values: readonly ModalChoice[] | null;
}

// An answer whose spelling is its own: a directive a `# test` replays, a hex, a
// verb. The played language does not change it, so it is shown as it is
// answered — which is what `identifier` means everywhere else.
export const spelled = (localizer: Localizer, values: readonly string[]): ModalChoice[] => values.map((value) => ({ value, shown: localizer.identifier(value) }));

// The whole of what leaves src/runtime: a name, the options still to be
// answered, and the value that answering any of them with takes the screen
// down. A driver can render a modal it has never heard of from this alone, and
// can offer the way out of one without knowing which screen it is looking at.
export interface Modal {
  name: string;
  options: readonly ModalOption[];
  // c15's leaving value, as a word rather than as a rule: null for a screen
  // that publishes none, which is a screen no gesture can take down either.
  leaving: string | null;
}

export type ModalAnswers = Readonly<Record<string, string>>;

export type ModalFrame =
  | { readonly name: 'character-creation'; readonly answers: ModalAnswers }
  | { readonly name: 'carried-items'; readonly answers: ModalAnswers }
  | { readonly name: 'item-plane'; readonly answers: ModalAnswers; readonly target: string; readonly hex: string; readonly said?: string }
  | { readonly name: 'dialogue'; readonly answers: ModalAnswers; readonly cursor: DialogueCursor };

export type ModalName = ModalFrame['name'];

// Everything a member of the union knows about itself. The optional ones are
// what a frame carrying more than answers costs: what its body must hold to be
// one, why the world it points at can no longer hold it up, when two of them are
// the same screen, and what it has in hand beside its options. A member that
// declares none is a screen its name alone identifies, whose body is its
// answers, which nothing can stale and which is drawn from its options alone.
interface ModalDefinition<F extends ModalFrame> {
  // The frame a bare `open modal: <name>` makes, or null for a modal that
  // carries a payload no result line can spell.
  open(): F | null;
  options(frame: F, state: GameState, registry: Registry): readonly ModalOption[];
  // What replaces this frame once every option is answered, or null to close.
  submit(frame: F, state: GameState, registry: Registry): ModalFrame | null;
  holds?(value: Record<string, unknown>): boolean;
  stale?(frame: F, state: GameState, registry: Registry): string | null;
  same?(a: F, b: F): boolean;
  // Which published plane this screen has in hand, for a member whose subject is
  // one. A member that declares none is a screen with nothing beside its options,
  // which is what keeps a driver from having to know which member is which.
  focus?(frame: F): PlaneFocus;
  // The value this screen leaves by (c15), listed on every option it publishes.
  // A member that declares none is a screen answering cannot leave, which is
  // what a driver reads to know there is nothing for a way out to say.
  leaves?: string;
}

const RACES = ['Human', 'Elf', 'Dwarf', 'Orc'];

export function dialogueFrame(cursor: DialogueCursor): ModalFrame {
  return { name: 'dialogue', answers: {}, cursor };
}

const DEFINITIONS: { [K in ModalName]: ModalDefinition<Extract<ModalFrame, { name: K }>> } = {
  'character-creation': {
    open: () => ({ name: 'character-creation', answers: {} }),
    options: (_frame, state, registry) => [
      { key: 'name', label: localizerOf(registry, state).engine('engine.modal.name'), values: null },
      { key: 'race', label: localizerOf(registry, state).engine('engine.modal.race'), values: spelled(localizerOf(registry, state), RACES) },
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
    leaves: LEAVE,
  },
  'item-plane': {
    open: () => null,
    options: planeOptions,
    submit: planeSubmit,
    holds: isPlaneFrameBody,
    stale: planeStale,
    same: samePlane,
    focus: planeFocus,
    leaves: BACK,
  },
  dialogue: {
    open: () => null,
    // A menu answer is the dialogue line the player picks, so the answer is the
    // authored text and what is read is that text through the prose door.
    options: (frame, state, registry) => [
      { key: 'choice', label: localizerOf(registry, state).engine('engine.modal.choice'), values: menuTexts(frame.cursor, registry, state).map((text) => ({ value: text, shown: localizerOf(registry, state).prose(text) })) },
    ],
    submit: (frame, state, registry) => {
      const cursor = choose(frame.answers.choice, frame.cursor, registry, state);
      return cursor ? dialogueFrame(cursor) : null;
    },
    holds: (value) => isCursor(value.cursor),
    stale: (frame, _state, registry) => cursorProblem(frame.cursor, registry) ?? null,
    same: (a, b) => a.cursor.dialogue === b.cursor.dialogue && a.cursor.node === b.cursor.node && a.cursor.resumeIndex === b.cursor.resumeIndex,
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

// Nothing here refuses a name the engine does not define: a save may carry one,
// and closing it is pruneModals's job rather than every reader's.
function declaredFor(name: string): ModalDefinition<ModalFrame> | undefined {
  return DEFINITIONS[name as ModalName] as ModalDefinition<ModalFrame> | undefined;
}

// Two frames are the same screen when they differ only in how much of them has
// been answered. Reopening what is already up is a no-op, which is what makes
// the count of `open modal:` applications — batched, scaled or reached once per
// repetition from inside a wrapper — not the count of screens raised.
function sameScreen(a: ModalFrame, b: ModalFrame): boolean {
  if (a.name !== b.name) return false;
  return declaredFor(a.name)?.same?.(a, b) ?? true;
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

// What the screen being answered has in hand, and null where it has nothing or
// where nothing is open. Only the top frame is asked: a screen covered by
// another is not what the player is looking at.
export function modalFocus(state: GameState): PlaneFocus | null {
  const frame = topModal(state);
  if (!frame) return null;
  return definitionFor(frame).focus?.(frame) ?? null;
}

function allOptions(frame: ModalFrame, state: GameState, registry: Registry): readonly ModalOption[] {
  return definitionFor(frame).options(frame, state, registry);
}

export function publishModal(frame: ModalFrame, state: GameState, registry: Registry): Modal {
  return {
    name: frame.name,
    options: allOptions(frame, state, registry).filter((option) => !(option.key in frame.answers)),
    leaving: definitionFor(frame).leaves ?? null,
  };
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
  const asFound = { ...answersOf(frame) };
  Object.assign(answersOf(frame), answers);

  // What is left to ask is read off the frame as it now stands rather than off
  // the list the answer was weighed against, because an answer can retract a
  // question the one before it raised — choosing another item drops the
  // confirmation the first one's destruction asked for. Reading the stale list
  // leaves a frame every option of which is answered, which publishes nothing,
  // which no answer can take down and pruneModals deletes without a word.
  if (allOptions(frame, state, registry).some((option) => !(option.key in frame.answers))) return;
  // Popped before the modal acts, so anything its answer opens stacks on what
  // is left rather than on a frame that is already spent.
  stack(state).pop();
  let next: ModalFrame | null;
  try {
    next = definitionFor(frame).submit(frame, state, registry);
  } catch (error) {
    // c7: a refusal reaches the player where they are. The pop has already
    // happened and a throw unwinds past everything that would raise a screen,
    // so without this the error is stated under a world with nothing on it and
    // the screen it is about is gone. The frame goes back as the player found
    // it, which is where the refusals above already leave one.
    restoreAnswers(frame, asFound);
    openModal(state, frame);
    throw error;
  }
  if (next) openModal(state, next);
}

// Replacing a frame's answers rather than adding to them, so a frame put back
// carries nothing the answer that failed had written on it.
function restoreAnswers(frame: ModalFrame, answers: ModalAnswers): void {
  const held = answersOf(frame);
  for (const key of Object.keys(held)) delete held[key];
  Object.assign(held, answers);
}

// What a `# save` body has to hold to be a frame at all. Shape only: a name
// nothing defines and a cursor pointing at content that has gone are both
// well-formed here and are closed by pruneModals against a registry.
export function isModalFrame(value: unknown): boolean {
  if (!isRecord(value) || typeof value.name !== 'string') return false;
  if (!isRecord(value.answers) || !Object.values(value.answers).every((answer) => typeof answer === 'string')) return false;
  return declaredFor(value.name)?.holds?.(value) ?? true;
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
  if (option.values && !option.values.some((choice) => choice.value === value)) return `has no ${key} that takes ${JSON.stringify(value)}`;
  return null;
}

function frameProblem(frame: ModalFrame, state: GameState, registry: Registry): string | null {
  const definition = declaredFor(frame.name);
  if (!definition) return 'it is not a modal this engine knows';
  const stale = definition.stale?.(frame, state, registry);
  if (stale) return stale;
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
