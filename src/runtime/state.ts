import { DEFAULT_LANGUAGE } from '../grammar/section';
import type { TagClause } from '../grammar/tagClause';
import { RuntimeError } from './error';
import type { Answer, Localized } from './localized';
import { DEFAULT_RNG_SEED, RngCursor } from './rng';
import type { Said } from './said';

// The shape of a saved game, entire, and the writes to it that are structural
// rather than policy. Each field below is owned by a module above this one --
// buffs.ts decides stacking and expiry, instances.ts decides minting and
// pruning -- and each of those modules used to declare the shape of its own
// field as well as the rules for it. That put the declaration above the state
// that holds it and the state below the module that declares it, which is the
// seven-import cycle this file sat at the centre of. A shape two modules both
// need belongs beneath both, which is the ruling already recorded on this file
// for FIGHT_SCOPED.

// Readonly because effects.ts owns every write, and with it rollover and on-empty.
export type PoolLevels = { readonly [resourceId: string]: number };

export const PLAYER = 'player';

// A fight-scoped copy's key is its type and which copy it is. No syntax anywhere
// names one — an author writes counts — so this separator never reaches a page.
// Here beside `PLAYER` because how an actor id is spelled is one question, and
// everything that asks it sits above this file.
export const FIGHT_SCOPED = '#';

export const templateOf = (actorId: string): string => actorId.split(FIGHT_SCOPED)[0];

// A copy minted for the fight stands in no location at all, so no question
// about a place can be asked of it — it is present while the fight is.
export const isFightScoped = (actorId: string): boolean => actorId !== templateOf(actorId);

// Where one participant's swing comes from and who it lands on. Every
// participant has one, the player included, so nothing reads a side off an
// identity.
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
  ownerRef: string; // "<obj>.<objId>", e.g. "entity.oven" or "action.melee-combat"
  // What addresses the action under that owner, never the label it is shown as.
  actionSlug: string;
  repeating: boolean;
  implicitTarget: number;
  // Insertion order breaks ties between clocks due at the same instant.
  cadences: Record<string, Cadence>;
  // Scoped to the fight and vanish with it, where the player's pools persist.
  actors?: Record<string, ActorState>;
  roster?: Record<string, Seat>;
}

// A walk under way, held on the state because it outlives the leg it is on and
// has to survive a save. The place the player is standing in is never in
// `legs`: a leg is crossed by arriving, and arriving takes it off the front.
export interface Journey {
  to: Answer;
  legs: Answer[];
}

export interface BuffInstance {
  readonly source: string;
  readonly tags: readonly TagClause[];
  readonly expiresAt: number;
}

// Who holds what. Readonly because buffs.ts owns granting, stacking, expiry and
// how a buff's identity is spelled -- no reader takes a source id apart,
// because none of them assembled it.
export type BuffTable = { readonly [actorId: string]: readonly BuffInstance[] };

// Readonly because instances.ts owns minting, pruning and the payload's
// opacity: a template a consumer could repoint is a template reference that
// stops meaning what that module says it means.
export interface Instance {
  readonly kind: string;
  readonly template: string;
  readonly payload: unknown;
}

// The counter lives inside the table rather than beside it, so `GameState`
// gains one field. It never rewinds, so an id names one instance for that
// instance's whole life and a reference cannot be answered by a later one.
export interface InstanceTable {
  readonly next: number;
  readonly byId: Readonly<Record<string, Instance>>;
}

export const createInstanceTable = (): InstanceTable => ({ next: 1, byId: {} });

// How many of a type are down at a place, and when each of those is due back.
// A copy with no `respawn after:` is down and never due, which is why the two
// numbers are kept apart rather than encoded into one list of instants.
export interface Deficit {
  down: number;
  due: number[];
}

// State about the LOCATION, because how many of its five rats are standing is
// the place's fact. It is not an entry in the instance table: no copy is
// addressable, so there is nothing to keep a record of.
export type Populations = Record<string, Record<string, Deficit>>;

// Where a dialogue has got to. dialogue-runtime.ts owns every step of it.
export interface DialogueCursor {
  dialogue: string;
  node: string;
  // The step after the menu, so the menu itself is at resumeIndex - 1.
  resumeIndex: number;
  replay: boolean;
}

export type ModalAnswers = Readonly<Record<Answer, Answer>>;

export type ModalFrame =
  | { readonly name: 'character-creation'; readonly answers: ModalAnswers }
  | { readonly name: 'carried-items'; readonly answers: ModalAnswers }
  | { readonly name: 'item-plane'; readonly answers: ModalAnswers; readonly target: string; readonly hex: string; readonly said?: Said }
  | { readonly name: 'dialogue'; readonly answers: ModalAnswers; readonly cursor: DialogueCursor };

export interface GameState extends RngCursor {
  // The language being played. An input rather than a save field, like `log`
  // beneath it: it belongs to the player's settings, and every site that writes
  // a player-visible line has the state in hand and nothing else does.
  language: string;
  flags: Record<string, boolean | number>;
  inventory: Record<string, number>;
  location: string;
  visits: Record<string, number>;
  xp: Record<string, number>;
  log: Localized[];
  time: number;
  activeAction: ActiveAction | null;
  // The walk under way, and null when the player is not on one. journey.ts owns
  // the route; runtime.ts owns arming each leg off it.
  journey: Journey | null;
  // Readonly because buffs.ts owns every write, and with it stacking and expiry.
  readonly buffs: BuffTable;
  resources: PoolLevels;
  resourceRateRemainders: Record<string, number>;
  equipped: Record<string, string>;
  // instances.ts owns every write, and with it minting, pruning and liveness.
  instances: InstanceTable;
  // How many of each location's population are down and when each is due back.
  // population.ts owns every write.
  populations: Populations;
  player: { name: string; race: string };
  // Readonly because modals.ts owns every write, and with it open and close.
  modals: readonly ModalFrame[];
}

export function createGameState(location = '', language: string = DEFAULT_LANGUAGE): GameState {
  return { language, flags: {}, inventory: {}, location, visits: {}, xp: {}, log: [], time: 0, activeAction: null, journey: null, buffs: {}, resources: {}, resourceRateRemainders: {}, equipped: {}, instances: createInstanceTable(), populations: {}, rng: DEFAULT_RNG_SEED, player: { name: '', race: '' }, modals: [] };
}

// The one seam through which simulated time advances; nothing reads a real clock.
export function advanceTime(state: GameState, milliseconds: number): void {
  if (milliseconds < 0) throw new RuntimeError(`advanceTime: milliseconds must be non-negative, got ${milliseconds}`);
  if (!Number.isInteger(milliseconds)) throw new RuntimeError(`advanceTime: milliseconds must be an integer, got ${milliseconds}`);
  state.time += milliseconds;
}
