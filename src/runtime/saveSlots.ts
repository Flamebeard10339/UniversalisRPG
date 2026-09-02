import { RuntimeError } from './error';
import type { Answer } from './localized';
import { slotStore, type Slot, type SlotDriver, type SlotStore } from './store';

export const PLAYER_SLOT = 'player';
export const DEV_SLOT = 'dev';
export const DEV_SNAPSHOT_SLOT = 'dev-snapshot';

export const AUTOSAVE_SLOT = 'autosave';

export const MODULES_OFF_SLOT = 'modules-off';

export const EDITOR_SLOT = 'editor';

export const TRANSCRIPT_SLOT = 'transcript';

const PAGE_SLOTS: readonly string[] = [EDITOR_SLOT, TRANSCRIPT_SLOT];

export const keptByThePage = (name: string): boolean => PAGE_SLOTS.includes(name);

export const NEVER = 'never';

export type Cadence = number | typeof NEVER;

export const DEFAULT_CADENCE: Cadence = 0;

export interface SaveContext {
  readonly store: SlotStore;
  readonly now: () => number;
  dev: boolean;
  synced: Answer | null;
}

export function createSaveContext(driver: SlotDriver, now: () => number): SaveContext {
  const store = slotStore(driver, now);
  const save: SaveContext = { store, now, dev: stateOf(store, DEV_SNAPSHOT_SLOT).kind !== 'empty', synced: null };
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

export function cadenceOrUnreadable(save: SaveContext): Cadence | null {
  const state = stateOf(save.store, AUTOSAVE_SLOT);
  if (state.kind === 'empty') return DEFAULT_CADENCE;
  if (state.kind === 'unreadable') return null;
  if (state.slot.payload === NEVER) return NEVER;
  const seconds = Number(state.slot.payload);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function modulesTurnedOff(save: SaveContext): ReadonlySet<string> {
  const state = stateOf(save.store, MODULES_OFF_SLOT);
  if (state.kind !== 'held') return new Set();
  return new Set(
    state.slot.payload
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== ''),
  );
}

export function turnModulesOff(save: SaveContext, names: Iterable<string>): void {
  save.store.write(MODULES_OFF_SLOT, [...new Set(names)].sort().join('\n'));
}

export function setAutosaveCadence(save: SaveContext, cadence: Cadence): void {
  if (cadence !== NEVER && (!Number.isFinite(cadence) || cadence < 0)) throw new RuntimeError(`an autosave cadence is seconds, or ${NEVER}, not ${JSON.stringify(cadence)}`);
  save.store.write(AUTOSAVE_SLOT, String(cadence));
}

function liveWrittenAt(save: SaveContext): number | null {
  return datable(save.store, liveSlot(save))?.writtenAt ?? null;
}

export function autosaveDue(save: SaveContext): boolean {
  const cadence = cadenceOrUnreadable(save);
  if (cadence === null || cadence === NEVER) return false;
  const writtenAt = liveWrittenAt(save);
  return writtenAt === null || save.now() - writtenAt >= cadence * 1000;
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
  autosave: Cadence | null;
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
    autosave: cadenceOrUnreadable(save),
    slots: save.store.list().filter((name) => !keptByThePage(name)).map((name) => ({ name, writtenAt: standing(save.store, name) })),
  };
}

function standing(store: SlotStore, name: string): number | null {
  return datable(store, name)?.writtenAt ?? null;
}
