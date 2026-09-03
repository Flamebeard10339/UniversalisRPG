import { endAction } from './actionEnd';
import { RuntimeError } from './error';
import { Action } from '../content/sections/entity';
import { actionAddress } from '../content/sections/action';
import { DEFAULT_LANGUAGE } from '../grammar/section';
import { EMPTY_BUNDLE, isBundle } from './bundle';
import { createGameState, GameState, ownerRef, parseOwnerRef, type ActiveAction, type InstanceTable, type Seat } from './state';
import type { PruneWarning } from './pruning';
import { initResources } from './effects';
import { Registry, startingLocationId } from '../content/registry';
import { ParsedSave } from '../content/sections/save';
import { findActionOwner, travelEndProblem, TRAVEL_PAIR } from './actionLookup';
import { isBuffList, pruneBuffs } from './buffs';
import { isInstanceTable, pruneInstances } from './instances';
import { heldSignature, itemTemplate } from './itemInstance';
import { isPopulations, prunePopulations } from './population';
import { isShopStock } from './trade';
import { isModalFrame, pruneModals } from './modals';
import { Localized, Localizer, localizerOf } from './localized';
import { emptyPlayerSheet, PLAYER, PLAYER_FIELDS, templateOf } from './state';
import { isSettingName, isSettingSheet, standingChoice, standingSettings, type SettingSheet } from './settings';

export const SAVE_VERSION = 13;

export type SaveField = Exclude<keyof GameState, 'log' | 'language' | 'endedBecause' | 'engagedBy' | 'carriedTold' | 'engagesAt' | 'cyclesDone' | 'spent' | 'debug'>;

export type SaveDiff = Partial<Pick<GameState, SaveField>>;

interface RecordPrune {
  of: string;
  loaded(registry: Registry, id: string): boolean;
}

type Prune = RecordPrune | 'pruned by a rule of its own' | 'holds no registry id';

type Renaming = (id: string) => string;

type Minted = 'the table the ids are keys of' | 'names no minted copy' | { rename(value: unknown, renamed: Renaming): unknown };

interface SaveFieldRule {
  shape: 'record' | 'scalar';
  holds(value: unknown): boolean;
  sparsest: unknown;
  prune: Prune;
  minted: Minted;
  walked: boolean;
}

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);
const isInteger = (value: unknown): boolean => isNumber(value) && Number.isInteger(value);
const isObject = (value: unknown): boolean => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): boolean => typeof value === 'string';

function at(value: unknown, field: string, holds: (held: unknown) => boolean): boolean {
  return isObject(value) && holds((value as Record<string, unknown>)[field]);
}

function everyValue(value: unknown, holds: (held: unknown) => boolean): boolean {
  return isObject(value) && Object.values(value as Record<string, unknown>).every(holds);
}

const isActor = (value: unknown): boolean => at(value, 'resources', (held) => everyValue(held, isNumber)) && at(value, 'rateRemainders', (held) => everyValue(held, isNumber));

const optional = (value: unknown, field: string, holds: (held: unknown) => boolean): boolean => {
  const held = (value as Record<string, unknown>)[field];
  return held === undefined || holds(held);
};

const isCadence = (value: unknown): boolean => at(value, 'progress', isNumber) && at(value, 'attemptsMade', isInteger) && optional(value, 'span', isNumber);

const isSeat = (value: unknown): boolean => at(value, 'ownerRef', isText) && at(value, 'actionSlug', isText) && at(value, 'target', isText);

const isActiveAction = (value: unknown): boolean =>
  at(value, 'ownerRef', isText) &&
  at(value, 'actionSlug', isText) &&
  at(value, 'repeating', (held) => typeof held === 'boolean') &&
  at(value, 'implicitTarget', isNumber) &&
  at(value, 'cadences', (held) => everyValue(held, isCadence)) &&
  optional(value, 'actors', (held) => everyValue(held, isActor)) &&
  optional(value, 'roster', (held) => everyValue(held, isSeat));

