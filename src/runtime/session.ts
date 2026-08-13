import { Action } from '../content/entity';
import { DISCOVERED, Location } from '../content/location';
import {
  actionFirstUnit, actionVisible, ArmResult, armAction, armCraft, armFightAction, armJourney, craft, describeCondition, encounterView, EncounterView, equip, evaluateCondition, GameState, RuntimeError, initResources, recipeCraftable, requiresMet, resolve, statValue, talk, unequip, useAction, useFight, walkTo } from './runtime';
import { endJourney } from './state';
import { allocate, carriedItems, feedItem, Growth, grownItems, itemTemplate, slotJewel } from './itemInstance';
import { planeReports, type PlaneReport } from './planeReport';
import { applyClusterEffect } from './clusterEffect';
import { parseOwnerRef } from './actions';
import { spreadDiscovery } from './effects';
import { reachable, type Journey } from './journey';
import { armedAction, hasPool, playerCadence } from './encounter';
import { declaredId } from '../content/entity';
import { isTwoSided } from '../grammar/action';
import { standing } from './population';
import { truthy } from './conditions';
import { answerModal, dialogueFrame, Modal, openModal, openModalNamed, pruneModals, publishModal, topModal } from './modals';
import { carriedEntries, type CarriedEntry } from './carriedScreen';
import { Registry } from '../content/registry';
import { ResourceDisplay } from '../content/resource';
import { compareSave, initialState, loadSave, pruneStateForRegistry, serializeSave } from './save';
import { Directive, GrowthDirective } from '../content/test';
import { printDirective } from '../content/serialize';
import { humanize } from '../grammar/values';
import { fromMilliUnits, msToSeconds, secondsToMs } from './units';

export type PlayChoiceKind = 'talk' | 'action' | 'travel' | 'craft' | 'equip' | 'unequip';

export interface PlayChoice {
  id: string;
  kind: PlayChoiceKind;
  label: string;
  detail?: string;
  // Where taking it puts the player, when taking it does nothing else. A map
  // needs to know which of the offers on the table is the way to a place, and
  // an entity that aliases a road -- a staircase, a door -- publishes an action
  // and not a travel, so the id cannot be read for it.
  leadsTo?: string;
  // How many roads away the place it leads to is, on a travel. One is next
  // door; more is a walk the engine will queue the legs of. A driver reads it
  // to tell what belongs to the room from what belongs to the map.
  legs?: number;
}

export interface PlayAction {
  label: string;
  // Through the cycle under way, 0 to 1.
  progress: number;
  attempts: number;
  // Whittling a named pool down, rather than counting its own completions.
  targeted: boolean;
  completion: number;
}

// Everything the engine shows, as copies: a driver renders this and reaches
// past it for nothing.
export interface PlayStatus {
  location: { id: string; title: string; description: string };
  entities: Array<{ id: string; title: string; examine?: string }>;
  choices: PlayChoice[];
  time: number;
  resources: Array<{ id: string; title: string; current: number; max: number; display: ResourceDisplay }>;
  encounter: EncounterView | null;
  // Bottom of the stack first, so the last one is the one being answered.
  modals: Modal[];
  inventory: Record<string, number>;
  // Grown copies the player carries, by the instance id each is named by. They
  // are counted nowhere in `inventory`, so a surface listing what the player has
  // reads both records.
  grown: Record<string, string>;
  // One per grown copy, in the order `grown` names them: the plane behind the
  // id, already scaled, for a surface that shows one rather than a stat it
  // arrived in.
  planes: PlaneReport[];
  equipment: Record<string, string>;
  xp: Record<string, number>;
  stats: Record<string, number>;
  flags: Record<string, boolean | number>;
  discovered: Array<{ id: string; title: string; x: number; y: number; z: number; adjacent: Array<{ to: string; open: boolean }> }>;
  // The walk under way: where it is going and which places it has still to
  // cross, in the order it will cross them. A driver lights the route up off
  // this rather than working the route out for itself.
  journey: Journey | null;
  player: { name: string; race: string };
  action: PlayAction | null;
}

export interface PlayView extends PlayStatus {
  said: string[];
}

