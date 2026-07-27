import { Action } from './entity';
import { Location } from './location';
import {
  actionFirstUnit,
  armAction,
  armCraft,
  armTravel,
  craft,
  craftFirstUnit,
  describeCondition,
  DialogueSession,
  evaluateCondition,
  GameState,
  Registry,
  RuntimeError,
  choose,
  createGameState,
  initResources,
  recipeCraftable,
  renderSegments,
  resolve,
  statValue,
  talk,
  travelFirstUnit,
  useAction,
  useTravel,
} from './runtime';
import { ResourceDisplay } from './resource';
import { compareSave, loadSave, startingLocationId } from './save';
import { Directive } from './test';
import { humanize } from './values';

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
  if (action.requires && !evaluateCondition(action.requires, state)) return false;
  if (action.hiddenIf && evaluateCondition(action.hiddenIf, state)) return false;
  return true;
}

function availableActions(owner: Actable, state: GameState): Action[] {
  return (owner.actions ?? []).filter((action) => actionAvailable(action, state));
}

// A "free travel action" is pure movement: its results only relocate (plus
// optional flavor `say`), with no rewards, costs, or branching outcomes — the
// stairs' ascend/descend are the canonical case. Such an action is an alias for
// a travel edge to the same destination.
function isFreeTravelAction(action: Action, target: string): boolean {
  const relocatesToTarget = action.results.some((r) => r.kind === 'relocate' && r.location === target);
  if (!relocatesToTarget) return false;
  const onlyMovement = action.results.every((r) => r.kind === 'relocate' || r.kind === 'say');
  const noBranches = !action.onSuccess && !action.onFailure && !action.onEscape;
  return onlyMovement && noBranches;
}

