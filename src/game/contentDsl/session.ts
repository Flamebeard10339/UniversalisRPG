import { Action } from './entity';
import {
  actionFirstUnit,
  armAction,
  armCraft,
  armTravel,
  craft,
  craftFirstUnit,
  DialogueSession,
  GameState,
  Registry,
  RuntimeError,
  choose,
  createGameState,
  evaluateCondition,
  recipeCraftable,
  renderSegments,
  resolve,
  talk,
  travelFirstUnit,
  useAction,
  useTravel,
} from './runtime';
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

function dispatch(session: PlaySession, choice: PlayChoice): void {
  switch (choice.kind) {
    case 'talk': {
      const entityId = choice.id.slice('talk:'.length);
      const result = talk(entityId, session.registry, session.state);
      session.dialogue = result.choices ? result : null;
      return;
    }
    case 'dialogue': {
      const dialogueSession = session.dialogue;
      if (!dialogueSession || !dialogueSession.choices) throw new RuntimeError('no active dialogue menu');
      const index = Number(choice.id.slice('dialogue:'.length));
      const raw = dialogueSession.choices[index];
      if (!raw) throw new RuntimeError(`no dialogue choice at index: ${index}`);
      const text = renderSegments(raw.segments, session.state);
      const result = choose(text, dialogueSession, session.state);
      session.dialogue = result.choices ? result : null;
      return;
    }
    case 'action': {
      const match = /^use:([a-z]+)\.([a-z0-9-]+)\.(.+)$/.exec(choice.id);
      if (!match) throw new RuntimeError(`malformed action choice id: ${choice.id}`);
      const [, obj, objId, label] = match;
      useAction(obj, objId, label, session.registry, session.state);
      return;
    }
    case 'travel': {
      useTravel(session.state.location, choice.id.slice('travel:'.length), session.registry, session.state);
      return;
    }
    case 'craft': {
      craft(choice.id.slice('craft:'.length), session.registry, session.state);
      return;
    }
  }
}

export function startSession(registry: Registry, state: GameState = createGameState()): PlaySession {
  if (!state.location) {
    const starting = [...registry.locations.values()].find((location) => location.starting);
    if (starting) state.location = starting.id;
  }
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
    pendingModal: state.pendingModal,
  };
}

export function apply(session: PlaySession, choiceId: string): PlayView {
  const choice = computeChoices(session).find((c) => c.id === choiceId);
  if (!choice) throw new RuntimeError(`unavailable choice: ${JSON.stringify(choiceId)}`);
  dispatch(session, choice);
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

  if (choice.kind === 'craft') {
    const recipeId = choice.id.slice('craft:'.length);
    if (craftFirstUnit(recipeId, session.registry, session.state) > 0) {
      armCraft(recipeId, session.registry, session.state);
      return view(session);
    }
    dispatch(session, choice);
    return view(session);
  }

  if (choice.kind === 'action') {
    const match = /^use:([a-z]+)\.([a-z0-9-]+)\.(.+)$/.exec(choice.id);
    if (!match) throw new RuntimeError(`malformed action choice id: ${choice.id}`);
    const [, obj, objId, label] = match;
    if (actionFirstUnit(obj, objId, label, session.registry, session.state) > 0) {
      // If the take-gate fails, armAction logs the failure and leaves
      // activeAction unset; either way there's nothing left to resolve here.
      armAction(obj, objId, label, session.registry, session.state);
      return view(session);
    }
    dispatch(session, choice);
    return view(session);
  }

  if (choice.kind === 'travel') {
    const dest = choice.id.slice('travel:'.length);
    const origin = session.state.location;
    if (travelFirstUnit(origin, dest, session.registry, session.state) > 0) {
      armTravel(origin, dest, session.registry, session.state);
      return view(session);
    }
    dispatch(session, choice);
    return view(session);
  }

  // talk/dialogue: instant regardless of live mode.
  dispatch(session, choice);
  return view(session);
}

export function wait(session: PlaySession, seconds: number): PlayView {
  resolve(session.state, session.registry, session.state.time + seconds);
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
