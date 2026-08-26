import { DEFAULT_LANGUAGE } from '../grammar/section';
import { standingSettings, type SettingSheet } from './settings';
import type { TagClause } from '../grammar/tagClause';
import { RuntimeError } from './error';
import type { EngineKey } from '../content/locale';
import type { Answer, Localized } from './localized';
import { DEFAULT_RNG_SEED, RngCursor } from './rng';
import type { Said } from './said';

export type PoolLevels = { readonly [resourceId: string]: number };

export const PLAYER = 'player';

export const FIGHT_SCOPED = '#';

export const templateOf = (actorId: string): string => actorId.split(FIGHT_SCOPED)[0];

export const isFightScoped = (actorId: string): boolean => actorId !== templateOf(actorId);

export const ownerRef = (obj: string, objId: string): string => `${obj}.${objId}`;

export function parseOwnerRef(ownerRef: string): { obj: string; objId: string } {
  const dot = ownerRef.indexOf('.');
  return { obj: ownerRef.slice(0, dot), objId: ownerRef.slice(dot + 1) };
}

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
  | { readonly name: 'name-yourself'; readonly answers: ModalAnswers }
  | { readonly name: 'choose-race'; readonly answers: ModalAnswers }
  | { readonly name: 'carried-items'; readonly answers: ModalAnswers }
  | { readonly name: 'item-plane'; readonly answers: ModalAnswers; readonly target: string; readonly hex: string; readonly said?: Said }
  | { readonly name: 'quest-journal'; readonly answers: ModalAnswers; readonly quest: string }
  | { readonly name: 'stat-breakdown'; readonly answers: ModalAnswers; readonly stat: string }
  | { readonly name: 'shop'; readonly answers: ModalAnswers; readonly shop: string }
  | { readonly name: 'shop-count'; readonly answers: ModalAnswers; readonly shop: string; readonly side: 'buy' | 'sell'; readonly item: string }
  | { readonly name: 'dialogue'; readonly answers: ModalAnswers; readonly cursor: DialogueCursor };

export interface GameState extends RngCursor {
  language: string;
  flags: Record<string, boolean | number>;
  inventory: Record<string, number>;
  packOrder: string[];
  location: string;
  visits: Record<string, number>;
  xp: Record<string, number>;
  log: Localized[];
  // Why what was last under way stopped, in the words the player reads, written by whoever ends it.
  endedBecause: Localized | null;
  // What the player was last told they are holding. Not saved and not compared: it is what makes a
  // change news exactly once, and coming back to a save is not news.
  carriedTold: string | null;
  time: number;
  // The earliest instant anything standing here may come at the player. Arriving somewhere and
  // felling something both push it forward, so a room is quiet for a beat before the next thing
  // finds you. Not saved: a world picked up again is one you have just walked back into.
  engagesAt: number;
  activeAction: ActiveAction | null;
  journey: Journey | null;
  readonly buffs: BuffTable;
  resources: PoolLevels;
  resourceRateRemainders: Record<string, number>;
  equipped: Record<string, string>;
  instances: InstanceTable;
  populations: Populations;
  shops: Record<string, ShopStock>;
  player: PlayerSheet;
  settings: SettingSheet;
  modals: readonly ModalFrame[];
}

// The player's own sheet: for each field, the kind whose id it holds — or null where the field is the
// player's own writing and is already the words — and the words the field is called by, which are the
// words the question that filled it was asked in. The sheet's fields are these keys, so a field added
// here cannot reach the state without answering both, and everything that reads one out to somebody —
// a sentence, a view, a save that drops what the world stopped declaring — derives the answer here
// rather than knowing about race.
export const PLAYER_SHEET = {
  name: { names: null, asked: 'engine.modal.name' },
  race: { names: 'race', asked: 'engine.modal.race' },
} as const satisfies Readonly<Record<string, { names: string | null; asked: EngineKey }>>;

export type PlayerField = keyof typeof PLAYER_SHEET;

export type PlayerSheet = Record<PlayerField, string>;

export const PLAYER_FIELDS = Object.keys(PLAYER_SHEET) as PlayerField[];

export function emptyPlayerSheet(): PlayerSheet {
  const sheet = {} as PlayerSheet;
  for (const field of PLAYER_FIELDS) sheet[field] = '';
  return sheet;
}

export function createGameState(location = '', language: string = DEFAULT_LANGUAGE): GameState {
  return { language, flags: {}, inventory: {}, packOrder: [], location, visits: {}, xp: {}, log: [], endedBecause: null, carriedTold: null, time: 0, engagesAt: 0, activeAction: null, journey: null, buffs: {}, resources: {}, resourceRateRemainders: {}, equipped: {}, instances: createInstanceTable(), populations: {}, shops: {}, rng: DEFAULT_RNG_SEED, player: emptyPlayerSheet(), settings: standingSettings(), modals: [] };
}

export function advanceTime(state: GameState, milliseconds: number): void {
  if (milliseconds < 0) throw new RuntimeError(`advanceTime: milliseconds must be non-negative, got ${milliseconds}`);
  if (!Number.isInteger(milliseconds)) throw new RuntimeError(`advanceTime: milliseconds must be an integer, got ${milliseconds}`);
  state.time += milliseconds;
}
