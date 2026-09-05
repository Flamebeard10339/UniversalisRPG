import { BACK, LEAVE, offersAnswer, type ModalOption } from './modalOption';
import { RuntimeError } from './error';
import { dialogueFrame, keepModals, type ModalName, openModal, popModal, topModal } from './modalStack';
import { choose, cursorProblem, menuChoices, standsAtWords } from './dialogue-runtime';
import { carriedOptions, carriedSubmit } from './carriedScreen';
import { isPlaneFrameBody, planeFocus, planeOptions, planeStale, planeSubmit } from './planeScreen';
import { fromListedScreens, type ListedScreen } from './listedScreens';
import { countOptions, countSubmit, holdsCount, holdsShop, shopOptions, shopStale, shopSubmit } from './shopScreen';
import { type PlaneFocus } from './planeReport';
import { bonusAmount, tagClause, type TagClause } from '../grammar/tagClause';

export type Focus =
  | PlaneFocus
  | { readonly kind: 'quest'; readonly quest: Answer }
  | { readonly kind: 'stat'; readonly stat: Answer }
  | { readonly kind: 'skill'; readonly skill: Answer };
import { Answer, Localized, Localizer, localizerOf } from './localized';
import { GameState, type ModalAnswers, type ModalFrame } from './state';
import { Registry } from '../content/registry';
import { listedToPlayer } from '../content/sections';

export interface Modal {
  name: Answer;
  options: readonly ModalOption[];
  leaving: Answer | null;
}

interface ModalBehaviour<F extends ModalFrame> {
  options(frame: F, state: GameState, registry: Registry): readonly ModalOption[];
  submit(frame: F, state: GameState, registry: Registry): ModalFrame | null;
  focus?(frame: F): Focus | undefined;
  leaves?: Answer;
  asksNothing?(frame: F): boolean;
}

interface KeyedById<F extends ModalFrame> {
  holds(value: Record<string, unknown>): boolean;
  stale(frame: F, state: GameState, registry: Registry): Localized | null;
}

interface Unkeyed<F extends ModalFrame> {
  holds?: undefined;
  stale?(frame: F, state: GameState, registry: Registry): Localized | null;
}

type ModalDefinition<F extends ModalFrame> = ModalBehaviour<F> & (KeyedById<F> | Unkeyed<F>);

function carriedWords(localizer: Localizer, tag: TagClause): Localized {
  if (tag.kind !== 'stat-bonus' || tag.per !== undefined) return localizer.identifier(tagClause.print(tag));
  return localizer.engine('engine.modal.race.bonus', { amount: localizer.identifier(bonusAmount.print(tag)), stat: localizer.title('stat', tag.statId) });
}

function raceChoices(registry: Registry, state: GameState): readonly { value: Answer; shown: Localized }[] {
  const localizer = localizerOf(registry, state);
  return listedToPlayer(registry.races.values()).map((race) => {
    const id = race.id;
    const title = localizer.title('race', id);
    if (race.tags.length === 0) return { value: id, shown: title };
    const [first, ...rest] = race.tags.map((tag) => carriedWords(localizer, tag));
    const carries = rest.reduce((all, more) => localizer.engine('engine.modal.race.and', { carries: all, more }), first);
    return { value: id, shown: localizer.engine('engine.modal.race.carries', { race: title, carries }) };
  });
}

type ListedDefinitions = { [S in ListedScreen as S['name']]: ModalDefinition<Extract<ModalFrame, { name: S['name'] }>> };

const LISTED_DEFINITIONS = fromListedScreens<ListedDefinitions>((screen) => ({
  options: screen.options,
  submit: screen.submit,
  holds: screen.holds,
  stale: screen.stale,
  focus: screen.focus,
  leaves: LEAVE,
}));

const DEFINITIONS: { [K in ModalName]: ModalDefinition<Extract<ModalFrame, { name: K }>> } = {
  'choose-name': {
    options: (_frame, state, registry) => [{ key: 'name', label: localizerOf(registry, state).engine('engine.modal.name'), values: null }],
    submit: (frame, state) => {
      state.player = { ...state.player, name: frame.answers.name };
      return null;
    },
  },
  'choose-race': {
    options: (_frame, state, registry) => [{ key: 'race', label: localizerOf(registry, state).engine('engine.modal.race'), values: raceChoices(registry, state) }],
    submit: (frame, state) => {
      state.player = { ...state.player, race: frame.answers.race };
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
  ...LISTED_DEFINITIONS,
  shop: {
    options: shopOptions,
    submit: shopSubmit,
    holds: holdsShop,
    stale: shopStale,
    leaves: LEAVE,
  },
  'shop-count': {
    options: countOptions,
    submit: countSubmit,
    holds: holdsCount,
    stale: shopStale,
    leaves: BACK,
  },
  'welcome-back': {
    options: (_frame, state, registry) => {
      const localizer = localizerOf(registry, state);
      return [{ key: CARRY_ON, label: localizer.engine('engine.modal.welcome-back'), values: [{ value: CARRY_ON, shown: localizer.engine('engine.away.carry-on') }] }];
    },
    submit: () => null,
  },
  dialogue: {
    options: (frame, state, registry) => [
      { key: 'choice', label: localizerOf(registry, state).engine('engine.modal.choice'), values: menuChoices(frame.cursor, registry, state).map((entry) => ({ value: String(entry.index), shown: entry.display })), takesMore: true },
    ],
    submit: (frame, state, registry) => {
      const cursor = choose(frame.answers.choice, frame.cursor, registry, state);
      return cursor ? dialogueFrame(cursor) : null;
    },
    holds: (value) => isCursor(value.cursor),
    stale: (frame, state, registry) => cursorProblem(localizerOf(registry, state), frame.cursor, registry),
    asksNothing: (frame) => standsAtWords(frame.cursor),
  },
};

export const CARRY_ON = 'carry-on';

export const WELCOME_BACK = 'welcome-back';

export const awaitsAnAnswer = (frame: ModalFrame): boolean => definitionFor(frame).asksNothing?.(frame) !== true;

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

export function modalFocus(state: GameState): Focus | null {
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
  if (option.values && !option.takesMore && !offersAnswer(option, value)) return localizer.engine('engine.modal.stale.no-value', { option: localizer.identifier(key), value: localizer.identifier(JSON.stringify(value)) });
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