// A driver reads the registry — it is content, and content is a layer below.
// Assigning one is a different act: the state left behind refers to what the
// old registry had, which is why adoptRegistry and not a field.
export interface PlaySession {
  readonly registry: Registry;
}

// The three things that only ever move together. The handle carries no key to
// enumerate and this map is not exported, so it is the whole route in. A symbol
// member was tried first and came straight back out of getOwnPropertySymbols.
interface SessionInternals {
  registry: Registry;
  state: GameState;
  logCursor: number;
}

const INTERNALS = new WeakMap<PlaySession, SessionInternals>();

function own(session: PlaySession): SessionInternals {
  const internals = INTERNALS.get(session);
  if (!internals) throw new RuntimeError('this is not a session startSession handed out, so it plays nothing');
  return internals;
}

function stateOf(session: PlaySession): GameState {
  return own(session).state;
}

function sessionOver(registry: Registry, state: GameState): PlaySession {
  const internals: SessionInternals = { registry, state, logCursor: state.log.length };
  const session: PlaySession = { get registry() { return internals.registry; } };
  INTERNALS.set(session, internals);
  return session;
}

type Actable = { actions?: Action[] };

// A two-sided action is brought by whoever swings, so it is never offered by the
// object it is written under; the player performs its own copy from `uses:`.
function actionAvailable(action: Action, state: GameState): boolean {
  if (isTwoSided(action)) return false;
  return requiresMet(action, state) && actionVisible(action, state);
}

function availableActions(owner: Actable, state: GameState): Action[] {
  return (owner.actions ?? []).filter((action) => actionAvailable(action, state));
}

// Where pure movement — results only relocate — would put the player, which is
// what makes an action an alias for a road rather than a thing done in a room.
function movesTo(action: Action): string | undefined {
  const onlyMovement = action.results.every((r) => r.kind === 'relocate' || r.kind === 'say');
  const noBranches = !action.onSuccess && !action.onFailure && !action.onUnfinished;
  if (!onlyMovement || !noBranches) return undefined;
  const relocate = action.results.find((r) => r.kind === 'relocate');
  return relocate?.kind === 'relocate' ? relocate.location : undefined;
}

function isFreeTravelAction(action: Action, target: string): boolean {
  return movesTo(action) === target;
}

function entityAliasesTravelTo(location: Location, target: string, registry: Registry, state: GameState): boolean {
  return standingHere(registry, state, location).some((entityId) => {
    const entity = registry.entities.get(entityId);
    if (!entity) return false;
    return availableActions(entity, state).some((action) => isFreeTravelAction(action, target));
  });
}

// One id per type with a copy still standing. A count is the place's fact, and
// nothing addresses one copy of it.
const standingHere = (registry: Registry, state: GameState, location: Location): string[] => standing(state, registry, location).map((entry) => entry.entity);

// What makes a target valid is the pool the performer's action names, and
// nothing on the target: there is no list of permitted types anywhere.
function fightChoices(registry: Registry, state: GameState, location: Location): PlayChoice[] {
  const choices: PlayChoice[] = [];
  const player = registry.player;
  if (!player) return choices;
  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (!entity) continue;
    for (const action of player.actions) {
      const id = declaredId(action);
      if (id === undefined || !isTwoSided(action) || !action.depletes) continue;
      if (!requiresMet(action, state) || !actionVisible(action, state)) continue;
      if (action.depletes.side === 'their' && !hasPool(state, registry, entityId, action.depletes.id)) continue;
      choices.push({ id: `fight:${id}:${entityId}`, kind: 'action', label: action.label, detail: entity.title });
    }
  }
  return choices;
}

function canTalk(entityId: string, registry: Registry, state: GameState): boolean {
  const dialogue = registry.dialoguesByOwner.get(entityId);
  if (!dialogue) return false;
  return dialogue.nodes.some((node) => node.when && evaluateCondition(node.when, state));
}

