import { createGameState, GameState, initResources, RuntimeError } from './runtime';
import { Registry } from '../content/registry';
import { ParsedSave } from '../content/saveSection';
import { findActionOwner, parseOwnerRef } from './actions';
import { PLAYER } from './state';

// Bumped on any shape change; with no migration path, a stale save is rejected.
export const SAVE_VERSION = 4;

// A sparse diff against initialState: a new game saves as `{}`, and `log` is not state.
export type SaveDiff = Partial<Omit<GameState, 'log'>>;

// A Record over the exhaustive key type, so adding a GameState field is a type
// error here until it is classified as diffed key-by-key or carried whole.
type SaveField = Exclude<keyof GameState, 'log'>;

interface RecordPrune {
  of: string;
  loaded(registry: Registry, id: string): boolean;
}

// How a field survives a registry that no longer matches it.
type Prune = RecordPrune | 'pruned by a rule of its own' | 'holds no registry id';

interface SaveFieldRule {
  // Whether a save diff carries this field key-by-key or whole.
  shape: 'record' | 'scalar';
  // What the field will accept. A `# save` body is hand-written JSON that
  // nothing else checks, so this is where a `"time":"potato"` is caught.
  holds(value: unknown): boolean;
  prune: Prune;
}

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);
const isObject = (value: unknown): boolean => typeof value === 'object' && value !== null && !Array.isArray(value);

const SAVE_FIELDS: Record<SaveField, SaveFieldRule> = {
  location: { shape: 'scalar', holds: (value) => typeof value === 'string', prune: 'pruned by a rule of its own' },
  inventory: { shape: 'record', holds: isNumber, prune: { of: 'item', loaded: (registry, id) => registry.items.has(id) } },
  flags: { shape: 'record', holds: (value) => typeof value === 'boolean' || isNumber(value), prune: { of: 'flag', loaded: (registry, id) => registry.namespace.has('flag', id) } },
  visits: { shape: 'record', holds: isNumber, prune: { of: 'dialogue node', loaded: (registry, id) => registry.namespace.has('node', id) } },
  xp: { shape: 'record', holds: isNumber, prune: { of: 'skill', loaded: (registry, id) => registry.skills.has(id) } },
  resources: { shape: 'record', holds: isNumber, prune: { of: 'resource', loaded: (registry, id) => registry.resources.has(id) } },
  activeBuffs: { shape: 'record', holds: isObject, prune: 'pruned by a rule of its own' },
  activeAction: { shape: 'scalar', holds: (value) => value === null || isObject(value), prune: 'pruned by a rule of its own' },
  time: { shape: 'scalar', holds: isNumber, prune: 'holds no registry id' },
  rng: { shape: 'scalar', holds: isNumber, prune: 'holds no registry id' },
  player: { shape: 'scalar', holds: isObject, prune: 'holds no registry id' },
  pendingModal: { shape: 'scalar', holds: (value) => value === undefined || typeof value === 'string', prune: 'holds no registry id' },
};

const SAVE_FIELD_NAMES = Object.keys(SAVE_FIELDS) as SaveField[];

function fieldsOfShape(shape: 'record' | 'scalar'): SaveField[] {
  return SAVE_FIELD_NAMES.filter((field) => SAVE_FIELDS[field].shape === shape);
}

const RECORD_FIELDS = fieldsOfShape('record');
const SCALAR_FIELDS = fieldsOfShape('scalar');
const RECORD_PRUNES = SAVE_FIELD_NAMES.map((field) => [field, SAVE_FIELDS[field].prune] as const).filter((entry): entry is [SaveField, RecordPrune] => typeof entry[1] !== 'string');

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

export interface PruneWarning {
  path: string;
  id: string;
  message: string;
}

function addWarning(warnings: PruneWarning[], path: string, id: string, message: string): void {
  warnings.push({ path, id, message });
}

function pruneRecord<T>(
  record: Record<string, T>,
  path: string,
  has: (id: string) => boolean,
  kind: string,
  warnings: PruneWarning[],
): void {
  for (const id of Object.keys(record)) {
    if (has(id)) continue;
    delete record[id];
    addWarning(warnings, `${path}.${id}`, id, `Removed ${path} ${id} because its ${kind} is not loaded.`);
  }
}

