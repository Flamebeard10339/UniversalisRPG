import { createGameState, GameState, initResources, RuntimeError } from './runtime';
import { Registry } from '../content/registry';
import { ParsedSave } from '../content/saveSection';

// Bumped on any shape change; with no migration path, a stale save is rejected.
export const SAVE_VERSION = 4;

// A sparse diff against initialState: a new game saves as `{}`, and `log` is not state.
export type SaveDiff = Partial<Omit<GameState, 'log'>>;

// A Record over the exhaustive key type, so adding a GameState field is a type
// error here until it is classified as diffed key-by-key or carried whole.
type SaveField = Exclude<keyof GameState, 'log'>;

const SAVE_FIELDS: Record<SaveField, 'record' | 'scalar'> = {
  flags: 'record',
  inventory: 'record',
  xp: 'record',
  visits: 'record',
  activeBuffs: 'record',
  resources: 'record',
  location: 'scalar',
  time: 'scalar',
  rng: 'scalar',
  player: 'scalar',
  activeAction: 'scalar',
  pendingModal: 'scalar',
};

function fieldsOfKind(kind: 'record' | 'scalar'): SaveField[] {
  return (Object.keys(SAVE_FIELDS) as SaveField[]).filter((field) => SAVE_FIELDS[field] === kind);
}

const RECORD_FIELDS = fieldsOfKind('record');
const SCALAR_FIELDS = fieldsOfKind('scalar');

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffRecord(state: Record<string, unknown>, baseline: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(state), ...Object.keys(baseline)])) {
    if (!deepEqual(state[key], baseline[key])) out[key] = state[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function startingLocationId(registry: Registry): string | undefined {
  return [...registry.locations.values()].find((location) => location.starting)?.id;
}

export function initialState(registry: Registry): GameState {
  const state = createGameState();
  const starting = startingLocationId(registry);
  if (starting) state.location = starting;
  initResources(state, registry);
  return state;
}

export function diffState(state: GameState, baseline: GameState): SaveDiff {
  const diff: Record<string, unknown> = {};

  for (const field of RECORD_FIELDS) {
    const recordDiff = diffRecord(state[field] as Record<string, unknown>, baseline[field] as Record<string, unknown>);
    if (recordDiff) diff[field] = recordDiff;
  }
  for (const field of SCALAR_FIELDS) {
    if (!deepEqual(state[field], baseline[field])) diff[field] = state[field];
  }

  return diff as SaveDiff;
}

export function serializeSave(state: GameState, registry: Registry): string {
  const diff = diffState(state, initialState(registry));
  return JSON.stringify({ version: SAVE_VERSION, ...diff });
}

function checkVersion(saved: ParsedSave): void {
  if (saved.version !== SAVE_VERSION) {
    throw new RuntimeError(`save version mismatch: expected ${SAVE_VERSION}, got ${saved.version}`);
  }
}

// Mutates `state` in place: resets every field to initialState, then applies
export function loadSave(state: GameState, saved: ParsedSave, registry: Registry): void {
  checkVersion(saved);
  const base = initialState(registry);
  const diff = saved.diff;
  const target = state as unknown as Record<string, unknown>;
  const baseline = base as unknown as Record<string, unknown>;

  for (const field of RECORD_FIELDS) {
    target[field] = { ...(baseline[field] as object), ...(diff[field] as object) };
  }
  for (const field of SCALAR_FIELDS) {
    // `in`, not `!== undefined`: a diff can carry an explicit undefined.
    target[field] = field in diff ? diff[field] : baseline[field];
  }
  state.log = base.log;
}

function describeValue(value: unknown): string {
  return value === undefined ? '(absent)' : JSON.stringify(value);
}

export function compareSave(state: GameState, saved: ParsedSave, registry: Registry): string[] {
  checkVersion(saved);
  const current = diffState(state, initialState(registry));
  const expected = saved.diff;
  const diffs: string[] = [];

  for (const field of RECORD_FIELDS) {
    const a = (current[field] ?? {}) as Record<string, unknown>;
    const b = (expected[field] ?? {}) as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!deepEqual(a[key], b[key])) diffs.push(`${field}.${key}: ${describeValue(a[key])} vs ${describeValue(b[key])}`);
    }
  }

  for (const field of SCALAR_FIELDS) {
    if (!deepEqual(current[field], expected[field])) diffs.push(`${field}: ${describeValue(current[field])} vs ${describeValue(expected[field])}`);
  }

  return diffs;
}
