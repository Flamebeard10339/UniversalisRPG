import { RuntimeError } from './runtime';
import { slotStore, type Slot, type SlotDriver, type SlotStore } from './store';

// The slot a session writes when nobody is authoring, and the pair that exist
// only while somebody is. `dev-snapshot` holds the *session* at the moment dev
// mode was entered, so leaving puts the session back where it came from; the
// player's slot needs no putting back, because nothing in dev writes it.
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
// cadence is measured on, which slot is live, and the one slot whose game this
// session is. One clock, read by the store at a write and by the cadence at a
// check, so the two cannot disagree.
//
// `synced` is the whole of the entitlement rule. A session may write the live
// slot exactly when it is that slot's game, so this is one slot name and not a
// set of them, and there is no second set naming the slots it is not. Every
// event that changes what game this session is, or which slot is live, answers
// it: building the context, loading a payload, `/save`, autosave, and the two
// dev transitions. Nothing answers it at the moment of a write — which is what
// made one rule owe two different answers about an empty slot, since an empty
// dev slot at entry is this session's to take and an empty player slot on the
// way out of dev is not.
export interface SaveContext {
  readonly store: SlotStore;
  readonly now: () => number;
  dev: boolean;
  synced: string | null;
}

// A new game is the empty player slot's game, and this is the one place that is
// decided. A slot holding anything — bytes this build reads, or bytes it does
// not — is whoever wrote it's until `/restore` picks it up or `/save` takes it,
// which is what a reopened game meets.
export function createSaveContext(driver: SlotDriver, now: () => number): SaveContext {
  const store = slotStore(driver, now);
  return { store, now, dev: false, synced: stateOf(store, PLAYER_SLOT).kind === 'empty' ? PLAYER_SLOT : null };
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

export function liveSlot(save: SaveContext): string {
  return save.dev ? DEV_SLOT : PLAYER_SLOT;
}

// The cadence, or nothing when the slot it lives in cannot be made sense of.
// A setting is not a save: what a report owes a reader is the rest of the
// answer, not a refusal, so the two callers ask different questions of it the
// way `datable` and `writesLive` do of a slot.
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
  return { kind: 'wrote', slot };
}

// Said out loud, so it replaces whatever the slot holds and the session is its
// game from here: this is the way a session takes a slot it did not come from.
export function saveNow(save: SaveContext, payload: string): string {
  const slot = liveSlot(save);
  save.store.write(slot, payload);
  save.synced = slot;
  return slot;
}

// The session as it stood when dev mode was entered, and the slot it was the
// game of. Both, because putting the session back is only half of coming out of
// dev: a session restored without its standing would be the player's game again
// while the context still believed it was the dev slot's.
interface DevSnapshot {
  payload: string;
  synced: string | null;
}

function decodeSnapshot(text: string): DevSnapshot {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new RuntimeError(`slot ${DEV_SNAPSHOT_SLOT} does not hold a snapshot`);
  const held = parsed as Partial<DevSnapshot>;
  if (typeof held.payload !== 'string' || (held.synced !== null && typeof held.synced !== 'string')) throw new RuntimeError(`slot ${DEV_SNAPSHOT_SLOT} does not hold a snapshot`);
  return { payload: held.payload, synced: held.synced };
}

// What the dev slot holds, which is what a session entering dev has to be put
// into — null when there is none, and so nothing to pick up. Loading it is the
// caller's, because loading a payload is not a store's job, so the caller says
// so afterwards by handing `DEV_SLOT` to the load.
//
// What is snapshotted is the session, not the player's slot. The slot needs no
// snapshot: c10 is that nothing in dev writes it, so it is still exactly what it
// was when the mode goes off, and a compensating write on the way out could only
// ever put back damage this engine did not do — while being the one step on that
// path that could fail, and strand an author when it did. The session is the
// thing dev really does move, and this is the only copy of it.
export function enterDev(save: SaveContext, session: string): string | null {
  if (save.dev) throw new RuntimeError('already in dev mode');
  // Persisted before the mode is on, so nothing done in dev can precede it.
  save.store.write(DEV_SNAPSHOT_SLOT, JSON.stringify({ payload: session, synced: save.synced } satisfies DevSnapshot));
  save.dev = true;
  // An empty dev slot is this session's scratch slot and it takes it here,
  // where the question is asked once, rather than at every write. Anything
  // already in it is somebody's authoring until the caller loads it.
  const authoring = stateOf(save.store, DEV_SLOT);
  save.synced = authoring.kind === 'empty' ? DEV_SLOT : null;
  return authoring.kind === 'held' ? authoring.slot.payload : null;
}

// How leaving dev will go: back to the session dev was entered from, or — when
// the snapshot is gone, unreadable or not a snapshot — out of the mode with the
// session left exactly where it is. A value rather than a raise, because not
// being able to restore a session is never a reason to keep somebody in a mode
// with no way out of it.
export type DevExit = { kind: 'restore'; payload: string; synced: string | null } | { kind: 'no-snapshot'; why: string };

export function devSnapshot(save: SaveContext): DevExit {
  if (!save.dev) throw new RuntimeError('not in dev mode');
  const state = stateOf(save.store, DEV_SNAPSHOT_SLOT);
  if (state.kind === 'empty') return { kind: 'no-snapshot', why: `slot ${DEV_SNAPSHOT_SLOT} is gone` };
  if (state.kind === 'unreadable') return { kind: 'no-snapshot', why: `slot ${DEV_SNAPSHOT_SLOT} cannot be read` };
  try {
    const held = decodeSnapshot(state.slot.payload);
    return { kind: 'restore', payload: held.payload, synced: held.synced };
  } catch {
    return { kind: 'no-snapshot', why: `slot ${DEV_SNAPSHOT_SLOT} does not hold a snapshot` };
  }
}

// Turning the mode off, and saying what game the session is now — which only
// the caller knows, because only it ran the load. `becomes` is the snapshot's
// own standing when the session went back, and nothing when it could not: a
// session dev built is no slot's game, and there is no slot state that makes it
// one, which is why an empty player slot cannot take it either.
//
// This writes no game slot. The player's is already what it was, the dev slot is
// an author's work and stays, and the snapshot goes last so that a store which
// refuses the removal has already let the mode go off.
export function leaveDev(save: SaveContext, becomes: string | null): void {
  if (!save.dev) throw new RuntimeError('not in dev mode');
  save.dev = false;
  save.synced = becomes;
  save.store.remove(DEV_SNAPSHOT_SLOT);
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
  if (save.synced === slot) return 'yes';
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
