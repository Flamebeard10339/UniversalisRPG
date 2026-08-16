import { RuntimeError } from './runtime';
import { slotStore, type Slot, type SlotDriver, type SlotStore } from './store';

// The slot a session writes when nobody is authoring, and the pair that exist
// only while somebody is. `dev-snapshot` holds what `player` said at the moment
// dev mode was entered, so leaving restores it and a process that dies in
// between never wrote over it in the first place.
export const PLAYER_SLOT = 'player';
export const DEV_SLOT = 'dev';
export const DEV_SNAPSHOT_SLOT = 'dev-snapshot';

// The cadence is a slot like any other, which is what makes the store's claim
// to be nothing but named text something the store is used for rather than
// something its comments say.
export const AUTOSAVE_SLOT = 'autosave';

// Zero means never, and it is the default because a driver that wrote a file
// nobody asked it to would be a driver whose runs are not repeatable. The
// cadence outlives the session that set it, so turning it on is done once.
export const DEFAULT_AUTOSAVE_SECONDS = 0;

// The save half of a driver's context: where slots are kept, the clock the
// cadence is measured on, and which slot is live. One clock, read by the store
// at a write and by the cadence at a check, so the two cannot disagree.
export interface SaveContext {
  readonly store: SlotStore;
  readonly now: () => number;
  dev: boolean;
}

export function createSaveContext(driver: SlotDriver, now: () => number): SaveContext {
  return { store: slotStore(driver, now), now, dev: false };
}

// What a session knows about its own standing in each slot: the ones it *is*
// what they hold, and the ones it is known *not* to be. Autosave writes no
// other, which is the whole of what stops a session that never read a slot from
// replacing what is in it — a game reopened, or one that has just left dev mode.
// `/save` is how a session takes a slot it did not come from, and it is
// deliberately the explicit spelling.
//
// Two sets rather than one, because an absent slot answers differently to each:
// a game nobody has loaded may take an empty slot, and a session that has just
// been told it is nobody's may not — which is the only reason `withheld` exists
// and is the case a single set got wrong.
//
// Beside the context rather than on it, the way a session's internals sit
// beside a `PlaySession`: what a driver holds is published, and this is a fact
// about a running process that no surface renders. A context nobody built here
// — a restart, reading the same directory back — starts knowing nothing, which
// is exactly what a restart knows.
interface Standing {
  is: Set<string>;
  isNot: Set<string>;
}

const STANDING = new WeakMap<SaveContext, Standing>();

function standingOf(save: SaveContext): Standing {
  const held = STANDING.get(save) ?? { is: new Set<string>(), isNot: new Set<string>() };
  STANDING.set(save, held);
  return held;
}

// What is in a slot, in three answers rather than two. Collapsing the last two
// is what a reader written for one question and reused for another does: dating
// a slot nobody can read and dating an empty one both give nothing, and writing
// over an empty one is free where writing over bytes nobody can read destroys
// whatever they were. Named here so the next reader picks a question rather
// than a helper.
type SlotState = { kind: 'empty' } | { kind: 'held'; slot: Slot } | { kind: 'unreadable' };

function stateOf(store: SlotStore, name: string): SlotState {
  try {
    const slot = store.read(name);
    return slot === null ? { kind: 'empty' } : { kind: 'held', slot };
  } catch (error) {
    if (error instanceof RuntimeError) return { kind: 'unreadable' };
    throw error;
  }
}

// The date question: when was this written, and nothing when it cannot be told.
function datable(store: SlotStore, name: string): Slot | null {
  const state = stateOf(store, name);
  return state.kind === 'held' ? state.slot : null;
}

// Whether this session is entitled to write the slot without being asked twice:
// it is what that slot holds, or the slot is empty and nothing has said this
// session is not its. Bytes nobody can read are neither — they are somebody's
// save that a half-finished write or a hand edit left behind, and replacing
// them is a thing to be asked for rather than assumed.
export function adopts(save: SaveContext, slot: string): boolean {
  const standing = standingOf(save);
  if (standing.is.has(slot)) return true;
  return !standing.isNot.has(slot) && stateOf(save.store, slot).kind === 'empty';
}

export function liveSlot(save: SaveContext): string {
  return save.dev ? DEV_SLOT : PLAYER_SLOT;
}