// True when an entity present here already offers a free relocate to `target`,
// so the travel edge to it would just duplicate that entity's action.
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

  for (const action of availableActions(location as unknown as Actable, state)) {
    choices.push({ id: `use:location.${location.id}.${action.label}`, kind: 'action', label: action.label, detail: location.title });
  }

  for (const [itemId, count] of Object.entries(state.inventory)) {
    if (count <= 0) continue;
    const item = registry.items.get(itemId);
    if (!item) continue;
    for (const action of availableActions(item as unknown as Actable, state)) {
      choices.push({ id: `use:item.${itemId}.${action.label}`, kind: 'action', label: action.label, detail: item.title });
    }
  }

  // TODO(inventory-crafting): every craftable recipe surfaces here as a
  // location action, so a stationless recipe (e.g. mixing dough) clutters the
  // room's action list. The playtest wanted stationless crafts to live on the
  // inventory/items involved instead — surfaced when you act on an ingredient,
  // not on the location. Deferred: it needs an item-scoped craft affordance
  // (which held item exposes which recipes) rather than the flat location scan.
  for (const recipe of registry.recipes.values()) {
    if (!recipeCraftable(recipe, registry, state)) continue;
    // Label the craft with the title of a present entity providing the
    // capability, falling back to its humanized id (unreachable once
    // recipeCraftable has confirmed one is present).
    const detail = recipe.requiresCapability
      ? (location.entities.map((entityId) => registry.entities.get(entityId)).find((entity) => entity?.capabilities.includes(recipe.requiresCapability!))?.title ?? humanize(recipe.requiresCapability))
      : undefined;
    choices.push({ id: `craft:${recipe.id}`, kind: 'craft', label: `Craft ${humanize(recipe.id)}`, detail });
  }

  for (const edge of location.adjacent) {
    if (edge.condition && !evaluateCondition(edge.condition, state)) continue;
    // Suppress a travel edge that an entity here already exposes as a free
    // relocate (e.g. the stairs' ascend/descend) — they're aliases for the same
    // move, so showing both duplicates the option (playtest feedback #2).
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

// The single converter from a PlayChoice to the structured Directive that
// applyDirective executes. Every gameplay choice maps to exactly one directive,
// so apply()/beginAction and the test/CLI directive path share one executor and
// one command vocabulary — there is no second switch over choice kinds. A
// dialogue choice carries its already-rendered label as the `choose:` text;
// choose() re-matches by rendered text, so the label round-trips.
export function choiceToDirective(choice: PlayChoice): Directive {
  switch (choice.kind) {
    case 'talk':
      return { kind: 'talk', entity: choice.id.slice('talk:'.length) };
    case 'action': {
      const match = /^use:([a-z]+)\.([a-z0-9-]+)\.(.+)$/.exec(choice.id);
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
    pendingModal: state.pendingModal,
  };
}

// Every declared pool with its live max derived from stats (so a +max buff
// widens the bar). Split out from view() with no side effects, so a driver can
// re-read the pools (e.g. play-cli's /state) without consuming the log cursor.
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

// Like apply(), but for a spannable action/craft/travel it only ARMS the fight
// (state.activeAction set) instead of resolving its first unit instantly — a
// live driver then drives it forward over real time via wait(). A journey
// (travel) is spannable when its distance is positive; talk/dialogue choices,
// and any action/craft/travel whose first unit resolves in zero simulated time
// (an instant item action, a zero-time craft, a zero-distance journey), still
// go through the ordinary instant dispatch()/apply() path unchanged — including
// the food-buff-on-eating side effect that lives in useAction, outside
// resolve(). After beginAction, session.state.activeAction is non-null IFF a
// spannable action is now in flight.
export function beginAction(session: PlaySession, choiceId: string): PlayView {
  const choice = computeChoices(session).find((c) => c.id === choiceId);
  if (!choice) throw new RuntimeError(`unavailable choice: ${JSON.stringify(choiceId)}`);
  const directive = choiceToDirective(choice);
  const { registry, state } = session;

  // A spannable verb whose first unit takes positive sim-time is ARMED for a
  // live driver to advance over real time. Everything else — talk/dialogue, or
  // a zero-time craft/action or zero-distance journey — falls through to
  // applyDirective, the same instant executor apply() uses.
  if (directive.kind === 'craft' && craftFirstUnit(directive.recipe, registry, state) > 0) {
    armCraft(directive.recipe, registry, state);
    return view(session);
  }
  if (directive.kind === 'use' && actionFirstUnit(directive.obj, directive.objId, directive.actionId, registry, state) > 0) {
    // If the take-gate fails, armAction logs the failure and leaves
    // activeAction unset; either way there's nothing left to resolve here.
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

// Both wait() and cancelAction() are the view-returning face of the same
// mutation applyDirective performs for a `wait:`/`cancel` test directive —
// they route through it so the semantics live in exactly one place (a driver
// callable, unlike the directive path, always has a resolvable location, so
// building a PlayView here is safe).
export function wait(session: PlaySession, seconds: number): PlayView {
  applyDirective(session, { kind: 'wait', seconds });
  return view(session);
}

// First-class cancellation: abandon the action in flight, mid-progress. Any
// units it already completed on earlier resolve() ticks stay applied; the
// partly-done current attempt is discarded (no partial credit). Sim-time is not
// rewound — the player spent the time they spent. A no-op when nothing is
// active, so a driver can call it unconditionally.
export function cancelAction(session: PlaySession): PlayView {
  applyDirective(session, { kind: 'cancel' });
  return view(session);
}

// Called by a driver (session/play-cli) once it has collected whatever the
// pending modal needed from the player. Currently the only modal is
// character-creation, so this is the one place `state.player` is set.
export function submitModal(session: PlaySession, data: { name: string; race: string }): PlayView {
  session.state.player = { name: data.name, race: data.race };
  session.state.pendingModal = undefined;
  return view(session);
}

// The choice id beginAction's live path expects, for the same use/travel/craft
// payload a `begin:` test directive carries.
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

// Executes one test directive against a live session — the single seam shared
// by runTest (headless) and, later, the interactive CLI, so there is one
// command vocabulary and one place gameplay/assertion semantics live. `run:`
// is excluded: it recurses into another test, which only runTest knows how to
// do (cyclic-run detection, stack tracking), so applyDirective throws if asked
// to execute one.
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
      const result = choose(directive.text, session.dialogue, state);
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
      // The single home of cancellation's mutation: cancelAction() wraps this
      // with a view(). Kept view-free here because a test's state (built
      // without startSession, see runTest) may have no resolvable location.
      state.activeAction = null;
      return {};
    case 'wait':
      // The single home of time advancement's mutation: wait() wraps this with
      // a view(). View-free here for the same reason as cancel above (e.g.
      // runtime.test.ts asserts on state.time with no location ever set).
      resolve(state, registry, state.time + directive.seconds);
      return {};
  }
}

export interface TestResult {
  passed: boolean;
  failure?: string;
}

// Runs a `# test` script directive-by-directive through applyDirective, the
// same executor a live driver uses — so a headless test and an interactive
// session can never drift onto two different command vocabularies. Builds its
// own PlaySession directly (not via startSession) because startSession sets a
// fresh state's location to the registry's starting location, which would
// break a test that begins with its own `travel:` from an unset location.
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
