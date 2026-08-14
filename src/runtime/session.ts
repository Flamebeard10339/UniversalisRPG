import { Action } from '../content/entity';
import { DISCOVERED, Location } from '../content/location';
import {
  actionFirstUnit, actionVisible, ArmResult, armAction, armCraft, armFightAction, armJourney, craft, describeCondition, encounterView, EncounterView, equip, evaluateCondition, GameState, RuntimeError, initResources, recipeCraftable, requiresMet, resolve, statValue, talk, unequip, useAction, useFight, walkTo } from './runtime';
import { endJourney } from './state';
import { itemCopies, Growth, grownItems } from './itemInstance';
import { grow } from './growth';
import { planeReports, type PlaneFocus, type PlaneReport } from './planeReport';
import { actionAddress } from '../content/action';
import { parseOwnerRef, TRAVEL_PAIR } from './actions';
import { spreadDiscovery } from './effects';
import { reachable, type Journey } from './journey';
import { armedAction, hasPool, playerCadence } from './encounter';
import { declaredId } from '../content/entity';
import { isTwoSided } from '../grammar/action';
import { standing } from './population';
import { truthy } from './conditions';
import { answerModal, dialogueFrame, Modal, modalFocus, openModal, openModalNamed, pruneModals, publishModal, topModal } from './modals';
import { carriedEntries, type CarriedEntry } from './carriedScreen';
import { Registry } from '../content/registry';
import { DEFAULT_LANGUAGE } from '../grammar/section';
import { ResourceDisplay } from '../content/resource';
import { compareSave, initialState, loadSave, pruneStateForRegistry, serializeSave } from './save';
import { Directive, parseUseChoiceId, useChoiceId } from '../content/test';
import { printDirective } from '../content/serialize';
import { Answer, Localized, Localizer, localizerOf } from './localized';
import { fromMilliUnits, msToSeconds, secondsToMs } from './units';
import { say } from './said';

export type PlayChoiceKind = 'talk' | 'action' | 'travel' | 'craft';

export interface PlayChoice {
  id: Answer;
  kind: PlayChoiceKind;
  label: Localized;
  detail?: Localized;
  // Where taking it puts the player, when taking it does nothing else. A map
  // needs to know which of the offers on the table is the way to a place, and
  // an entity that aliases a road -- a staircase, a door -- publishes an action
  // and not a travel, so the id cannot be read for it.
  leadsTo?: Answer;
  // How many roads away the place it leads to is, on a travel. One is next
  // door; more is a walk the engine will queue the legs of. A driver reads it
  // to tell what belongs to the room from what belongs to the map.
  legs?: number;
}

export interface PlayAction {
  label: Localized;
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
  // `description` is absent rather than empty where a place says nothing about
  // itself: there is no missing translation to report, because there is nothing
  // to translate.
  location: { id: Answer; title: Localized; description?: Localized };
  entities: Array<{ id: Answer; title: Localized; examine?: Localized }>;
  choices: PlayChoice[];
  time: number;
  resources: Array<{ id: Answer; title: Localized; current: number; max: number; display: ResourceDisplay }>;
  encounter: EncounterView | null;
  // Bottom of the stack first, so the last one is the one being answered.
  modals: Modal[];
  inventory: Record<Answer, number>;
  // Grown copies the player has, carried or worn, by the instance id each is
  // named by. They are counted nowhere in `inventory`, so a surface listing what
  // the player has reads both records.
  grown: Record<Answer, Answer>;
  // Every row a page draws, on either side of c21: named once below every
  // screen, counted, and each under the id a verb addresses it by, so a surface
  // states the engine's answer rather than reading a dictionary's keys as names
  // (c16, c18). A row worn in a slot names it; a row without one is carried, and
  // a page that lists one side filters on that rather than on a second record.
  carried: CarriedEntry[];
  // One per plane the player carries, grown copies first in the order `grown`
  // names them and then the bases still in their stacks: the plane behind the
  // id, already scaled, for a surface that shows one rather than a stat it
  // arrived in.
  planes: PlaneReport[];
  // Which of those planes is in hand and where on it, or null when none is. It
  // names a plane rather than carrying one, so a surface draws it by looking the
  // id up in `planes` and never by recognising the screen that holds it.
  focus: PlaneFocus | null;
  equipment: Record<Answer, Answer>;
  xp: Record<Answer, number>;
  stats: Record<Answer, number>;
  flags: Record<Answer, boolean | number>;
  discovered: Array<{ id: Answer; title: Localized; x: number; y: number; z: number; adjacent: Array<{ to: Answer; open: boolean }> }>;
  // The walk under way: where it is going and which places it has still to
  // cross, in the order it will cross them. A driver lights the route up off
  // this rather than working the route out for itself.
  journey: Journey | null;
  player: { name: Answer; race: Answer };
  action: PlayAction | null;
}