const isJourney = (value: unknown): boolean => at(value, 'to', isText) && at(value, 'legs', (held) => Array.isArray(held) && held.every(isText));

const isPlayer = (value: unknown): boolean => PLAYER_FIELDS.every((field) => at(value, field, isText));

const renamedRef = (ref: string, renamed: Renaming): string => {
  const { obj, objId } = parseOwnerRef(ref);
  return obj === '' ? renamed(ref) : ownerRef(obj, renamed(objId));
};

const renamedValues = (value: unknown, renamed: Renaming): unknown =>
  Object.fromEntries(Object.entries(value as Record<string, string>).map(([key, held]) => [key, renamed(held)]));

const renamedSeat = (seat: Seat, renamed: Renaming): Seat => ({ ...seat, ownerRef: renamedRef(seat.ownerRef, renamed), target: renamed(seat.target) });

const renamedActiveAction = (value: unknown, renamed: Renaming): unknown => {
  if (value === null) return value;
  const active = value as ActiveAction;
  return {
    ...active,
    ownerRef: renamedRef(active.ownerRef, renamed),
    ...(active.roster ? { roster: Object.fromEntries(Object.entries(active.roster).map(([seat, held]) => [renamed(seat), renamedSeat(held, renamed)])) } : {}),
    ...(active.actors ? { actors: Object.fromEntries(Object.entries(active.actors).map(([actor, held]) => [renamed(actor), held])) } : {}),
    ...(active.cadences ? { cadences: Object.fromEntries(Object.entries(active.cadences).map(([actor, held]) => [renamed(actor), held])) } : {}),
  };
};

export const SAVE_FIELDS: Record<SaveField, SaveFieldRule> = {
  location: { shape: 'scalar', holds: isText, sparsest: '', prune: 'pruned by a rule of its own' , walked: true, minted: 'names no minted copy' },
  inventory: { shape: 'record', holds: isNumber, sparsest: 0, prune: { of: 'item', loaded: (registry, id) => registry.items.has(id) } , walked: false, minted: 'names no minted copy' },
  packOrder: { shape: 'scalar', holds: (value) => Array.isArray(value) && value.every(isText), sparsest: [], prune: 'pruned by a rule of its own' , walked: true, minted: { rename: (value, renamed) => (value as string[]).map(renamed) } },
  flags: { shape: 'record', holds: (value) => typeof value === 'boolean' || isNumber(value), sparsest: false, prune: { of: 'flag', loaded: (registry, id) => registry.namespace.has('flag', id) } , walked: true, minted: 'names no minted copy' },
  bundles: { shape: 'record', holds: isBundle, sparsest: EMPTY_BUNDLE, prune: { of: 'bundle', loaded: (registry, id) => registry.flags.get(id)?.bundle === true } , walked: false, minted: 'names no minted copy' },
  visits: { shape: 'record', holds: isNumber, sparsest: 0, prune: { of: 'dialogue node', loaded: (registry, id) => registry.namespace.has('node', id) } , walked: true, minted: 'names no minted copy' },
  xp: { shape: 'record', holds: isNumber, sparsest: 0, prune: { of: 'skill', loaded: (registry, id) => registry.skills.has(id) } , walked: false, minted: 'names no minted copy' },
  resources: { shape: 'record', holds: isInteger, sparsest: 0, prune: { of: 'resource', loaded: (registry, id) => registry.resources.has(id) } , walked: false, minted: 'names no minted copy' },
  resourceRateRemainders: { shape: 'record', holds: isInteger, sparsest: 0, prune: { of: 'resource', loaded: (registry, id) => registry.resources.has(id) } , walked: false, minted: 'names no minted copy' },
  equipped: { shape: 'record', holds: isText, sparsest: '', prune: 'pruned by a rule of its own' , walked: true, minted: { rename: renamedValues } },
  buffs: { shape: 'record', holds: isBuffList, sparsest: [], prune: 'pruned by a rule of its own' , walked: false, minted: 'names no minted copy' },
  activeAction: { shape: 'scalar', holds: (value) => value === null || isActiveAction(value), sparsest: { ownerRef: '', actionSlug: '', repeating: false, implicitTarget: 0, cadences: {} }, prune: 'pruned by a rule of its own' , walked: false, minted: { rename: renamedActiveAction } },
  journey: { shape: 'scalar', holds: (value) => value === null || isJourney(value), sparsest: { to: '', legs: [] }, prune: 'pruned by a rule of its own' , walked: true, minted: 'names no minted copy' },
  instances: { shape: 'scalar', holds: isInstanceTable, sparsest: { next: 1, byId: {} }, prune: 'pruned by a rule of its own' , walked: false, minted: 'the table the ids are keys of' },
  populations: { shape: 'scalar', holds: isPopulations, sparsest: {}, prune: 'pruned by a rule of its own' , walked: false, minted: 'names no minted copy' },
  shops: { shape: 'record', holds: (value) => value === null || isShopStock(value), sparsest: null, prune: { of: 'shop', loaded: (registry, id) => registry.shops.has(id) } , walked: false, minted: 'names no minted copy' },
  time: { shape: 'scalar', holds: isInteger, sparsest: 0, prune: 'holds no registry id' , walked: false, minted: 'names no minted copy' },
  rng: { shape: 'scalar', holds: isInteger, sparsest: 0, prune: 'holds no registry id' , walked: false, minted: 'names no minted copy' },
  player: { shape: 'scalar', holds: isPlayer, sparsest: emptyPlayerSheet(), prune: 'pruned by a rule of its own' , walked: true, minted: 'names no minted copy' },
  settings: { shape: 'scalar', holds: isSettingSheet, sparsest: standingSettings(), prune: 'pruned by a rule of its own' , walked: true, minted: 'names no minted copy' },
  modals: { shape: 'scalar', holds: (value) => Array.isArray(value) && value.every(isModalFrame), sparsest: [], prune: 'pruned by a rule of its own' , walked: true, minted: 'names no minted copy' },
};

