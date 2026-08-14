import { DEFAULT_LANGUAGE } from '../grammar/section';
import { createGameState, GameState, initResources, RuntimeError } from './runtime';
import { Registry } from '../content/registry';
import { ParsedSave } from '../content/saveSection';
import { findActionOwner, parseOwnerRef } from './actions';
import { isInstanceTable, pruneInstances } from './instances';
import { itemTemplate } from './itemInstance';
import { isPopulations, prunePopulations } from './population';
import { isModalFrame, pruneModals } from './modals';
import { Localized, Localizer, localizerOf } from './localized';
import { PLAYER } from './state';
import { templateOf } from './encounter';

// Bumped on any shape change; with no migration path, a stale save is rejected.
export const SAVE_VERSION = 8;

// A sparse diff against initialState: a new game saves as `{}`, and neither
// `log` nor `language` is state — one is drained by reading it, the other is
// the player's setting for the session rather than the world's.
export type SaveDiff = Partial<Omit<GameState, 'log' | 'language'>>;

// A Record over the exhaustive key type, so adding a GameState field is a type
// error here until it is classified as diffed key-by-key or carried whole.
type SaveField = Exclude<keyof GameState, 'log' | 'language'>;

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
const isInteger = (value: unknown): boolean => isNumber(value) && Number.isInteger(value);
const isObject = (value: unknown): boolean => typeof value === 'object' && value !== null && !Array.isArray(value);

