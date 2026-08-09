import { Action } from '../content/entity';
import { DISCOVERED, Location } from '../content/location';
import {
  actionFirstUnit, actionVisible, ArmResult, armAction, armCraft, armTravel, craft, describeCondition, encounterView, EncounterView, endAction, equip, evaluateCondition, GameState, PLAYER, RuntimeError, initResources, recipeCraftable, requiresMet, resolve, statValue, talk, unequip, useAction, useTravel } from './runtime';
import { findActiveAction, parseOwnerRef } from './actions';
import { newCadence } from './encounter';
import { truthy } from './conditions';
import { answerModal, dialogueFrame, Modal, openModal, publishModal, topModal } from './modals';
import { Registry } from '../content/registry';
import { ResourceDisplay } from '../content/resource';
import { compareSave, initialState, loadSave, pruneStateForRegistry, serializeSave } from './save';
import { Directive } from '../content/test';
import { humanize } from '../grammar/values';
import { fromMilliUnits, msToSeconds, secondsToMs } from './units';

export type PlayChoiceKind = 'talk' | 'action' | 'travel' | 'craft' | 'equip' | 'unequip';

export interface PlayChoice {
  id: string;
  kind: PlayChoiceKind;
  label: string;
  detail?: string;
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
  equipment: Record<string, string>;
  xp: Record<string, number>;
  stats: Record<string, number>;
  flags: Record<string, boolean | number>;
  discovered: string[];
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

function actionAvailable(action: Action, state: GameState): boolean {
  if (action.retaliates) return false;
  return requiresMet(action, state) && actionVisible(action, state);
}

function availableActions(owner: Actable, state: GameState): Action[] {
  return (owner.actions ?? []).filter((action) => actionAvailable(action, state));
}

// Pure movement — results only relocate — so it aliases a travel edge.
function isFreeTravelAction(action: Action, target: string): boolean {
  const relocatesToTarget = action.results.some((r) => r.kind === 'relocate' && r.location === target);
  if (!relocatesToTarget) return false;
  const onlyMovement = action.results.every((r) => r.kind === 'relocate' || r.kind === 'say');
  const noBranches = !action.onSuccess && !action.onFailure && !action.onEscape;
  return onlyMovement && noBranches;
}

function entityAliasesTravelTo(location: Location, target: string, registry: Registry, state: GameState): boolean {
  return location.entities.some((entityId) => {
    const entity = registry.entities.get(entityId);
    if (!entity) return false;
    return availableActions(entity, state).some((action) => isFreeTravelAction(action, target));
  });
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

  for (const entityId of location.entities) {
    const entity = registry.entities.get(entityId);
    if (!entity) continue;
    if (canTalk(entityId, registry, state)) {
      choices.push({ id: `talk:${entityId}`, kind: 'talk', label: `Talk to ${entity.title}` });
    }
    for (const action of availableActions(entity, state)) {
      choices.push({ id: `use:entity.${entityId}.${action.label}`, kind: 'action', label: action.label, detail: entity.title });
    }
  }

  for (const action of availableActions(location, state)) {
    choices.push({ id: `use:location.${location.id}.${action.label}`, kind: 'action', label: action.label, detail: location.title });
  }

  for (const [itemId, count] of Object.entries(state.inventory)) {
    if (count <= 0) continue;
    const item = registry.items.get(itemId);
    if (!item) continue;
    for (const action of availableActions(item, state)) {
      choices.push({ id: `use:item.${itemId}.${action.label}`, kind: 'action', label: action.label, detail: item.title });
    }
    if (item.slot && state.equipped[item.slot] !== itemId) {
      choices.push({ id: `equip:${itemId}`, kind: 'equip', label: `Equip ${item.title}`, detail: item.slot });
    }
  }

  for (const [slot, itemId] of Object.entries(state.equipped)) {
    const item = registry.items.get(itemId);
    choices.push({ id: `unequip:${slot}`, kind: 'unequip', label: `Unequip ${item?.title ?? slot}`, detail: slot });
  }

    // TODO(inventory-crafting): stationless recipes clutter the room list. See backlog.
  for (const recipe of registry.recipes.values()) {
    if (!recipeCraftable(recipe, registry, state)) continue;
    const detail = recipe.requiresCapability
      ? (location.entities.map((entityId) => registry.entities.get(entityId)).find((entity) => entity?.capabilities.includes(recipe.requiresCapability!))?.title ?? humanize(recipe.requiresCapability))
      : undefined;
    choices.push({ id: `craft:${recipe.id}`, kind: 'craft', label: `Craft ${humanize(recipe.id)}`, detail });
  }

  for (const edge of location.adjacent) {
    if (edge.condition && !evaluateCondition(edge.condition, state)) continue;
    // Both are the same move, so showing the edge as well duplicates the option.
    if (entityAliasesTravelTo(location, edge.target, registry, state)) continue;
    const target = registry.locations.get(edge.target);
    choices.push({ id: `travel:${edge.target}`, kind: 'travel', label: `Travel to ${target?.title ?? edge.target}` });
  }

  return choices;
}

// A modal sits atop the world, so what the world offers is withdrawn until it
// is answered; the modal publishes its own options through `view`.
function computeChoices(session: PlaySession): PlayChoice[] {
  if (stateOf(session).modals.length > 0) return [];
  return locationChoices(session);
}

// The single converter, so there is no second switch over choice kinds.
export function choiceToDirective(choice: PlayChoice): Directive {
  switch (choice.kind) {
    case 'talk':
      return { kind: 'talk', entity: choice.id.slice('talk:'.length) };
    case 'action': {
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
  for (const entityId of location.entities) {
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
    inventory: Object.fromEntries(Object.entries(state.inventory).filter(([, count]) => count > 0)),
    equipment: { ...state.equipped },
    xp: { ...state.xp },
    stats: Object.fromEntries([...registry.stats.values()].map((stat) => [stat.id, statValue(stat.id, state, registry)])),
    flags: { ...state.flags },
    discovered: [...registry.locations.values()].filter((each) => truthy(state.flags[`${each.id}.${DISCOVERED}`])).map((each) => each.id),
    player: { ...state.player },
    action: publishAction(state, registry),
  };
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
  // A hand-written `# save` can carry an action with no player clock, and
  // checkSave takes it. Publishing a stopped one keeps what the view did
  // before it reported the action at all: read nothing, kill nothing.
  const clock = active.cadences[PLAYER] ?? newCadence();
  return {
    label: active.actionLabel,
    progress: cycle > 0 ? Math.min(1, Math.max(0, clock.progress / cycle)) : 1,
    attempts: clock.attemptsMade,
    targeted: Boolean(findActiveAction(active, registry).target),
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
    case 'travel':
      return state.location ? armTravel(state.location, directive.location, registry, state) : null;
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
  return view(session);
}

function choiceIdFor(inner: Extract<Directive, { kind: 'use' | 'travel' | 'craft' }>): string {
  switch (inner.kind) {
    case 'use':
      return `use:${inner.obj}.${inner.objId}.${inner.actionId}`;
    case 'travel':
      return `travel:${inner.location}`;
    case 'craft':
      return `craft:${inner.recipe}`;
  }
}

// `run:` is excluded: it recurses into another test, which only runTest can do
// with its cyclic-run detection.
export function applyDirective(session: PlaySession, directive: Directive): { failure?: string } {
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
    case 'submit-modal':
      answerModal(state, registry, { [directive.key]: directive.value });
      return {};
    case 'use':
      useAction(directive.obj, directive.objId, directive.actionId, registry, state);
      return {};
    case 'travel':
      if (!registry.locations.has(directive.location)) throw new RuntimeError(`unknown location: ${directive.location}`);
      useTravel(state.location, directive.location, registry, state);
      return {};
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
      own(session).logCursor = Math.max(0, state.log.length - warnings.length);
      return {};
    }
    case 'cancel':
      // View-free because a test's state may have no resolvable location.
      endAction(state);
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
  }
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