// The cadence, or nothing when the slot it lives in cannot be made sense of.
// A setting is not a save: what a report owes a reader is the rest of the
// answer, not a refusal, so the two callers ask different questions of it the
// way `datable` and `adopts` do of a slot.
export function cadenceOrNone(save: SaveContext): number | null {
  const state = stateOf(save.store, AUTOSAVE_SLOT);
  if (state.kind === 'empty') return DEFAULT_AUTOSAVE_SECONDS;
  if (state.kind === 'unreadable') return null;
  const seconds = Number(state.slot.payload);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

// The cadence for whoever has to act on it, which cannot act on nothing.
export function autosaveSeconds(save: SaveContext): number {
  const seconds = cadenceOrNone(save);
  if (seconds === null) throw new RuntimeError(`slot ${AUTOSAVE_SLOT} does not hold a cadence in seconds`);
  return seconds;
}

export function setAutosaveSeconds(save: SaveContext, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RuntimeError(`an autosave cadence is seconds, zero for never, not ${JSON.stringify(seconds)}`);
  save.store.write(AUTOSAVE_SLOT, String(seconds));
}

// When the live slot was last written, and nothing when it cannot be told —
// a slot the store cannot read is a slot the next autosave replaces, so being
// unable to date it is a reason to write rather than a reason to refuse.
function liveWrittenAt(save: SaveContext): number | null {
  return datable(save.store, liveSlot(save))?.writtenAt ?? null;
}

export function autosaveDue(save: SaveContext): boolean {
  const seconds = autosaveSeconds(save);
  if (seconds === 0) return false;
  const writtenAt = liveWrittenAt(save);
  return writtenAt === null || save.now() - writtenAt >= seconds * 1000;
}

// What an autosave check did. The last two are the ones with something to say,
// and they are two rather than one because the reasons are different and so is
// what the player would do about them: a slot this session did not come out of
// is picked up or replaced on purpose, and a slot nobody can read is a file to
// go and look at.
export type Autosaved = { kind: 'waited' } | { kind: 'wrote'; slot: string } | { kind: 'held'; slot: string } | { kind: 'unreadable'; slot: string };

// `payload` is taken as a thunk because serializing a session costs more than
// reading a stamp, and this is asked after every command and on every live tick.
export function autosave(save: SaveContext, payload: () => string): Autosaved {
  if (!autosaveDue(save)) return { kind: 'waited' };
  const slot = liveSlot(save);
  const writes = writesLive(save);
  if (writes !== 'yes') return { kind: writes === 'unreadable' ? 'unreadable' : 'held', slot };
  save.store.write(slot, payload());
  adopted(save, slot);
  return { kind: 'wrote', slot };
}

// Said out loud, so it replaces whatever the slot holds and the session owns it
// from here: this is the way a session takes a slot it did not come from.
export function saveNow(save: SaveContext, payload: string): string {
  const slot = liveSlot(save);
  save.store.write(slot, payload);
  adopted(save, slot);
  return slot;
}

// A session is what a slot holds once it has been loaded out of it, and not
// before. Told to the context rather than inferred by it, because only the
// caller that ran the load knows whether it stood.
export function adopted(save: SaveContext, slot: string): void {
  const standing = standingOf(save);
  standing.is.add(slot);
  standing.isNot.delete(slot);
}

// The other direction, and the reason it is not merely "forget the adoption":
// a session told it is not a slot's stays that way when the slot is empty too.
export function withhold(save: SaveContext, slot: string): void {
  const standing = standingOf(save);
  standing.is.delete(slot);
  standing.isNot.add(slot);
}

// What the player's slot held when dev mode was entered, as JSON so that "there
// was no slot" is a value rather than an absence that a missing snapshot and a
// snapshot of nothing would both spell.
function encodeSnapshot(payload: string | null): string {
  return JSON.stringify(payload);
}

function decodeSnapshot(text: string): string | null {
  const parsed: unknown = JSON.parse(text);
  if (parsed !== null && typeof parsed !== 'string') throw new RuntimeError(`slot ${DEV_SNAPSHOT_SLOT} does not hold a snapshot`);
  return parsed;
}

// What the dev slot holds, which is what a session entering dev has to be put
// into — null when there is none, and so nothing to pick up. Symmetrical with
// leaving: `/dev on` goes to the dev slot and `/dev off` comes back from it, so
// the session is always what the live slot holds and autosave never has to
// choose between refusing an author and writing over their last session.
// Loading it is the caller's, because loading a payload is not a store's job.
export function enterDev(save: SaveContext): string | null {
  if (save.dev) throw new RuntimeError('already in dev mode');
  const player = save.store.read(PLAYER_SLOT);
  // Persisted before the mode is on, so nothing done in dev can precede it.
  save.store.write(DEV_SNAPSHOT_SLOT, encodeSnapshot(player?.payload ?? null));
  save.dev = true;
  // Nothing is said about standing here: an empty dev slot is a scratch slot
  // this session takes, the way a game nobody has loaded takes an empty player
  // slot, and anything already in it is refused by that same rule until the
  // caller says it picked it up. Leaving is where a session stops being the dev
  // slot's, so entering has nothing left to withhold.
  const authoring = stateOf(save.store, DEV_SLOT);
  return authoring.kind === 'held' ? authoring.slot.payload : null;
}

// How leaving dev will go: back to what the player's slot held, back to having
// no slot at all, or — when the snapshot itself is gone or unreadable — out of
// the mode without touching the player's slot. That third answer is why this is
// a value rather than a raise: not being able to restore a slot is a reason to
// leave it alone, never a reason to keep somebody in a mode with no way out.
export type DevExit = { kind: 'restore'; payload: string } | { kind: 'was-empty' } | { kind: 'no-snapshot'; why: string };

export function devSnapshot(save: SaveContext): DevExit {
  if (!save.dev) throw new RuntimeError('not in dev mode');
  const state = stateOf(save.store, DEV_SNAPSHOT_SLOT);
  if (state.kind === 'empty') return { kind: 'no-snapshot', why: `slot ${DEV_SNAPSHOT_SLOT} is gone` };
  if (state.kind === 'unreadable') return { kind: 'no-snapshot', why: `slot ${DEV_SNAPSHOT_SLOT} cannot be read` };
  let held: string | null;
  try {
    held = decodeSnapshot(state.slot.payload);
  } catch {
    return { kind: 'no-snapshot', why: `slot ${DEV_SNAPSHOT_SLOT} does not hold a snapshot` };
  }
  return held === null ? { kind: 'was-empty' } : { kind: 'restore', payload: held };
}

// The commit, taking back what `devSnapshot` handed out: the player's slot goes
// back to what it held and the snapshot goes with the mode. No step here can
// lose anything, which is why it is safe to run whether or not the caller could
// put the *session* back — restoring that is the caller's, since loading a
// payload is not something a store does, and a snapshot this build can no
// longer read must not be a reason to strand somebody in dev.
//
// The dev slot stays. Removing it was tidiness and it is an author's work, so a
// session that cannot be restored still has somewhere to go back to; a stale one
// is not adopted, so nothing writes over it either.
export function leaveDev(save: SaveContext, exit: DevExit): void {
  if (!save.dev) throw new RuntimeError('not in dev mode');

  // Rewritten only when it differs, so the stamp on a slot nothing touched is
  // still the stamp of the write that made it. Bytes nobody can read differ
  // from everything, including from the snapshot they were taken of.
  const current = stateOf(save.store, PLAYER_SLOT);
  if (exit.kind === 'was-empty') {
    if (current.kind !== 'empty') save.store.remove(PLAYER_SLOT);
  } else if (exit.kind === 'restore' && (current.kind !== 'held' || current.slot.payload !== exit.payload)) {
    save.store.write(PLAYER_SLOT, exit.payload);
  }

  save.store.remove(DEV_SNAPSHOT_SLOT);
  // The session standing here is the one dev built: it is not what the player's
  // slot holds, and it is no longer the dev slot's either once the mode is off.
  // Withheld rather than forgotten, because an empty slot answers those two
  // differently and either of these may be empty.
  withhold(save, PLAYER_SLOT);
  withhold(save, DEV_SLOT);
  save.dev = false;
}

export interface SlotStanding {
  name: string;
  // Null when the slot is there and cannot be read, which is a thing a surface
  // draws rather than a reason to refuse the whole report.
  writtenAt: number | null;
}

// What is true of this session's saving, answered rather than inferred: a
// surface drawing it holds no copy of the mode, the slot or the cadence.
// Whether autosave may write the live slot, and when it may not, why. One
// field with three answers rather than a boolean beside a reason, because the
// two refusals are different things to do something about: a slot this session
// did not come out of is picked up or replaced, and one nobody can read is a
// file to go and look at.
export type SlotWrites = 'yes' | 'not-ours' | 'unreadable';

export interface SaveReport {
  dev: boolean;
  slot: string;
  writes: SlotWrites;
  // Null when the slot the cadence lives in cannot be made sense of, which is
  // a thing to draw rather than a reason to have no report.
  autosaveSeconds: number | null;
  slots: SlotStanding[];
}

export function writesLive(save: SaveContext): SlotWrites {
  const slot = liveSlot(save);
  if (adopts(save, slot)) return 'yes';
  return stateOf(save.store, slot).kind === 'unreadable' ? 'unreadable' : 'not-ours';
}

export function saveReport(save: SaveContext): SaveReport {
  return {
    dev: save.dev,
    slot: liveSlot(save),
    writes: writesLive(save),
    autosaveSeconds: cadenceOrNone(save),
    slots: save.store.list().map((name) => ({ name, writtenAt: standing(save.store, name) })),
  };
}

function standing(store: SlotStore, name: string): number | null {
  return datable(store, name)?.writtenAt ?? null;
}
