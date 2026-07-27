import { DslError } from './parser';
import { createGameState, GameState, initResources, Registry, RuntimeError } from './runtime';
import { RawSection } from './structure';

// Versioned so a future format change fails loudly instead of silently
// misapplying a stale diff — see the postmortem for why this rewrite has no
// migration path.
// 2: a flat stat buff's `amount` became a range ({min, max}) rather than a
//    number, so a v1 save with food active would otherwise poison every stat
//    reading it with NaN.
// 3: activeAction carries the encounter's non-player actors and their pools.
export const SAVE_VERSION = 3;

// A save is a sparse diff against initialState(registry): a brand-new game
// saves as `{}`. `log` is transcript, not state, and is never part of a save.
export type SaveDiff = Partial<Omit<GameState, 'log'>>;

// In-memory shape; the on-disk/DSL JSON form is the flat `{version, ...diff}`
// object (see serializeSave/parseSaveSection).
export interface SavedGame {
  version: number;
  diff: SaveDiff;
}

// Every field of GameState a save carries, and how it is carried: `record`
// fields are diffed key-by-key so a save holds only the entries that changed,
// `scalar` fields whole. `log` is transcript, not state, and is the one
// deliberate omission.
//
// This is a Record over the exhaustive key type on purpose. diffing, loading and
// comparing each used to keep their own hand-written list of fields, and three
// passes in a row had to thread a new field through all of them by hand — the
// "systems required to be manually kept in sync" CLAUDE.md prohibits. A field
// missed that way is worse than lost: compareSave reports no difference for it.
// Adding one to GameState is now a type error here until it is classified.
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

// The single source of truth for "which location does a fresh game start in":
// shared by initialState (the save baseline) and startSession (session.ts),
// so the two can't drift.
export function startingLocationId(registry: Registry): string | undefined {
  return [...registry.locations.values()].find((location) => location.starting)?.id;
}

// The save-diff baseline: a brand-new game, placed at the registry's starting
// location exactly as startSession does it.
export function initialState(registry: Registry): GameState {
  const state = createGameState();
  const starting = startingLocationId(registry);
  if (starting) state.location = starting;
  initResources(state, registry);
  return state;
}

// Only the fields of `state` that differ from `baseline`, excluding `log`.
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

// Single-line JSON, matching the `# save` DSL body (see parseSaveSection).
export function serializeSave(state: GameState, registry: Registry): string {
  const diff = diffState(state, initialState(registry));
  return JSON.stringify({ version: SAVE_VERSION, ...diff });
}

function checkVersion(saved: SavedGame): void {
  if (saved.version !== SAVE_VERSION) {
    throw new RuntimeError(`save version mismatch: expected ${SAVE_VERSION}, got ${saved.version}`);
  }
}

// Mutates `state` in place (callers hold the reference): resets every field to
// initialState(registry)'s values, clearing anything stale, then applies the
// saved diff on top.
export function loadSave(state: GameState, saved: SavedGame, registry: Registry): void {
  checkVersion(saved);
  const base = initialState(registry);
  const diff = saved.diff as Record<string, unknown>;
  const target = state as unknown as Record<string, unknown>;
  const baseline = base as unknown as Record<string, unknown>;

  for (const field of RECORD_FIELDS) {
    target[field] = { ...(baseline[field] as object), ...(diff[field] as object) };
  }
  for (const field of SCALAR_FIELDS) {
    // `in` rather than `!== undefined`: a diff can legitimately carry an
    // explicit undefined (pendingModal cleared against a baseline that had one).
    target[field] = field in diff ? diff[field] : baseline[field];
  }
  state.log = base.log;
}

function describeValue(value: unknown): string {
  return value === undefined ? '(absent)' : JSON.stringify(value);
}

// Human-readable differences between `state`'s current save-diff and the
// stored one; [] means match. `log` is already excluded by diffState.
export function compareSave(state: GameState, saved: SavedGame, registry: Registry): string[] {
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

// Parses a `# save <id>` section: the body is a single line of JSON in the
// flat `{version, ...diff}` form (no multi-line JSON support — see grammar).
export function parseSaveSection(section: RawSection): { id: string; saved: SavedGame } {
  if (!section.id) throw new DslError('# save requires an id', section.span);

  const raw = section.body.map((line) => line.text).join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DslError(`# save ${section.id}: invalid JSON: ${raw}`, section.span);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DslError(`# save ${section.id}: must be a JSON object`, section.span);
  }

  const { version, ...diff } = parsed as { version?: unknown } & Record<string, unknown>;
  if (typeof version !== 'number') throw new DslError(`# save ${section.id}: requires a numeric version`, section.span);

  return { id: section.id, saved: { version, diff: diff as SaveDiff } };
}