export const SAVE_FIELD_NAMES = Object.keys(SAVE_FIELDS) as SaveField[];

function fieldsOfShape(shape: 'record' | 'scalar'): SaveField[] {
  return SAVE_FIELD_NAMES.filter((field) => SAVE_FIELDS[field].shape === shape);
}

const RECORD_FIELDS = fieldsOfShape('record');
const WALKED_FIELDS = new Set(SAVE_FIELD_NAMES.filter((field) => SAVE_FIELDS[field].walked));
const SCALAR_FIELDS = fieldsOfShape('scalar');
const RECORD_PRUNES = SAVE_FIELD_NAMES.map((field) => [field, SAVE_FIELDS[field].prune] as const).filter((entry): entry is [SaveField, RecordPrune] => typeof entry[1] !== 'string');

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const held = (record: Record<string, unknown>, key: string, sparsest: unknown): unknown => record[key] ?? sparsest;

function diffRecord(field: SaveField, state: Record<string, unknown>, baseline: Record<string, unknown>): Record<string, unknown> | undefined {
  const { sparsest } = SAVE_FIELDS[field];
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(state), ...Object.keys(baseline)])) {
    const value = held(state, key, sparsest);
    if (!deepEqual(value, held(baseline, key, sparsest))) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function initialState(registry: Registry, language: string = DEFAULT_LANGUAGE): GameState {
  const state = createGameState('', language);
  const starting = startingLocationId(registry);
  if (starting) state.location = starting;
  initResources(state, registry);
  return state;
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

function activeActionProblem(localizer: Localizer, state: GameState, registry: Registry): Localized | null {
  const active = state.activeAction;
  if (!active) return null;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  if (obj === 'travel') {
    const [origin, dest] = objId.split(TRAVEL_PAIR);
    const stale = travelEndProblem(localizer, origin ?? '', dest ?? '', registry);
    if (stale) return stale;
  }
  const owner = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  if (!owner) return localizer.engine('engine.action.stale.owner', { kind: localizer.identifier(obj), id: localizer.identifier(objId) });
  if (!owner.actions?.some((action) => actionAddress(action) === active.actionSlug)) return localizer.engine('engine.action.stale.action', { action: localizer.identifier(active.actionSlug), owner: localizer.identifier(active.ownerRef) });

  for (const actorId of Object.keys(active.actors ?? {})) if (!registry.entities.has(templateOf(actorId))) return localizer.engine('engine.action.stale.actor', { actor: localizer.identifier(actorId) });
  for (const actorId of Object.keys(active.cadences)) if (actorId !== PLAYER && !registry.entities.has(templateOf(actorId))) return localizer.engine('engine.action.stale.cadence', { actor: localizer.identifier(actorId) });
  for (const actor of Object.values(active.actors ?? {})) {
    for (const resourceId of Object.keys(actor.resources)) if (!registry.resources.has(resourceId)) return localizer.engine('engine.action.stale.resource', { resource: localizer.identifier(resourceId) });
  }
  return null;
}

export function pruneStateForRegistry(state: GameState, registry: Registry): PruneWarning[] {
  const warnings: PruneWarning[] = [];
  const localizer = localizerOf(registry, state);
  const named = localizer.identifier;

  warnings.push(...pruneInstances(state, registry));
  warnings.push(...prunePopulations(state, registry));

  state.packOrder = state.packOrder.filter((key) => registry.items.has(key) || key in state.instances.byId);

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

  warnings.push(...pruneBuffs(state, registry, (actorId) => actorId === PLAYER || registry.entities.has(templateOf(actorId))));

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
    addWarning(warnings, `modals.${name}`, name, localizer.engine('engine.prune.modal', { modal: localizer.minted(name), reason }));
  }

  const journey = state.journey;
  if (journey) {
    const lost = [journey.to, ...journey.legs].find((place) => !registry.locations.has(place));
    if (lost !== undefined) {
      state.journey = null;
      addWarning(warnings, 'journey', journey.to, localizer.engine('engine.prune.journey', { to: named(journey.to), lost: named(lost) }));
    }
  }

  state.settings = settledSettings(state.settings, warnings, localizer);

  const race = state.player.race;
  if (race && !registry.races.has(race)) {
    state.player = { ...state.player, race: '' };
    addWarning(warnings, 'player.race', race, localizer.engine('engine.prune.race', { race: named(race) }));
  }

  const activeProblem = activeActionProblem(localizer, state, registry);
  if (activeProblem) {
    const active = state.activeAction!;
    const id = `${active.ownerRef}.${active.actionSlug}`;
    endAction(state, localizer.engine('engine.stopped.unloadable'));
    addWarning(warnings, 'activeAction', id, localizer.engine('engine.prune.action', { action: named(id), reason: activeProblem }));
  }

  return warnings;
}

function settledSettings(held: SettingSheet, warnings: PruneWarning[], localizer: Localizer): SettingSheet {
  const settled = standingSettings();
  for (const [name, value] of Object.entries(held)) {
    if (isSettingName(name) && standingChoice(name, value) !== undefined) {
      settled[name] = value;
      continue;
    }
    const shown = localizer.identifier(String(value));
    addWarning(warnings, `settings.${name}`, name, localizer.engine('engine.prune.setting', { setting: localizer.identifier(name), value: shown }));
  }
  return settled;
}

export function diffState(state: GameState, baseline: GameState): SaveDiff {
  const diff: Record<string, unknown> = {};

  for (const field of RECORD_FIELDS) {
    const recordDiff = diffRecord(field, state[field] as Record<string, unknown>, baseline[field] as Record<string, unknown>);
    if (recordDiff) diff[field] = recordDiff;
  }
  for (const field of SCALAR_FIELDS) {
    if (!deepEqual(state[field], baseline[field])) diff[field] = state[field];
  }

  return diff as SaveDiff;
}

export function serializeSave(state: GameState, registry: Registry, over: readonly string[] = []): string {
  const base = initialState(registry);
  if (over.length > 0) loadSave(base, { version: SAVE_VERSION, over: [...over], diff: {} }, registry);
  return JSON.stringify({ version: SAVE_VERSION, ...diffState(state, base) });
}

export function savedGameFromSerialized(serialized: string): ParsedSave | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { version, ...diff } = parsed as { version: number } & Record<string, unknown>;
  return { version, diff };
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

const MINTS_IDS: SaveField = 'instances';

const tableIn = (diff: Record<string, unknown>): InstanceTable | undefined => diff[MINTS_IDS] as InstanceTable | undefined;

const copyIdsIn = (diff: Record<string, unknown>): string[] => Object.keys(tableIn(diff)?.byId ?? {});

const mintsCopies = (diff: Record<string, unknown>): boolean => copyIdsIn(diff).length > 0;

const inMintedOrder = (ids: readonly string[]): string[] => [...ids].sort((a, b) => Number(a) - Number(b));

function renamedDiff(diff: Record<string, unknown>, renamed: Renaming): Record<string, unknown> {
  const out: Record<string, unknown> = { ...diff };
  for (const field of SAVE_FIELD_NAMES) {
    const { minted } = SAVE_FIELDS[field];
    if (typeof minted === 'string' || !(field in diff)) continue;
    out[field] = minted.rename(diff[field], renamed);
  }
  const table = tableIn(diff);
  if (table) {
    out[MINTS_IDS] = { next: table.next, byId: Object.fromEntries(Object.entries(table.byId).map(([id, held]) => [renamed(id), held])) };
  }
  return out;
}

function renumbered(layers: readonly SaveLayer[]): SaveLayer[] {
  if (layers.filter((layer) => mintsCopies(layer.saved.diff)).length < 2) return [...layers];
  let next = 1;
  return layers.map((layer) => {
    if (!mintsCopies(layer.saved.diff)) return layer;
    const renaming = new Map(inMintedOrder(copyIdsIn(layer.saved.diff)).map((id) => [id, String(next++)] as const));
    const renamed: Renaming = (id) => renaming.get(id) ?? id;
    return { name: layer.name, saved: { ...layer.saved, diff: renamedDiff(layer.saved.diff, renamed) } };
  });
}

function composedTable(layers: readonly SaveLayer[]): InstanceTable | undefined {
  const tables = layers.flatMap((layer) => { const table = tableIn(layer.saved.diff); return table ? [table] : []; });
  if (tables.length === 0) return undefined;
  const byId = Object.assign({}, ...tables.map((table) => table.byId)) as InstanceTable['byId'];
  return { next: Math.max(...tables.map((table) => table.next), ...Object.keys(byId).map((id) => Number(id) + 1)), byId };
}

const OWN_BODY = 'its own body';

interface SaveLayer {
  name: string;
  saved: ParsedSave;
}

function layersOf(saved: ParsedSave, registry: Registry, name: string, under: readonly string[]): SaveLayer[] {
  const layers: SaveLayer[] = [];
  for (const id of saved.over ?? []) {
    if (under.includes(id)) throw new RuntimeError(`save ${id} is written over itself: ${[...under, id].join(' over ')}`);
    const beneath = registry.saves.get(id);
    if (!beneath) throw new RuntimeError(`${name} is written over ${id}, which nothing declares`);
    layers.push(...layersOf(beneath, registry, id, [...under, id]));
  }
  layers.push({ name, saved });
  return layers;
}

function composedDiff(under: readonly SaveLayer[]): Record<string, unknown> {
  const layers = renumbered(under);
  const diff: Record<string, unknown> = {};
  for (const field of RECORD_FIELDS) {
    const written = layers.flatMap((layer) => (field in layer.saved.diff ? [layer.saved.diff[field] as object] : []));
    if (written.length > 0) diff[field] = Object.assign({}, ...written);
  }
  for (const field of SCALAR_FIELDS) {
    for (const layer of layers) if (field in layer.saved.diff) diff[field] = layer.saved.diff[field];
  }
  const table = composedTable(layers);
  if (table) diff[MINTS_IDS] = table;
  return diff;
}

function resolveSave(saved: ParsedSave, registry: Registry, name = OWN_BODY): ParsedSave {
  const layers = layersOf(saved, registry, name, [name]);
  for (const layer of layers) checkSave(layer.saved);
  return layers.length === 1 ? saved : { version: saved.version, diff: composedDiff(layers) };
}

function pruned(state: GameState, registry: Registry): PruneWarning[] {
  try {
    return pruneStateForRegistry(state, registry);
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError(`this save cannot be loaded: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadSave(state: GameState, saved: ParsedSave, registry: Registry): PruneWarning[] {
  const base = initialState(registry);
  const diff = structuredClone(resolveSave(saved, registry).diff);
  const target = state as unknown as Record<string, unknown>;
  const baseline = base as unknown as Record<string, unknown>;

  for (const field of RECORD_FIELDS) {
    target[field] = { ...(baseline[field] as object), ...(diff[field] as object) };
  }
  for (const field of SCALAR_FIELDS) {
    if (field in diff) target[field] = diff[field];
    else if (field in baseline) target[field] = baseline[field];
    else delete target[field];
  }
  state.log = base.log;
  state.endedBecause = base.endedBecause;
  state.carriedTold = heldSignature(state);
  return pruned(state, registry);
}

function describeValue(value: unknown): string {
  return value === undefined ? '(absent)' : JSON.stringify(value);
}

export function compareSave(state: GameState, saved: ParsedSave, registry: Registry): string[] {
  const current = diffState(state, initialState(registry));
  const expected = resolveSave(saved, registry).diff;
  const diffs: string[] = [];

  for (const field of RECORD_FIELDS) {
    if (!WALKED_FIELDS.has(field)) continue;
    const { sparsest } = SAVE_FIELDS[field];
    const a = (current[field] ?? {}) as Record<string, unknown>;
    const b = (expected[field] ?? {}) as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!deepEqual(held(a, key, sparsest), held(b, key, sparsest))) diffs.push(`${field}.${key}: ${describeValue(a[key])} vs ${describeValue(b[key])}`);
    }
  }

  for (const field of SCALAR_FIELDS) {
    if (!WALKED_FIELDS.has(field)) continue;
    if (!deepEqual(current[field], expected[field])) diffs.push(`${field}: ${describeValue(current[field])} vs ${describeValue(expected[field])}`);
  }

  return diffs;
}

export function compareSaveOnly(state: GameState, saved: ParsedSave, registry: Registry): string[] {
  const expected = resolveSave(saved, registry).diff;
  const diffs: string[] = [];

  for (const field of RECORD_FIELDS) {
    if (!WALKED_FIELDS.has(field)) continue;
    const declared = expected[field] as Record<string, unknown> | undefined;
    if (!declared) continue;
    const live = state[field] as unknown as Record<string, unknown>;
    for (const key of Object.keys(declared)) {
      const value = live[key] ?? SAVE_FIELDS[field].sparsest;
      if (!deepEqual(value, declared[key])) diffs.push(`${field}.${key}: ${describeValue(value)} vs ${describeValue(declared[key])}`);
    }
  }

  for (const field of SCALAR_FIELDS) {
    if (!WALKED_FIELDS.has(field) || !(field in expected)) continue;
    const value = state[field];
    if (!deepEqual(value, expected[field])) diffs.push(`${field}: ${describeValue(value)} vs ${describeValue(expected[field])}`);
  }

  return diffs;
}