function activeActionProblem(state: GameState, registry: Registry): string | null {
  const active = state.activeAction;
  if (!active) return null;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  let owner: { actions?: { label: string }[] } | undefined;
  try {
    owner = findActionOwner(obj, objId, registry) as { actions?: { label: string }[] } | undefined;
  } catch (error) {
    if (error instanceof RuntimeError) return error.message;
    throw error;
  }
  if (!owner) return `unknown ${obj}: ${objId}`;
  if (!owner.actions?.some((action) => action.label === active.actionLabel)) return `unknown action ${JSON.stringify(active.actionLabel)} on ${active.ownerRef}`;

  for (const actorId of Object.keys(active.actors ?? {})) if (!registry.entities.has(actorId)) return `unknown encounter actor: ${actorId}`;
  for (const actorId of Object.keys(active.cadences)) if (actorId !== PLAYER && !registry.entities.has(actorId)) return `unknown encounter cadence actor: ${actorId}`;
  for (const actor of Object.values(active.actors ?? {})) {
    for (const resourceId of Object.keys(actor.resources)) if (!registry.resources.has(resourceId)) return `unknown encounter resource: ${resourceId}`;
  }
  return null;
}

export function pruneStateForRegistry(state: GameState, registry: Registry): PruneWarning[] {
  const warnings: PruneWarning[] = [];

  if (state.location && !registry.locations.has(state.location)) {
    const old = state.location;
    const replacement = startingLocationId(registry) ?? '';
    state.location = replacement;
    addWarning(warnings, 'location', old, `Moved from unavailable location ${old} to ${replacement || '(nowhere)'}.`);
  }

  for (const [field, rule] of RECORD_PRUNES) {
    pruneRecord(state[field] as unknown as Record<string, unknown>, field, (id) => rule.loaded(registry, id), rule.of, warnings);
  }

  for (const [key, buff] of Object.entries(state.activeBuffs)) {
    const itemId = key.includes(':') ? key.slice(0, key.indexOf(':')) : undefined;
    const missing = !registry.stats.has(buff.statId) ? `stat ${buff.statId}` : itemId && !registry.items.has(itemId) ? `item ${itemId}` : undefined;
    if (!missing) continue;
    delete state.activeBuffs[key];
    addWarning(warnings, `activeBuffs.${key}`, key, `Removed active buff ${key} because its ${missing} is not loaded.`);
  }

  const activeProblem = activeActionProblem(state, registry);
  if (activeProblem) {
    const active = state.activeAction!;
    const id = `${active.ownerRef}.${active.actionLabel}`;
    state.activeAction = null;
    addWarning(warnings, 'activeAction', id, `Stopped unavailable action ${id}: ${activeProblem}.`);
  }

  return warnings;
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

function checkSave(saved: ParsedSave): void {
  if (saved.version !== SAVE_VERSION) {
    throw new RuntimeError(`save version mismatch: expected ${SAVE_VERSION}, got ${saved.version}`);
  }
  for (const [field, value] of Object.entries(saved.diff)) {
    const rule = SAVE_FIELDS[field as SaveField];
    if (!rule) throw new RuntimeError(`save holds an unknown field: ${field}`);
    if (rule.shape === 'scalar') {
      if (!rule.holds(value)) throw new RuntimeError(`save field ${field} holds ${JSON.stringify(value)}, which is not what ${field} keeps`);
      continue;
    }
    if (!isObject(value)) throw new RuntimeError(`save field ${field} must be an object of ids, not ${JSON.stringify(value)}`);
    for (const [id, held] of Object.entries(value as Record<string, unknown>)) {
      if (!rule.holds(held)) throw new RuntimeError(`save field ${field}.${id} holds ${JSON.stringify(held)}, which is not what ${field} keeps`);
    }
  }
}

// Mutates `state` in place: resets every field to initialState, then applies
export function loadSave(state: GameState, saved: ParsedSave, registry: Registry): PruneWarning[] {
  checkSave(saved);
  const base = initialState(registry);
  const diff = saved.diff;
  const target = state as unknown as Record<string, unknown>;
  const baseline = base as unknown as Record<string, unknown>;

  for (const field of RECORD_FIELDS) {
    target[field] = { ...(baseline[field] as object), ...(diff[field] as object) };
  }
  for (const field of SCALAR_FIELDS) {
    // `in`, not `!== undefined`: a diff can carry an explicit undefined.
    if (field in diff) target[field] = diff[field];
    else if (field in baseline) target[field] = baseline[field];
    else delete target[field];
  }
  state.log = base.log;
  const warnings = pruneStateForRegistry(state, registry);
  for (const warning of warnings) state.log.push(warning.message);
  return warnings;
}

function describeValue(value: unknown): string {
  return value === undefined ? '(absent)' : JSON.stringify(value);
}

export function compareSave(state: GameState, saved: ParsedSave, registry: Registry): string[] {
  checkSave(saved);
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
