import { RuntimeError } from './error';
import type { Answer } from './localized';
import { slotStore, type Slot, type SlotDriver, type SlotStore } from './store';

export const PLAYER_SLOT = 'player';
export const DEV_SLOT = 'dev';
export const DEV_SNAPSHOT_SLOT = 'dev-snapshot';

export const AUTOSAVE_SLOT = 'autosave';

export const DEFAULT_AUTOSAVE_SECONDS = 0;

export interface SaveContext {
  readonly store: SlotStore;
  readonly now: () => number;
  dev: boolean;
  synced: Answer | null;
}

export function createSaveContext(driver: SlotDriver, now: () => number): SaveContext {
  const save: SaveContext = { store: slotStore(driver, now), now, dev: false, synced: null };
  save.synced = entitledSlot(save);
  return save;
}

function entitledSlot(save: SaveContext): Answer | null {
  const slot = liveSlot(save);
  return stateOf(save.store, slot).kind === 'empty' ? slot : null;
}

export type SlotState = { kind: 'empty' } | { kind: 'held'; slot: Slot } | { kind: 'unreadable' };

function stateOf(store: SlotStore, name: string): SlotState {
  try {
    const slot = store.read(name);
    return slot === null ? { kind: 'empty' } : { kind: 'held', slot };
  } catch (error) {
    if (error instanceof RuntimeError) return { kind: 'unreadable' };
    throw error;
  }
}

function datable(store: SlotStore, name: string): Slot | null {
  const state = stateOf(store, name);
  return state.kind === 'held' ? state.slot : null;
}

export function liveSlot(save: SaveContext): string {
  return save.dev ? DEV_SLOT : PLAYER_SLOT;
}

export function liveHolding(save: SaveContext): SlotState {
  return stateOf(save.store, liveSlot(save));
}

export function cadenceOrNone(save: SaveContext): number | null {
  const state = stateOf(save.store, AUTOSAVE_SLOT);
  if (state.kind === 'empty') return DEFAULT_AUTOSAVE_SECONDS;
  if (state.kind === 'unreadable') return null;
  const seconds = Number(state.slot.payload);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function autosaveSeconds(save: SaveContext): number {
  const seconds = cadenceOrNone(save);
  if (seconds === null) throw new RuntimeError(`slot ${AUTOSAVE_SLOT} does not hold a cadence in seconds`);
  return seconds;
}

export function setAutosaveSeconds(save: SaveContext, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RuntimeError(`an autosave cadence is seconds, zero for never, not ${JSON.stringify(seconds)}`);
  save.store.write(AUTOSAVE_SLOT, String(seconds));
}

function liveWrittenAt(save: SaveContext): number | null {
  return datable(save.store, liveSlot(save))?.writtenAt ?? null;
}

export function autosaveDue(save: SaveContext): boolean {
  const seconds = autosaveSeconds(save);
  if (seconds === 0) return false;
  const writtenAt = liveWrittenAt(save);
  return writtenAt === null || save.now() - writtenAt >= seconds * 1000;
}

export type Autosaved = { kind: 'waited' } | { kind: 'wrote'; slot: string } | { kind: 'held'; slot: string } | { kind: 'unreadable'; slot: string };

export function autosave(save: SaveContext, payload: () => string): Autosaved {
  if (!autosaveDue(save)) return { kind: 'waited' };
  const slot = liveSlot(save);
  const writes = writesLive(save);
  if (writes !== 'yes') return { kind: writes === 'unreadable' ? 'unreadable' : 'held', slot };
  save.store.write(slot, payload());
  return { kind: 'wrote', slot };
}

export function saveNow(save: SaveContext, payload: string): string {
  const slot = liveSlot(save);
  save.store.write(slot, payload);
  save.synced = slot;
  return slot;
}

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

export function enterDev(save: SaveContext, session: string): string | null {
  if (save.dev) throw new RuntimeError('already in dev mode');
  save.store.write(DEV_SNAPSHOT_SLOT, JSON.stringify({ payload: session, synced: save.synced } satisfies DevSnapshot));
  save.dev = true;
  const authoring = stateOf(save.store, DEV_SLOT);
  save.synced = authoring.kind === 'empty' ? DEV_SLOT : null;
  return authoring.kind === 'held' ? authoring.slot.payload : null;
}

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

export function leaveDev(save: SaveContext, becomes: string | null): void {
  if (!save.dev) throw new RuntimeError('not in dev mode');
  save.dev = false;
  save.synced = becomes;
  save.store.remove(DEV_SNAPSHOT_SLOT);
}

export interface SlotStanding {
  name: string;
  writtenAt: number | null;
}

export type SlotWrites = 'yes' | 'not-ours' | 'unreadable';

export interface SaveReport {
  dev: boolean;
  slot: string;
  writes: SlotWrites;
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