const SAVE_FIELDS: Record<SaveField, SaveFieldRule> = {
  location: { shape: 'scalar', holds: (value) => typeof value === 'string', prune: 'pruned by a rule of its own' },
  inventory: { shape: 'record', holds: isNumber, prune: { of: 'item', loaded: (registry, id) => registry.items.has(id) } },
  flags: { shape: 'record', holds: (value) => typeof value === 'boolean' || isNumber(value), prune: { of: 'flag', loaded: (registry, id) => registry.namespace.has('flag', id) } },
  visits: { shape: 'record', holds: isNumber, prune: { of: 'dialogue node', loaded: (registry, id) => registry.namespace.has('node', id) } },
  xp: { shape: 'record', holds: isNumber, prune: { of: 'skill', loaded: (registry, id) => registry.skills.has(id) } },
  resources: { shape: 'record', holds: isInteger, prune: { of: 'resource', loaded: (registry, id) => registry.resources.has(id) } },
  resourceRateRemainders: { shape: 'record', holds: isInteger, prune: { of: 'resource', loaded: (registry, id) => registry.resources.has(id) } },
  equipped: { shape: 'record', holds: (value) => typeof value === 'string', prune: 'pruned by a rule of its own' },
  activeBuffs: { shape: 'record', holds: isObject, prune: 'pruned by a rule of its own' },
  activeAction: { shape: 'scalar', holds: (value) => value === null || isObject(value), prune: 'pruned by a rule of its own' },
  journey: { shape: 'scalar', holds: (value) => value === null || isObject(value), prune: 'pruned by a rule of its own' },
  instances: { shape: 'scalar', holds: isInstanceTable, prune: 'pruned by a rule of its own' },
  populations: { shape: 'scalar', holds: isPopulations, prune: 'pruned by a rule of its own' },
  time: { shape: 'scalar', holds: isInteger, prune: 'holds no registry id' },
  rng: { shape: 'scalar', holds: isInteger, prune: 'holds no registry id' },
  player: { shape: 'scalar', holds: isObject, prune: 'holds no registry id' },
  modals: { shape: 'scalar', holds: (value) => Array.isArray(value) && value.every(isModalFrame), prune: 'pruned by a rule of its own' },
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

export function initialState(registry: Registry, language: string = DEFAULT_LANGUAGE): GameState {
  const state = createGameState('', language);
  const starting = startingLocationId(registry);
  if (starting) state.location = starting;
  initResources(state, registry);
  return state;
}

export interface PruneWarning {
  path: string;
  id: string;
  message: Localized;
}

function addWarning(warnings: PruneWarning[], path: string, id: string, message: Localized): void {
  warnings.push({ path, id, message });
}

function pruneRecord<T>(
  record: Record<string, T>,
  path: string,
  has: (id: string) => boolean,
  kind: string,
  warnings: PruneWarning[],
  localizer: Localizer,
): void {
  for (const id of Object.keys(record)) {
    if (has(id)) continue;
    delete record[id];
    addWarning(warnings, `${path}.${id}`, id, localizer.engine('engine.prune.record', { path: localizer.identifier(path), id: localizer.identifier(id), kind: localizer.identifier(kind) }));
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

  for (const actorId of Object.keys(active.actors ?? {})) if (!registry.entities.has(templateOf(actorId))) return `unknown encounter actor: ${actorId}`;
  for (const actorId of Object.keys(active.cadences)) if (actorId !== PLAYER && !registry.entities.has(templateOf(actorId))) return `unknown encounter cadence actor: ${actorId}`;
  for (const actor of Object.values(active.actors ?? {})) {
    for (const resourceId of Object.keys(actor.resources)) if (!registry.resources.has(resourceId)) return `unknown encounter resource: ${resourceId}`;
  }
  return null;
}

export function pruneStateForRegistry(state: GameState, registry: Registry): PruneWarning[] {
  const warnings: PruneWarning[] = [];
  const localizer = localizerOf(registry, state);
  // An id survives translation; the reason a modal or an action was dropped is
  // an English diagnostic and does not.
  const named = localizer.identifier;

  // First, so every rule under it asks a settled table rather than one still
  // being pruned beneath it: a field holding an instance id gets one answer.
  warnings.push(...pruneInstances(state, registry));
  warnings.push(...prunePopulations(state, registry));

  if (state.location && !registry.locations.has(state.location)) {
    const old = state.location;
    const replacement = startingLocationId(registry) ?? '';
    state.location = replacement;
    const to = replacement ? named(replacement) : localizer.engine('engine.prune.nowhere');
    addWarning(warnings, 'location', old, localizer.engine('engine.prune.location', { from: named(old), to }));
  }

  for (const [field, rule] of RECORD_PRUNES) {
    pruneRecord(state[field] as unknown as Record<string, unknown>, field, (id) => rule.loaded(registry, id), rule.of, warnings, localizer);
  }

  for (const [key, buff] of Object.entries(state.activeBuffs)) {
    const itemId = key.includes(':') ? key.slice(0, key.indexOf(':')) : undefined;
    // Two patterns rather than one with a phrase substituted into it: a
    // fragment like `stat attack` is a sentence a translator cannot reach.
    const message = !registry.stats.has(buff.statId)
      ? localizer.engine('engine.prune.buff.stat', { buff: named(key), stat: named(buff.statId) })
      : itemId && !registry.items.has(itemId)
        ? localizer.engine('engine.prune.buff.item', { buff: named(key), item: named(itemId) })
        : undefined;
    if (!message) continue;
    delete state.activeBuffs[key];
    addWarning(warnings, `activeBuffs.${key}`, key, message);
  }

  // A worn id may spell a grown copy, and pruneInstances has already settled
  // which of those are left, so an id that no longer resolves to one is read as
  // the item id it would otherwise be and drops the same way a missing item does.
  for (const [slot, wornId] of Object.entries(state.equipped)) {
    const itemId = itemTemplate(state, wornId);
    const item = registry.items.get(itemId);
    const params = { slot: named(slot), item: named(itemId) };
    const message = !item ? localizer.engine('engine.prune.equipped.missing', params) : item.slot !== slot ? localizer.engine('engine.prune.equipped.slot', params) : undefined;
    if (!message) continue;
    delete state.equipped[slot];
    addWarning(warnings, `equipped.${slot}`, wornId, message);
  }

  for (const { name, reason } of pruneModals(state, registry)) {
    addWarning(warnings, `modals.${name}`, name, localizer.engine('engine.prune.modal', { modal: named(name), reason: localizer.prose(reason) }));
  }

  // A walk whose destination or any of whose legs has gone is a walk to
  // nowhere; there is no half of it worth keeping, so the whole of it goes.
  const journey = state.journey;
  if (journey) {
    const lost = [journey.to, ...journey.legs].find((place) => !registry.locations.has(place));
    if (lost !== undefined) {
      state.journey = null;
      addWarning(warnings, 'journey', journey.to, localizer.engine('engine.prune.journey', { to: named(journey.to), lost: named(lost) }));
    }
  }

  const activeProblem = activeActionProblem(state, registry);
  if (activeProblem) {
    const active = state.activeAction!;
    const id = `${active.ownerRef}.${active.actionLabel}`;
    state.activeAction = null;
    addWarning(warnings, 'activeAction', id, localizer.engine('engine.prune.action', { action: named(id), reason: localizer.prose(activeProblem) }));
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
  // A save outlives the load, so the state may not be built from its objects.
  const diff = structuredClone(saved.diff);
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
