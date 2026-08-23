import { DEFAULT_LANGUAGE } from '../grammar/section';
import type { TagClause } from '../grammar/tagClause';
import { RuntimeError } from './error';
import type { Answer, Localized } from './localized';
import { DEFAULT_RNG_SEED, RngCursor } from './rng';
import type { Said } from './said';

export type PoolLevels = { readonly [resourceId: string]: number };

export const PLAYER = 'player';

export const FIGHT_SCOPED = '#';

export const templateOf = (actorId: string): string => actorId.split(FIGHT_SCOPED)[0];

export const isFightScoped = (actorId: string): boolean => actorId !== templateOf(actorId);

export interface Seat {
  ownerRef: string;
  actionSlug: string;
  target: string;
}

export interface Cadence {
  progress: number;
  attemptsMade: number;
}

export interface ActorState {
  resources: Record<string, number>;
  rateRemainders: Record<string, number>;
}

export interface ActiveAction {
  ownerRef: string;
  actionSlug: string;
  repeating: boolean;
  implicitTarget: number;
  cadences: Record<string, Cadence>;
  actors?: Record<string, ActorState>;
  roster?: Record<string, Seat>;
}

export interface Journey {
  to: Answer;
  legs: Answer[];
}

export interface BuffInstance {
  readonly source: string;
  readonly tags: readonly TagClause[];
  readonly expiresAt: number;
}

export type BuffTable = { readonly [actorId: string]: readonly BuffInstance[] };

export interface Instance {
  readonly kind: string;
  readonly template: string;
  readonly payload: unknown;
}

export interface InstanceTable {
  readonly next: number;
  readonly byId: Readonly<Record<string, Instance>>;
}

export const createInstanceTable = (): InstanceTable => ({ next: 1, byId: {} });

export interface Deficit {
  down: number;
  due: number[];
}

export type Populations = Record<string, Record<string, Deficit>>;

// What a shop currently holds, and the moment those counts were last settled. Between trades nothing is written: the counts a shop holds now are `at` plus however much replenishing the clock has since paid for.
export interface ShopStock {
  readonly at: number;
  readonly counts: Readonly<Record<string, number>>;
}

export interface DialogueCursor {
  dialogue: string;
  node: string;
  resumeIndex: number;
  replay: boolean;
}

export type ModalAnswers = Readonly<Record<Answer, Answer>>;

export type ModalFrame =
  | { readonly name: 'character-creation'; readonly answers: ModalAnswers }
  | { readonly name: 'carried-items'; readonly answers: ModalAnswers }
  | { readonly name: 'item-plane'; readonly answers: ModalAnswers; readonly target: string; readonly hex: string; readonly said?: Said }
  | { readonly name: 'quest-journal'; readonly answers: ModalAnswers; readonly quest: string }
  | { readonly name: 'shop'; readonly answers: ModalAnswers; readonly shop: string }
  | { readonly name: 'shop-count'; readonly answers: ModalAnswers; readonly shop: string; readonly side: 'buy' | 'sell'; readonly item: string }
  | { readonly name: 'dialogue'; readonly answers: ModalAnswers; readonly cursor: DialogueCursor };

export interface GameState extends RngCursor {
  language: string;
  flags: Record<string, boolean | number>;
  inventory: Record<string, number>;
  location: string;
  visits: Record<string, number>;
  xp: Record<string, number>;
  log: Localized[];
  // Why what was last under way stopped, in the words the player reads, written by whoever ends it.
  endedBecause: Localized | null;
  time: number;
  activeAction: ActiveAction | null;
  journey: Journey | null;
  readonly buffs: BuffTable;
  resources: PoolLevels;
  resourceRateRemainders: Record<string, number>;
  equipped: Record<string, string>;
  instances: InstanceTable;
  populations: Populations;
  shops: Record<string, ShopStock>;
  player: { name: string; race: string };
  modals: readonly ModalFrame[];
}

export function createGameState(location = '', language: string = DEFAULT_LANGUAGE): GameState {
  return { language, flags: {}, inventory: {}, location, visits: {}, xp: {}, log: [], endedBecause: null, time: 0, activeAction: null, journey: null, buffs: {}, resources: {}, resourceRateRemainders: {}, equipped: {}, instances: createInstanceTable(), populations: {}, shops: {}, rng: DEFAULT_RNG_SEED, player: { name: '', race: '' }, modals: [] };
}

export function advanceTime(state: GameState, milliseconds: number): void {
  if (milliseconds < 0) throw new RuntimeError(`advanceTime: milliseconds must be non-negative, got ${milliseconds}`);
  if (!Number.isInteger(milliseconds)) throw new RuntimeError(`advanceTime: milliseconds must be an integer, got ${milliseconds}`);
  state.time += milliseconds;
}
