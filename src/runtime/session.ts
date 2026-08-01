import { Action } from '../content/entity';
import { Location } from '../content/location';
import {
  actionVisible, ArmResult, armAction, armCraft, armTravel, craft, describeCondition, DialogueSession, encounterView, EncounterView, endAction, equip, evaluateCondition, GameState, RuntimeError, choose, createGameState, initResources, recipeCraftable, renderSegments, requiresMet, resolve, statValue, talk, unequip, useAction, useTravel } from './runtime';
import { Registry } from '../content/registry';
import { ResourceDisplay } from '../content/resource';
import { compareSave, loadSave, startingLocationId } from './save';
import { Directive } from '../content/test';
import { humanize } from '../grammar/values';
import { fromMilliUnits, msToSeconds, secondsToMs } from './units';

export type PlayChoiceKind = 'talk' | 'action' | 'travel' | 'dialogue' | 'craft' | 'equip' | 'unequip';

export interface PlayChoice {
  id: string;
  kind: PlayChoiceKind;
  label: string;
  detail?: string;
}

export interface PlayView {
  location: { id: string; title: string; description: string };
  entities: Array<{ id: string; title: string; examine?: string }>;
  inDialogue: boolean;
  said: string[];
  choices: PlayChoice[];
  time: number;
  resources: Array<{ id: string; title: string; current: number; max: number; display: ResourceDisplay }>;
  encounter: EncounterView | null;
  pendingModal?: string;
}

export interface PlaySession {
  registry: Registry;
  state: GameState;
  dialogue: DialogueSession | null;
  logCursor: number;
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
  const { registry, state } = session;
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

function dialogueChoices(dialogueSession: DialogueSession, state: GameState): PlayChoice[] {
  const choices: PlayChoice[] = [];
  (dialogueSession.choices ?? []).forEach((choice, index) => {
    if (choice.when && !evaluateCondition(choice.when, state)) return;
    choices.push({ id: `dialogue:${index}`, kind: 'dialogue', label: renderSegments(choice.segments, state) });
  });
  return choices;
}

function computeChoices(session: PlaySession): PlayChoice[] {
  if (session.dialogue && session.dialogue.choices) return dialogueChoices(session.dialogue, session.state);
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
    case 'dialogue':
      return { kind: 'choose', text: choice.label };
    case 'equip':
      return { kind: 'equip', item: choice.id.slice('equip:'.length) };
    case 'unequip':
      return { kind: 'unequip', slot: choice.id.slice('unequip:'.length) };
  }
}

export function startSession(registry: Registry, state: GameState = createGameState()): PlaySession {
  if (!state.location) {
    const starting = startingLocationId(registry);
    // Said here rather than at the first `view()`, where it surfaced as
    // "unknown location: " and named nothing an author could act on.
    if (!starting) throw new RuntimeError('no # location is marked starting, so a new game has nowhere to begin');
    state.location = starting;
  }
  initResources(state, registry);
  return { registry, state, dialogue: null, logCursor: state.log.length };
}

export const SAID_HEAD_KEPT = 40;
export const SAID_TAIL_KEPT = 40;

function elideMiddle(said: string[]): string[] {
  const dropped = said.length - SAID_HEAD_KEPT - SAID_TAIL_KEPT;
  if (dropped <= 0) return said;
  return [...said.slice(0, SAID_HEAD_KEPT), `… ${dropped} more lines`, ...said.slice(said.length - SAID_TAIL_KEPT)];
}

export function view(session: PlaySession): PlayView {
  const { registry, state } = session;
  const location = registry.locations.get(state.location);
  if (!location) throw new RuntimeError(`unknown location: ${state.location}`);

  const entities: PlayView['entities'] = [];
  for (const entityId of location.entities) {
    const entity = registry.entities.get(entityId);
    if (entity) entities.push({ id: entity.id, title: entity.title, examine: entity.examine });
  }

  const said = elideMiddle(state.log.slice(session.logCursor));
  state.log.length = 0;
  session.logCursor = 0;

  return {
    location: { id: location.id, title: location.title, description: location.examine ?? '' },
    entities,
    inDialogue: session.dialogue !== null && session.dialogue.choices !== null,
    said,
    choices: computeChoices(session),
    time: msToSeconds(state.time),
    resources: sessionResources(session),
    encounter: encounterView(state, registry),
    pendingModal: state.pendingModal,
  };
}

// Side-effect-free, so a driver can re-read pools without consuming the log cursor.
export function sessionResources(session: PlaySession): PlayView['resources'] {
  const { registry, state } = session;
  return [...registry.resources.values()].map((resource) => ({
    id: resource.id,
    title: resource.title,
    current: fromMilliUnits(state.resources[resource.id] ?? 0),
    max: statValue(resource.max, state, registry),
    display: resource.display,
  }));
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
  const { registry, state } = session;

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

// The one place `state.player` is set; character-creation is the only modal.
export function submitModal(session: PlaySession, data: { name: string; race: string }): PlayView {
  session.state.player = { name: data.name, race: data.race };
  session.state.pendingModal = undefined;
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
  const { registry, state } = session;

  switch (directive.kind) {
    case 'run':
      throw new RuntimeError('run: is handled by runTest, not applyDirective');
    case 'talk': {
      const result = talk(directive.entity, registry, state);
      session.dialogue = result.choices ? result : null;
      return {};
    }
    case 'choose': {
      if (!session.dialogue) throw new RuntimeError('choose with no active dialogue');
      const result = choose(directive.text, session.dialogue, registry, state);
      session.dialogue = result.choices ? result : null;
      return {};
    }
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
      session.dialogue = null;
      session.logCursor = Math.max(0, state.log.length - warnings.length);
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

  const session: PlaySession = { registry, state, dialogue: null, logCursor: state.log.length };

  for (const directive of test.directives) {
    if (directive.kind === 'run') {
      const result = runTest(directive.test, registry, state, [...stack, testId]);
      if (!result.passed) return result;
      continue;
    }
    const result = applyDirective(session, directive);
    if (result.failure) return { passed: false, failure: result.failure };
  }

  return { passed: true };
}
