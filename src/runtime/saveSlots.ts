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

// A slot, or nothing — where nothing covers both "there is none" and "there is
// one and the store cannot make sense of it". Every reader here wants the same
// answer to those two, and reading one of them is not a reason to refuse the
// question that was asked.
function readable(store: SlotStore, name: string): Slot | null {
  try {
    return store.read(name);
  } catch (error) {
    if (error instanceof RuntimeError) return null;
    throw error;
  }
}

// Whether this session is entitled to write the slot without being asked twice:
// it is what that slot holds, or there is nothing in it to lose and nothing has
// said this session is not its.
export function adopts(save: SaveContext, slot: string): boolean {
  const standing = standingOf(save);
  return standing.is.has(slot) || (!standing.isNot.has(slot) && readable(save.store, slot) === null);
}

export function liveSlot(save: SaveContext): string {
  return save.dev ? DEV_SLOT : PLAYER_SLOT;
}

export function autosaveSeconds(save: SaveContext): number {
  const slot = save.store.read(AUTOSAVE_SLOT);
  if (!slot) return DEFAULT_AUTOSAVE_SECONDS;
  const seconds = Number(slot.payload);
  if (!Number.isFinite(seconds) || seconds < 0) throw new RuntimeError(`slot ${AUTOSAVE_SLOT} holds ${JSON.stringify(slot.payload)}, which is not a cadence in seconds`);
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
  return readable(save.store, liveSlot(save))?.writtenAt ?? null;
}

export function autosaveDue(save: SaveContext): boolean {
  const seconds = autosaveSeconds(save);
  if (seconds === 0) return false;
  const writtenAt = liveWrittenAt(save);
  return writtenAt === null || save.now() - writtenAt >= seconds * 1000;
}

// What an autosave check did. `held` is the one that has something to say: the
// cadence had elapsed and the slot was not this session's to replace.
export type Autosaved = { kind: 'waited' } | { kind: 'wrote'; slot: string } | { kind: 'held'; slot: string };

// `payload` is taken as a thunk because serializing a session costs more than
// reading a stamp, and this is asked after every command and on every live tick.
export function autosave(save: SaveContext, payload: () => string): Autosaved {
  if (!autosaveDue(save)) return { kind: 'waited' };
  const slot = liveSlot(save);
  if (!adopts(save, slot)) return { kind: 'held', slot };
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
function withhold(save: SaveContext, slot: string): void {
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

export function enterDev(save: SaveContext): void {
  if (save.dev) throw new RuntimeError('already in dev mode');
  const player = save.store.read(PLAYER_SLOT);
  // Persisted before the mode is on, so nothing done in dev can precede it.
  save.store.write(DEV_SNAPSHOT_SLOT, encodeSnapshot(player?.payload ?? null));
  // A dev slot left behind by a session that crashed is not this session's, and
  // is protected by the same rule everything else is. Not withheld: an absent
  // dev slot is a scratch slot this session may take.
  standingOf(save).is.delete(DEV_SLOT);
  save.dev = true;
}

// What the player's slot held when dev mode was entered, which is what a
// session leaving dev has to be put back to — null when there was no slot, and
// so nothing to go back to. Asked before anything is committed, so a caller
// that cannot load it back is still in dev with every slot where it was.
export function devSnapshot(save: SaveContext): string | null {
  if (!save.dev) throw new RuntimeError('not in dev mode');
  const snapshot = save.store.read(DEV_SNAPSHOT_SLOT);
  if (!snapshot) throw new RuntimeError(`slot ${DEV_SNAPSHOT_SLOT} is gone, so leaving dev mode cannot restore ${PLAYER_SLOT}; it is left as it is`);
  return decodeSnapshot(snapshot.payload);
}

// The commit, taking back what `devSnapshot` handed out: the slot goes back to
// it and the dev pair goes. Restoring the *session* is the caller's — loading a
// payload is not something a store does — and this runs after that stood, so
// leaving dev is all-or-nothing the way a load is.
export function leaveDev(save: SaveContext, held: string | null): void {
  if (!save.dev) throw new RuntimeError('not in dev mode');

  // Rewritten only when it differs, so the stamp on a slot nothing touched is
  // still the stamp of the write that made it.
  const current = save.store.read(PLAYER_SLOT);
  if (held === null) {
    if (current) save.store.remove(PLAYER_SLOT);
  } else if (current?.payload !== held) {
    save.store.write(PLAYER_SLOT, held);
  }

  save.store.remove(DEV_SLOT);
  save.store.remove(DEV_SNAPSHOT_SLOT);
  standingOf(save).is.delete(DEV_SLOT);
  // The session standing here is the one dev built, not the one the player's
  // slot holds — and that is true whether or not there is a slot to be unlike,
  // which is why it is withheld rather than merely forgotten. Until something
  // loads the player's game back, this session may not write it.
  withhold(save, PLAYER_SLOT);
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
export interface SaveReport {
  dev: boolean;
  slot: string;
  // Whether autosave may write the live slot, which is the difference between
  // a session that is being kept and one that is only being played.
  adopted: boolean;
  autosaveSeconds: number;
  slots: SlotStanding[];
}

export function saveReport(save: SaveContext): SaveReport {
  return {
    dev: save.dev,
    slot: liveSlot(save),
    adopted: adopts(save, liveSlot(save)),
    autosaveSeconds: autosaveSeconds(save),
    slots: save.store.list().map((name) => ({ name, writtenAt: standing(save.store, name) })),
  };
}

function standing(store: SlotStore, name: string): number | null {
  return readable(store, name)?.writtenAt ?? null;
}