export interface PlayView extends PlayStatus {
  said: Localized[];
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

// The played language reaches a driver through the session it is playing, so a
// caller outside this file localizes without reaching for the state to do it.
export const sessionLocalizer = (session: PlaySession): Localizer => localizerOf(session.registry, stateOf(session));

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
  const localizer = localizerOf(registry, state);
  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (!entity) continue;
    for (const action of player.actions) {
      const id = declaredId(action);
      if (id === undefined || !isTwoSided(action) || !action.depletes) continue;
      if (!requiresMet(action, state) || !actionVisible(action, state)) continue;
      if (action.depletes.side === 'their' && !hasPool(state, registry, entityId, action.depletes.id)) continue;
      choices.push({ id: `fight:${id}:${entityId}`, kind: 'action', label: localizer.actionLabel('action', id, actionAddress(action)), detail: localizer.title('entity', entityId) });
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
  const localizer = localizerOf(registry, state);
  const choices: PlayChoice[] = [];

  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (!entity) continue;
    if (canTalk(entityId, registry, state)) {
      choices.push({ id: `talk:${entityId}`, kind: 'talk', label: localizer.engine('engine.talk.to', { entity: localizer.title('entity', entityId) }) });
    }
    for (const action of availableActions(entity, state)) {
      const slug = actionAddress(action);
      choices.push({ id: useChoiceId({ kind: 'use', obj: 'entity', objId: entityId, actionId: slug }), kind: 'action', label: localizer.actionLabel('entity', entityId, slug), detail: localizer.title('entity', entityId), leadsTo: movesTo(action) });
    }
  }

  choices.push(...fightChoices(registry, state, location));

  for (const action of availableActions(location, state)) {
    const slug = actionAddress(action);
    choices.push({ id: useChoiceId({ kind: 'use', obj: 'location', objId: location.id, actionId: slug }), kind: 'action', label: localizer.actionLabel('location', location.id, slug), detail: localizer.title('location', location.id) });
  }

  // Item actions are offered per item the player has, however the copies are
  // spelled and whichever side of c21 they are on — wearing a thing is not a way
  // to stop being able to use it. Wearing and taking off are not among them:
  // they are what a copy takes rather than what it does, and the carried-items
  // screen is where a copy is named and its verbs taken, so a room offering them
  // as well would put the same act in two places and scope to a location what an
  // item is not scoped by.
  for (const [itemId] of itemCopies(state)) {
    const item = registry.items.get(itemId);
    if (!item) continue;
    for (const action of availableActions(item, state)) {
      const slug = actionAddress(action);
      choices.push({ id: useChoiceId({ kind: 'use', obj: 'item', objId: itemId, actionId: slug }), kind: 'action', label: localizer.actionLabel('item', itemId, slug), detail: localizer.title('item', itemId) });
    }
  }

    // TODO(inventory-crafting): stationless recipes clutter the room list. See backlog.
  for (const recipe of registry.recipes.values()) {
    if (!recipeCraftable(recipe, registry, state)) continue;
    // The station is named by whoever is standing here providing it, and
    // `recipeCraftable` has already refused the recipe if nobody is.
    const station = recipe.requiresCapability
      ? standingHere(registry, state, location).find((entityId) => registry.entities.get(entityId)?.capabilities.includes(recipe.requiresCapability!))
      : undefined;
    const detail = station === undefined ? undefined : localizer.title('entity', station);
    choices.push({ id: `craft:${recipe.id}`, kind: 'craft', label: craftLabel(localizer, recipe.id), detail });
  }

  for (const edge of location.adjacent) {
    if (edge.condition && !evaluateCondition(edge.condition, state)) continue;
    // Both are the same move, so showing the edge as well duplicates the option.
    if (entityAliasesTravelTo(location, edge.target, registry, state)) continue;
    choices.push({ id: `travel:${edge.target}`, kind: 'travel', label: travelLabel(localizer, edge.target), leadsTo: edge.target, legs: 1 });
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
  const localizer = localizerOf(registry, state);
  const already = new Set(local.flatMap((choice) => (choice.leadsTo === undefined ? [] : [choice.leadsTo])));
  const choices: PlayChoice[] = [];

  for (const [target, legs] of reachable(state.location, registry, state)) {
    if (already.has(target)) continue;
    choices.push({ id: `travel:${target}`, kind: 'travel', label: travelLabel(localizer, target), leadsTo: target, legs });
  }

  return choices;
}

// The destination resolves in the language being played before it is put into
// the pattern, which is what c4's localized parameter means.
const travelLabel = (localizer: Localizer, target: string): Localized => localizer.engine('engine.travel.to', { destination: localizer.title('location', target) });

// One string, one key, wherever a craft is shown: the choice that starts it and
// the action bar that reports it read the same two entries.
const craftLabel = (localizer: Localizer, recipe: string): Localized => localizer.engine('engine.craft.label', { recipe: localizer.title('recipe', recipe) });

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
      const use = parseUseChoiceId(choice.id);
      if (!use) throw new RuntimeError(`malformed action choice id: ${choice.id}`);
      return use;
    }
    case 'travel':
      return { kind: 'travel', location: choice.id.slice('travel:'.length) };
    case 'craft':
      return { kind: 'craft', recipe: choice.id.slice('craft:'.length) };
  }
}