function locationChoices(session: PlaySession): PlayChoice[] {
  const { registry } = session;
  const state = stateOf(session);
  const location = registry.locations.get(state.location);
  if (!location) return [];
  const choices: PlayChoice[] = [];

  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (!entity) continue;
    if (canTalk(entityId, registry, state)) {
      choices.push({ id: `talk:${entityId}`, kind: 'talk', label: `Talk to ${entity.title}` });
    }
    for (const action of availableActions(entity, state)) {
      choices.push({ id: `use:entity.${entityId}.${action.label}`, kind: 'action', label: action.label, detail: entity.title, leadsTo: movesTo(action) });
    }
  }

  choices.push(...fightChoices(registry, state, location));

  for (const action of availableActions(location, state)) {
    choices.push({ id: `use:location.${location.id}.${action.label}`, kind: 'action', label: action.label, detail: location.title });
  }

  // Item actions are offered per item the player carries, however the copies are
  // spelled; equipping is offered per copy, and a stack the player has emptied
  // by growing its last copy is not one of them.
  for (const [itemId, { stack }] of carriedItems(state)) {
    const item = registry.items.get(itemId);
    if (!item) continue;
    for (const action of availableActions(item, state)) {
      choices.push({ id: `use:item.${itemId}.${action.label}`, kind: 'action', label: action.label, detail: item.title });
    }
    if (item.slot && stack > 0 && state.equipped[item.slot] !== itemId) {
      choices.push({ id: `equip:${itemId}`, kind: 'equip', label: `Equip ${item.title}`, detail: item.slot });
    }
  }

  // A grown copy is named by its instance id in the choice as well as in the
  // slot, because a player holding both it and its stack has to be able to say
  // which one they mean.
  for (const [grownId, template] of Object.entries(grownItems(state))) {
    const item = registry.items.get(template);
    if (!item?.slot || state.equipped[item.slot] === grownId) continue;
    choices.push({ id: `equip:${grownId}`, kind: 'equip', label: `Equip ${item.title} #${grownId}`, detail: item.slot });
  }

  for (const [slot, wornId] of Object.entries(state.equipped)) {
    const item = registry.items.get(itemTemplate(state, wornId));
    choices.push({ id: `unequip:${slot}`, kind: 'unequip', label: `Unequip ${item?.title ?? slot}`, detail: slot });
  }

    // TODO(inventory-crafting): stationless recipes clutter the room list. See backlog.
  for (const recipe of registry.recipes.values()) {
    if (!recipeCraftable(recipe, registry, state)) continue;
    const detail = recipe.requiresCapability
      ? (standingHere(registry, state, location).map((entityId) => registry.entities.get(entityId)).find((entity) => entity?.capabilities.includes(recipe.requiresCapability!))?.title ?? humanize(recipe.requiresCapability))
      : undefined;
    choices.push({ id: `craft:${recipe.id}`, kind: 'craft', label: `Craft ${humanize(recipe.id)}`, detail });
  }

  for (const edge of location.adjacent) {
    if (edge.condition && !evaluateCondition(edge.condition, state)) continue;
    // Both are the same move, so showing the edge as well duplicates the option.
    if (entityAliasesTravelTo(location, edge.target, registry, state)) continue;
    const target = registry.locations.get(edge.target);
    choices.push({ id: `travel:${edge.target}`, kind: 'travel', label: `Travel to ${target?.title ?? edge.target}`, leadsTo: edge.target, legs: 1 });
  }

  return choices;
}

// Everywhere else the roads reach, offered on the same terms as next door: the
// engine finds the route and walks the legs, so setting off for the far side of
// the island is one choice and not a driver's queue of them. Listed after the
// room's own offers, because what is in reach of a hand comes before what is a
// walk away.
function journeyChoices(session: PlaySession, local: PlayChoice[]): PlayChoice[] {
  const { registry } = session;
  const state = stateOf(session);
  const already = new Set(local.flatMap((choice) => (choice.leadsTo === undefined ? [] : [choice.leadsTo])));
  const choices: PlayChoice[] = [];

  for (const [target, legs] of reachable(state.location, registry, state)) {
    if (already.has(target)) continue;
    const place = registry.locations.get(target);
    choices.push({ id: `travel:${target}`, kind: 'travel', label: `Travel to ${place?.title ?? target}`, leadsTo: target, legs });
  }

  return choices;
}

