import { Action } from '../content/entity';
import { Location } from '../content/location';
import {
  actionFirstUnit, actionVisible, armAction, armCraft, armTravel, craft, craftFirstUnit, describeCondition, DialogueSession, encounterView, EncounterView, endAction, evaluateCondition, GameState, RuntimeError, choose, createGameState, initResources, recipeCraftable, renderSegments, requiresMet, resolve, statValue, talk, travelFirstUnit, useAction, useTravel } from './runtime';
import { Registry } from '../content/registry';
import { ResourceDisplay } from '../content/resource';
import { compareSave, loadSave, startingLocationId } from './save';
import { Directive } from '../content/test';
import { humanize } from '../grammar/values';

export type PlayChoiceKind = 'talk' | 'action' | 'travel' | 'dialogue' | 'craft';

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
  }
}

export function startSession(registry: Registry, state: GameState = createGameState()): PlaySession {
  if (!state.location) {
    const starting = startingLocationId(registry);
    if (starting) state.location = starting;
  }
  initResources(state, registry);
  return { registry, state, dialogue: null, logCursor: state.log.length };
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

  const said = state.log.slice(session.logCursor);
  session.logCursor = state.log.length;

  return {
    location: { id: location.id, title: location.title, description: location.examine ?? '' },
    entities,
    inDialogue: session.dialogue !== null && session.dialogue.choices !== null,
    said,
    choices: computeChoices(session),
    time: state.time,
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
    current: state.resources[resource.id] ?? 0,
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
export function beginAction(session: PlaySession, choiceId: string): PlayView {
  const choice = computeChoices(session).find((c) => c.id === choiceId);
  if (!choice) throw new RuntimeError(`unavailable choice: ${JSON.stringify(choiceId)}`);
  const directive = choiceToDirective(choice);
  const { registry, state } = session;

  if (directive.kind === 'craft' && craftFirstUnit(directive.recipe, registry, state) > 0) {
    armCraft(directive.recipe, registry, state);
    return view(session);
  }
  if (directive.kind === 'use' && actionFirstUnit(directive.obj, directive.objId, directive.actionId, registry, state) > 0) {
    // armAction has already logged a take-gate failure and left activeAction unset.
    armAction(directive.obj, directive.objId, directive.actionId, registry, state);
    return view(session);
  }
  if (directive.kind === 'travel' && travelFirstUnit(state.location, directive.location, registry, state) > 0) {
    armTravel(state.location, directive.location, registry, state);
    return view(session);
  }

  applyDirective(session, directive);
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
      loadSave(state, saved, registry);
      session.dialogue = null;
      session.logCursor = state.log.length;
      return {};
    }
    case 'cancel':
      // View-free because a test's state may have no resolvable location.
      endAction(state);
      return {};
    case 'wait':
      resolve(state, registry, state.time + directive.seconds);
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