// The language is an input rather than a setting the engine keeps: there is no
// settings store yet, and a session that takes it is one a caller can open in
// any language without one.
export function startSession(registry: Registry, language: string = DEFAULT_LANGUAGE): PlaySession {
  const state = initialState(registry, language);
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

function elideMiddle(localizer: Localizer, said: Localized[]): Localized[] {
  const dropped = said.length - SAID_HEAD_KEPT - SAID_TAIL_KEPT;
  if (dropped <= 0) return said;
  return [...said.slice(0, SAID_HEAD_KEPT), localizer.engine('engine.said.elided', { dropped }), ...said.slice(said.length - SAID_TAIL_KEPT)];
}

export function view(session: PlaySession): PlayView {
  const status = sessionStatus(session);
  const internals = own(session);

  // Spliced, not sliced-then-cleared: reading the lines is what removes them,
  // so a session that idles forever cannot grow a log nobody drains.
  const drained = internals.state.log.splice(0);
  const said = elideMiddle(localizerOf(session.registry, internals.state), drained.slice(internals.logCursor));
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

  const localizer = localizerOf(registry, state);
  const entities: PlayStatus['entities'] = [];
  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (entity) entities.push({ id: entity.id, title: localizer.title('entity', entity.id), examine: entity.examine === undefined ? undefined : localizer.content('entity', entity.id, 'examine') });
  }

  return {
    location: { id: location.id, title: localizer.title('location', location.id), description: location.examine === undefined ? undefined : localizer.content('location', location.id, 'examine') },
    entities,
    choices: computeChoices(session),
    time: msToSeconds(state.time),
    resources: publishResources(state, registry),
    encounter: encounterView(state, registry),
    modals: state.modals.map((frame) => publishModal(frame, state, registry)),
    inventory: Object.fromEntries([...itemCopies(state)].flatMap(([id, { stack }]) => (stack > 0 ? [[id, stack] as const] : []))),
    grown: grownItems(state),
    carried: carriedEntries(state, registry),
    planes: planeReports(registry, state),
    focus: modalFocus(state),
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
  const localizer = localizerOf(registry, state);
  const found = [...registry.locations.values()].filter((each) => truthy(state.flags[`${each.id}.${DISCOVERED}`]));
  const known = new Set(found.map((each) => each.id));
  return found.map((each) => ({
    id: each.id,
    title: localizer.title('location', each.id),
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
  const localizer = localizerOf(registry, state);
  return [...registry.resources.values()].map((resource) => ({
    id: resource.id,
    title: localizer.title('resource', resource.id),
    current: fromMilliUnits(state.resources[resource.id] ?? 0),
    max: statValue(resource.max, state, registry),
    display: resource.display,
  }));
}

// A travel action is compiled per pair of places rather than declared under
// one, so there is no owner to key its display on and the engine's own pattern
// says it — the same one the choice that started the walk was labelled with.
function actionUnderWay(localizer: Localizer, obj: string, objId: string, slug: string): Localized {
  if (obj === 'travel') return travelLabel(localizer, objId.slice(objId.indexOf(TRAVEL_PAIR) + 1));
  if (obj === 'recipe') return craftLabel(localizer, objId);
  return localizer.actionLabel(obj, objId, slug);
}

function publishAction(state: GameState, registry: Registry): PlayAction | null {
  const active = state.activeAction;
  if (!active) return null;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  const cycle = actionFirstUnit(obj, objId, active.actionSlug, registry, state);
  const clock = playerCadence(active);
  const localizer = localizerOf(registry, state);
  return {
    label: actionUnderWay(localizer, obj, objId, active.actionSlug),
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
      return useChoiceId(inner);
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
      return grew(session, state, grow(state, registry, directive));
    case 'refuse': {
      const growth = grow(state, registry, directive.inner);
      grew(session, state, growth);
      return growth.ok ? { failure: `${printDirective(directive.inner)} was not refused` } : {};
    }
  }
}

// The refusal goes both ways a refused walk's does: into the log, where a
// player reads what the world said, and back to the caller, which is how a
// test knows the outcome rather than inferring it from state that did not move.
function grew(session: PlaySession, state: GameState, growth: Growth): { failure?: string } {
  if (growth.ok) return {};
  const refused = say(sessionLocalizer(session), growth.refused);
  state.log.push(refused);
  return { failure: refused };
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