// A modal sits atop the world, so what the world offers is withdrawn until it
// is answered; the modal publishes its own options through `view`.
function computeChoices(session: PlaySession): PlayChoice[] {
  if (stateOf(session).modals.length > 0) return [];
  const local = locationChoices(session);
  return [...local, ...journeyChoices(session, local)];
}

// The single converter, so there is no second switch over choice kinds.
export function choiceToDirective(choice: PlayChoice): Directive {
  switch (choice.kind) {
    case 'talk':
      return { kind: 'talk', entity: choice.id.slice('talk:'.length) };
    case 'action': {
      const fight = /^fight:([a-z0-9.-]+):([a-z0-9.-]+)$/.exec(choice.id);
      if (fight) return { kind: 'use-on', action: fight[1], target: fight[2] };
      // The objId is namespaced, so it carries dots of its own; the greedy match
      // hands the last one to the action label.
      const match = /^use:([a-z]+)\.([a-z0-9.-]+)\.(.+)$/.exec(choice.id);
      if (!match) throw new RuntimeError(`malformed action choice id: ${choice.id}`);
      const [, obj, objId, actionId] = match;
      return { kind: 'use', obj, objId, actionId };
    }
    case 'travel':
      return { kind: 'travel', location: choice.id.slice('travel:'.length) };
    case 'craft':
      return { kind: 'craft', recipe: choice.id.slice('craft:'.length) };
    case 'equip':
      return { kind: 'equip', item: choice.id.slice('equip:'.length) };
    case 'unequip':
      return { kind: 'unequip', slot: choice.id.slice('unequip:'.length) };
  }
}

export function startSession(registry: Registry): PlaySession {
  const state = initialState(registry);
  // Said here rather than at the first `view()`, where it surfaced as
  // "unknown location: " and named nothing an author could act on.
  if (!state.location) throw new RuntimeError('no # location is marked starting, so a new game has nowhere to begin');
  spreadDiscovery(state, registry);
  return sessionOver(registry, state);
}

// Content changed under a live session: what no longer resolves is dropped and
// said, and pools are re-read against the registry that replaced it.
export function adoptRegistry(session: PlaySession, registry: Registry): void {
  const internals = own(session);
  const { state } = internals;
  internals.registry = registry;
  const warnings = pruneStateForRegistry(state, registry);
  for (const warning of warnings) state.log.push(warning.message);
  internals.logCursor = Math.max(0, state.log.length - warnings.length);
  initResources(state, registry);
  // The roads may have moved: an edge the old registry did not have is a place
  // the player can now walk to.
  spreadDiscovery(state, registry);
}

export function serializeSession(session: PlaySession): string {
  return serializeSave(stateOf(session), session.registry);
}

export const SAID_HEAD_KEPT = 40;
export const SAID_TAIL_KEPT = 40;

function elideMiddle(said: string[]): string[] {
  const dropped = said.length - SAID_HEAD_KEPT - SAID_TAIL_KEPT;
  if (dropped <= 0) return said;
  return [...said.slice(0, SAID_HEAD_KEPT), `… ${dropped} more lines`, ...said.slice(said.length - SAID_TAIL_KEPT)];
}

export function view(session: PlaySession): PlayView {
  const status = sessionStatus(session);
  const internals = own(session);

  // Spliced, not sliced-then-cleared: reading the lines is what removes them,
  // so a session that idles forever cannot grow a log nobody drains.
  const drained = internals.state.log.splice(0);
  const said = elideMiddle(drained.slice(internals.logCursor));
  internals.logCursor = 0;

  return { ...status, said };
}

