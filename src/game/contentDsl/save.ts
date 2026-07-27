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

// The record-shaped fields of GameState: diffed key-by-key so a save only
// carries the entries that actually changed, not whole-object replacement.
const RECORD_FIELDS = ['flags', 'inventory', 'xp', 'visits', 'activeBuffs', 'resources'] as const;

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

  if (state.location !== baseline.location) diff.location = state.location;
  if (state.time !== baseline.time) diff.time = state.time;
  if (state.rng !== baseline.rng) diff.rng = state.rng;
  if (!deepEqual(state.player, baseline.player)) diff.player = state.player;
  if (!deepEqual(state.activeAction, baseline.activeAction)) diff.activeAction = state.activeAction;
  if (state.pendingModal !== baseline.pendingModal) diff.pendingModal = state.pendingModal;

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
  const diff = saved.diff;

  state.flags = { ...base.flags, ...diff.flags };
  state.inventory = { ...base.inventory, ...diff.inventory };
  state.xp = { ...base.xp, ...diff.xp };
  state.visits = { ...base.visits, ...diff.visits };
  state.activeBuffs = { ...base.activeBuffs, ...diff.activeBuffs };
  state.resources = { ...base.resources, ...diff.resources };
  state.log = base.log;
  state.location = diff.location ?? base.location;
  state.time = diff.time ?? base.time;
  state.rng = diff.rng ?? base.rng;
  state.player = diff.player ?? base.player;
  state.activeAction = diff.activeAction !== undefined ? diff.activeAction : base.activeAction;
  state.pendingModal = 'pendingModal' in diff ? diff.pendingModal : base.pendingModal;
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

  const scalarFields = ['location', 'time', 'rng', 'pendingModal', 'player', 'activeAction'] as const;
  for (const field of scalarFields) {
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
