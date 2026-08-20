import type { ModalOption } from './modalOption';
import { RuntimeError } from './error';
import { dialogueFrame, keepModals, type ModalName, openModal, popModal, topModal } from './modalStack';
import { choose, cursorProblem, menuChoices } from './dialogue-runtime';
import { carriedOptions, carriedSubmit, LEAVE } from './carriedScreen';
import { BACK, isPlaneFrameBody, planeFocus, planeOptions, planeStale, planeSubmit } from './planeScreen';
import { type PlaneFocus } from './planeReport';
import { Answer, Localized, Localizer, localizerOf } from './localized';
import { GameState, type ModalAnswers, type ModalFrame } from './state';
import { Registry } from '../content/registry';
import type { EngineKey } from '../content/locale';

export interface Modal {
  name: Answer;
  options: readonly ModalOption[];
  leaving: Answer | null;
}

interface ModalDefinition<F extends ModalFrame> {
  options(frame: F, state: GameState, registry: Registry): readonly ModalOption[];
  submit(frame: F, state: GameState, registry: Registry): ModalFrame | null;
  holds?(value: Record<string, unknown>): boolean;
  stale?(frame: F, state: GameState, registry: Registry): Localized | null;
  focus?(frame: F): PlaneFocus;
  leaves?: Answer;
}

const RACES: ReadonlyArray<{ value: Answer; shown: EngineKey }> = [
  { value: 'human', shown: 'engine.race.human' },
  { value: 'elf', shown: 'engine.race.elf' },
  { value: 'dwarf', shown: 'engine.race.dwarf' },
  { value: 'orc', shown: 'engine.race.orc' },
];

const DEFINITIONS: { [K in ModalName]: ModalDefinition<Extract<ModalFrame, { name: K }>> } = {
  'character-creation': {
    options: (_frame, state, registry) => [
      { key: 'name', label: localizerOf(registry, state).engine('engine.modal.name'), values: null },
      { key: 'race', label: localizerOf(registry, state).engine('engine.modal.race'), values: RACES.map((race) => ({ value: race.value, shown: localizerOf(registry, state).engine(race.shown) })) },
    ],
    submit: (frame, state) => {
      state.player = { name: frame.answers.name, race: frame.answers.race };
      return null;
    },
  },
  'carried-items': {
    options: (frame, state, registry) => carriedOptions(frame.answers, state, registry),
    submit: (frame, state, registry) => carriedSubmit(frame.answers, state, registry),
    leaves: LEAVE,
  },
  'item-plane': {
    options: planeOptions,
    submit: planeSubmit,
    holds: isPlaneFrameBody,
    stale: planeStale,
    focus: planeFocus,
    leaves: BACK,
  },
  dialogue: {
    options: (frame, state, registry) => [
      { key: 'choice', label: localizerOf(registry, state).engine('engine.modal.choice'), values: menuChoices(frame.cursor, registry, state).map((choice) => ({ value: String(choice.index), shown: choice.display })) },
    ],
    submit: (frame, state, registry) => {
      const cursor = choose(frame.answers.choice, frame.cursor, registry, state);
      return cursor ? dialogueFrame(cursor) : null;
    },
    holds: (value) => isCursor(value.cursor),
    stale: (frame, state, registry) => cursorProblem(localizerOf(registry, state), frame.cursor, registry),
  },
};

export const MODAL_NAMES: readonly ModalName[] = Object.keys(DEFINITIONS) as ModalName[];

function answersOf(frame: ModalFrame): Record<string, string> {
  return frame.answers as Record<string, string>;
}

function definitionFor<F extends ModalFrame>(frame: F): ModalDefinition<F> {
  return DEFINITIONS[frame.name] as ModalDefinition<F>;
}

function declaredFor(name: string): ModalDefinition<ModalFrame> | undefined {
  return DEFINITIONS[name as ModalName] as ModalDefinition<ModalFrame> | undefined;
}

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

export function answerModal(state: GameState, registry: Registry, answers: ModalAnswers): void {
  const frame = topModal(state);
  if (!frame) throw new RuntimeError(`no modal is open to answer: ${Object.keys(answers).join(', ')}`);

  const options = allOptions(frame, state, registry);
  for (const [key, value] of Object.entries(answers)) {
    const refusal = optionRefusal(localizerOf(registry, state), options, key, value);
    if (refusal) throw new RuntimeError(`modal ${frame.name}: ${refusal}`);
  }
  const asFound = { ...answersOf(frame) };
  Object.assign(answersOf(frame), answers);

  if (allOptions(frame, state, registry).some((option) => !(option.key in frame.answers))) return;
  popModal(state);
  let next: ModalFrame | null;
  try {
    next = definitionFor(frame).submit(frame, state, registry);
  } catch (error) {
    restoreAnswers(frame, asFound);
    openModal(state, frame);
    throw error;
  }
  if (next) openModal(state, next);
}

function restoreAnswers(frame: ModalFrame, answers: ModalAnswers): void {
  const held = answersOf(frame);
  for (const key of Object.keys(held)) delete held[key];
  Object.assign(held, answers);
}

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

function optionRefusal(localizer: Localizer, options: readonly ModalOption[], key: string, value: string): Localized | null {
  const option = options.find((each) => each.key === key);
  if (!option) return localizer.engine('engine.modal.stale.no-option', { option: localizer.identifier(key) });
  if (option.values && !option.values.some((choice) => choice.value === value)) return localizer.engine('engine.modal.stale.no-value', { option: localizer.identifier(key), value: localizer.identifier(JSON.stringify(value)) });
  return null;
}

function frameProblem(frame: ModalFrame, state: GameState, registry: Registry): Localized | null {
  const localizer = localizerOf(registry, state);
  const definition = declaredFor(frame.name);
  if (!definition) return localizer.engine('engine.modal.stale.unknown');
  const stale = definition.stale?.(frame, state, registry);
  if (stale) return stale;
  const options = allOptions(frame, state, registry);
  for (const [key, value] of Object.entries(frame.answers)) {
    const refusal = optionRefusal(localizer, options, key, value);
    if (refusal) return refusal;
  }
  const unanswerable = options.find((option) => option.values?.length === 0);
  if (unanswerable) return localizer.engine('engine.modal.stale.unanswerable', { option: localizer.identifier(unanswerable.key) });
  if (options.every((option) => option.key in frame.answers)) return localizer.engine('engine.modal.stale.answered');
  return null;
}

export function pruneModals(state: GameState, registry: Registry): Array<{ name: string; reason: Localized }> {
  const dropped: Array<{ name: string; reason: Localized }> = [];
  const kept: ModalFrame[] = [];
  for (const frame of state.modals) {
    const problem = frameProblem(frame, state, registry);
    if (problem) dropped.push({ name: frame.name, reason: problem });
    else kept.push(frame);
  }
  if (dropped.length > 0) keepModals(state, kept);
  return dropped;
}