// Side-effect-free, so a driver can re-read the world without consuming the
// lines `view` hands back once.
export function sessionStatus(session: PlaySession): PlayStatus {
  const { registry } = session;
  const state = stateOf(session);
  const location = registry.locations.get(state.location);
  if (!location) throw new RuntimeError(`unknown location: ${state.location}`);

  const entities: PlayStatus['entities'] = [];
  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (entity) entities.push({ id: entity.id, title: entity.title, examine: entity.examine });
  }

  return {
    location: { id: location.id, title: location.title, description: location.examine ?? '' },
    entities,
    choices: computeChoices(session),
    time: msToSeconds(state.time),
    resources: publishResources(state, registry),
    encounter: encounterView(state, registry),
    modals: state.modals.map((frame) => publishModal(frame, state, registry)),
    inventory: Object.fromEntries([...carriedItems(state)].flatMap(([id, { stack }]) => (stack > 0 ? [[id, stack] as const] : []))),
    grown: grownItems(state),
    planes: planeReports(registry, state),
    equipment: { ...state.equipped },
    xp: { ...state.xp },
    stats: Object.fromEntries([...registry.stats.values()].map((stat) => [stat.id, statValue(stat.id, state, registry)])),
    flags: { ...state.flags },
    discovered: publishDiscovered(state, registry),
    journey: state.journey ? { to: state.journey.to, legs: [...state.journey.legs] } : null,
    player: { ...state.player },
    action: publishAction(state, registry),
  };
}

// What the inventory screen lists, for a driver that holds an id and needs the
// value that screen publishes it as.
export function carriedListing(session: PlaySession): CarriedEntry[] {
  return carriedEntries(stateOf(session), session.registry);
}

// The map, as far as the player has found it. Adjacency is kept to places that
// are themselves discovered, so the shape of what has not been found yet is not
// readable off the edges leading to it. A condition on an edge gates travelling
// it, not knowing the road is there, so a shut way is still drawn.
function publishDiscovered(state: GameState, registry: Registry): PlayStatus['discovered'] {
  const found = [...registry.locations.values()].filter((each) => truthy(state.flags[`${each.id}.${DISCOVERED}`]));
  const known = new Set(found.map((each) => each.id));
  return found.map((each) => ({
    id: each.id,
    title: each.title,
    x: each.x,
    y: each.y,
    z: each.z,
    // A road the player cannot walk today is still a road they know about, so a
    // shut way is published rather than withheld and says that it is shut.
    adjacent: each.adjacent
      .filter((edge) => known.has(edge.target))
      .map((edge) => ({ to: edge.target, open: !edge.condition || evaluateCondition(edge.condition, state) })),
  }));
}

function publishResources(state: GameState, registry: Registry): PlayStatus['resources'] {
  return [...registry.resources.values()].map((resource) => ({
    id: resource.id,
    title: resource.title,
    current: fromMilliUnits(state.resources[resource.id] ?? 0),
    max: statValue(resource.max, state, registry),
    display: resource.display,
  }));
}

function publishAction(state: GameState, registry: Registry): PlayAction | null {
  const active = state.activeAction;
  if (!active) return null;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  const cycle = actionFirstUnit(obj, objId, active.actionLabel, registry, state);
  const clock = playerCadence(active);
  return {
    label: active.actionLabel,
    progress: cycle > 0 ? Math.min(1, Math.max(0, clock.progress / cycle)) : 1,
    attempts: clock.attemptsMade,
    targeted: Boolean(armedAction(state, registry).depletes),
    completion: fromMilliUnits(active.implicitTarget),
  };
}

export function apply(session: PlaySession, choiceId: string): PlayView {
  const choice = computeChoices(session).find((c) => c.id === choiceId);
  if (!choice) throw new RuntimeError(`unavailable choice: ${JSON.stringify(choiceId)}`);
  applyDirective(session, choiceToDirective(choice));
  return view(session);
}

// ARMS a spannable action instead of resolving its first unit; everything else
// takes the instant path. Nothing done on completion may live in useAction.
// Null for a directive there is nothing to arm: a journey from an unset origin
// is a placement, and everything else here is applied rather than begun.
function arm(directive: Directive, registry: Registry, state: GameState): ArmResult | null {
  switch (directive.kind) {
    case 'craft':
      return armCraft(directive.recipe, registry, state);
    case 'use':
      return armAction(directive.obj, directive.objId, directive.actionId, registry, state);
    case 'use-on':
      return armFightAction(directive.action, directive.target, registry, state);
    case 'travel':
      return state.location ? armJourney(directive.location, registry, state) : null;
    default:
      return null;
  }
}

