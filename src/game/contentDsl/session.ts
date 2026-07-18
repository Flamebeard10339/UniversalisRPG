import { Action } from './entity';
import { advanceTime, craft, DialogueSession, GameState, Registry, RuntimeError, choose, createGameState, evaluateCondition, recipeCraftable, renderSegments, talk, useAction } from './runtime';
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
    const detail = recipe.station ? registry.entities.get(recipe.station)?.title : undefined;
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
      session.state.location = choice.id.slice('travel:'.length);
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
  };
}

export function apply(session: PlaySession, choiceId: string): PlayView {
  const choice = computeChoices(session).find((c) => c.id === choiceId);
  if (!choice) throw new RuntimeError(`unavailable choice: ${JSON.stringify(choiceId)}`);
  dispatch(session, choice);
  return view(session);
}

// Maps to a future CLI `/wait <s>` command — not built here.
export function wait(session: PlaySession, seconds: number): PlayView {
  advanceTime(session.state, seconds);
  return view(session);
}