export function beginAction(session: PlaySession, choiceId: string): PlayView {
  const choice = computeChoices(session).find((c) => c.id === choiceId);
  if (!choice) throw new RuntimeError(`unavailable choice: ${JSON.stringify(choiceId)}`);
  const directive = choiceToDirective(choice);
  const { registry } = session;
  const state = stateOf(session);

  // Arm, then route on what arming returned. Probing first asked for a quantity
  // computed against the state before arming, and arming can move what it
  // measures — the same bug class as a food buff read on either side of it.
  const armed = arm(directive, registry, state);
  if (armed === null) {
    applyDirective(session, directive);
    return view(session);
  }
  // armAction has already logged a take-gate failure and left activeAction
  // unset; an instant action has nothing to wait for, so beginning it is doing
  // it, which is what useAction does with a zero first unit.
  if (armed.armed && armed.firstUnit === 0) resolve(state, registry, state.time);
  return view(session);
}

// The view-returning face of the mutation applyDirective performs, so the
// semantics live in one place.
export function wait(session: PlaySession, seconds: number): PlayView {
  applyDirective(session, { kind: 'wait', seconds });
  return view(session);
}

// Completed units stay applied, the current attempt is discarded with no partial
// credit, and sim-time is not rewound.
export function cancelAction(session: PlaySession): PlayView {
  applyDirective(session, { kind: 'cancel' });
  return view(session);
}

// Answers by option key, so a driver that has never heard of the modal it is
// answering can still answer it. One pair or the whole form, either way.
export function submitModal(session: PlaySession, answers: Record<string, string>): PlayView {
  answerModal(stateOf(session), session.registry, answers);
  pruneModals(stateOf(session), session.registry);
  return view(session);
}

function choiceIdFor(inner: Extract<Directive, { kind: 'use' | 'use-on' | 'travel' | 'craft' }>): string {
  switch (inner.kind) {
    case 'use':
      return `use:${inner.obj}.${inner.objId}.${inner.actionId}`;
    case 'use-on':
      return `fight:${inner.action}:${inner.target}`;
    case 'travel':
      return `travel:${inner.location}`;
    case 'craft':
      return `craft:${inner.recipe}`;
  }
}

// A move of the world can leave a frame standing that no answer takes down, so
// every entry point that moves it settles the stack before a driver reads it.
// This is that seam and `submitModal` is the other; nothing else here mutates
// with a modal up, because a modal withdraws the choices the rest work from.
export function applyDirective(session: PlaySession, directive: Directive): { failure?: string } {
  const outcome = performDirective(session, directive);
  pruneModals(stateOf(session), session.registry);
  return outcome;
}

// `run:` is excluded: it recurses into another test, which only runTest can do
// with its cyclic-run detection.
function performDirective(session: PlaySession, directive: Directive): { failure?: string } {
  const { registry } = session;
  const state = stateOf(session);

  switch (directive.kind) {
    case 'run':
      throw new RuntimeError('run: is handled by runTest, not applyDirective');
    case 'talk': {
      const cursor = talk(directive.entity, registry, state);
      if (cursor) openModal(state, dialogueFrame(cursor));
      return {};
    }
    // The dialogue-facing spelling of `submit-modal:`, kept because that is how
    // every authored menu answer already reads; one implementation under both.
    case 'choose': {
      if (topModal(state)?.name !== 'dialogue') throw new RuntimeError('choose with no active dialogue');
      answerModal(state, registry, { choice: directive.text });
      return {};
    }
    case 'open-modal':
      openModalNamed(state, directive.modal);
      return {};
    case 'submit-modal':
      answerModal(state, registry, { [directive.key]: directive.value });
      return {};
    case 'use':
      useAction(directive.obj, directive.objId, directive.actionId, registry, state);
      return {};
    case 'use-on':
      useFight(directive.action, directive.target, registry, state);
      return {};
    case 'travel': {
      const refused = walkTo(directive.location, registry, state);
      return refused ? { failure: refused } : {};
    }
    case 'craft':
      craft(directive.recipe, registry, state);
      return {};
    case 'begin':
      beginAction(session, choiceIdFor(directive.inner));
      return {};
    case 'assert':
      if (!evaluateCondition(directive.condition, state)) return { failure: describeCondition(directive.condition) };
      return {};
    case 'expect': {
      const saved = registry.saves.get(directive.save);
      if (!saved) throw new RuntimeError(`unknown save: ${directive.save}`);
      const diffs = compareSave(state, saved, registry);
      if (diffs.length > 0) return { failure: `save mismatch ${directive.save}: ${diffs.join('; ')}` };
      return {};
    }
    case 'load': {
      const saved = registry.saves.get(directive.save);
      if (!saved) throw new RuntimeError(`unknown save: ${directive.save}`);
      const warnings = loadSave(state, saved, registry);
      // A save replaces the location and every flag at once, which is both of
      // discovery's inputs arriving without passing through a result.
      spreadDiscovery(state, registry);
      own(session).logCursor = Math.max(0, state.log.length - warnings.length);
      return {};
    }
    case 'cancel':
      // View-free because a test's state may have no resolvable location. The
      // walk goes with the leg: stopping is stopping, not pausing.
      endJourney(state);
      return {};
    case 'wait':
      resolve(state, registry, state.time + secondsToMs(directive.seconds));
      return {};
    case 'equip':
      equip(state, registry, directive.item);
      return {};
    case 'unequip':
      unequip(state, directive.slot);
      return {};
    case 'feed':
    case 'slot':
    case 'allocate':
    case 'apply':
      return grew(state, grow(state, registry, directive));
    case 'refuse': {
      const growth = grow(state, registry, directive.inner);
      grew(state, growth);
      return growth.ok ? { failure: `${printDirective(directive.inner)} was not refused` } : {};
    }
  }
}

// Every rule and every refusal is inside these four; what is here is which one
// the verb names and what it is handed, and a check appearing beside it would
// be a check the plane could not enforce for a caller that is not a directive.
function grow(state: GameState, registry: Registry, directive: GrowthDirective): Growth {
  switch (directive.kind) {
    case 'feed':
      return feedItem(state, registry, directive.target, directive.food);
    case 'slot':
      return slotJewel(state, registry, directive.target, directive.jewel, directive.hex, directive.direction);
    case 'allocate':
      return allocate(state, registry, directive.target, directive.node);
    case 'apply':
      return applyClusterEffect(state, registry, directive.target, directive.effect, directive.hex);
  }
}

// The refusal goes both ways a refused walk's does: into the log, where a
// player reads what the world said, and back to the caller, which is how a
// test knows the outcome rather than inferring it from state that did not move.
function grew(state: GameState, growth: Growth): { failure?: string } {
  if (growth.ok) return {};
  state.log.push(growth.refused);
  return { failure: growth.refused };
}

export interface TestResult {
  passed: boolean;
  failure?: string;
}

// Its own PlaySession: startSession would set a location, breaking a test's `travel:`.
export function runTest(testId: string, registry: Registry, state: GameState, stack: readonly string[] = []): TestResult {
  if (stack.includes(testId)) throw new RuntimeError(`cyclic test run: ${[...stack, testId].join(' -> ')}`);
  const test = registry.tests.get(testId);
  if (!test) throw new RuntimeError(`unknown test: ${testId}`);

  const session = sessionOver(registry, state);

  for (const directive of test.directives) {
    if (directive.kind === 'run') {
      const result = runTest(directive.test, registry, state, [...stack, testId]);
      if (!result.passed) return result;
      continue;
    }
    const result = applyDirective(session, directive);
    if (result.failure) return { passed: false, failure: result.failure };
  }

  // Directives ran out with a screen still waiting on the player, which is a
  // route that was never walked to its end rather than one that succeeded.
  const open = topModal(state);
  if (open) return { passed: false, failure: `modal left open: ${open.name}` };

  return { passed: true };
}

// Replays a `# test` against the session in hand, which is what a driver has.
export function runSessionTest(session: PlaySession, testId: string): TestResult {
  return runTest(testId, session.registry, stateOf(session));
}
