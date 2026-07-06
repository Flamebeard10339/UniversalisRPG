import { readFileSync } from 'node:fs';
import path from 'node:path';
import { applyModulesToBundle } from '../src/game/contentModules';
import { isActionVisible, canStartAction } from '../src/game/conditions';
import { getActionDescriptionText, getActionTitleText } from '../src/game/actionLocalization';
import { entityTitleKey, itemTitleKey, locationDescriptionKey, locationTitleKey } from '../src/game/contentIds';
import { availableRecipesForStation, resolveStationAction } from '../src/game/recipes';
import {
  cancelDialogue,
  chooseDialogueOption,
  createInitialPlayState,
  resolveIdleTimers,
  startAction,
} from '../src/game/timers';
import type {
  ActionResolutionContext,
  ContentBundle,
  ContentModule,
  DialogueOption,
  GameAction,
  UniversePlayState,
} from '../src/game/types';

export type Choice = {
  choiceId: string;
  kind: 'action' | 'entity-action' | 'dialogue-option';
  entityId?: string;
  title: string;
  description?: string;
  requirementsMet: boolean;
};

export type TranscriptEvent = {
  kind: 'location' | 'choice' | 'chat' | 'note';
  text: string;
};

const ACTION_PREFIX = 'action:';
const DIALOGUE_PREFIX = 'dialogue-option:';
const RECIPE_SEPARATOR = '@';

export const readModule = (moduleDirs: string[], moduleId: string): ContentModule => {
  for (const moduleDir of moduleDirs) {
    const filePath = path.join(moduleDir, `${moduleId}.json`);
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as ContentModule;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`Module "${moduleId}" not found in: ${moduleDirs.join(', ')}`);
};

const emptyBundle = (universeId: string): ContentBundle => ({
  manifest: {
    schemaVersion: 1,
    id: universeId,
    version: '0.1.0',
    author: 'UniversalisRPG',
    locales: ['en'],
    files: [],
  },
  locations: [],
  entities: [],
  actions: [],
  skills: [],
  stats: [],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dropTables: [],
  collectionLogs: [],
  dialogues: [],
  quests: [],
  recipes: [],
  locales: { en: {} },
});

export const loadStagedBundle = (moduleDirs: string[], moduleIds: string[], universeId = 'base') => {
  const modules = moduleIds.map((id) => readModule(moduleDirs, id));
  const resolution = applyModulesToBundle(emptyBundle(universeId), modules, moduleIds);
  return resolution;
};

export const createTranslator = (bundle: ContentBundle, locale = 'en') => (
  key: string,
  fallbackOrParams?: string | Record<string, string | number>,
  params?: Record<string, string | number>,
) => {
  const fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : undefined;
  const interpolation = typeof fallbackOrParams === 'object' ? fallbackOrParams : params;
  const value = bundle.locales[locale]?.[key] ?? fallback ?? key;
  return interpolation
    ? value.replace(/\{([^}]+)\}/g, (match, paramKey) => String(interpolation[paramKey] ?? match))
    : value;
};

export const contextFromBundle = (bundle: ContentBundle): ActionResolutionContext => ({
  manifest: bundle.manifest,
  actions: bundle.actions,
  skills: bundle.skills,
  stats: bundle.stats,
  locations: bundle.locations,
  entities: bundle.entities,
  items: bundle.items,
  flags: bundle.flags,
  resourceDefinitions: bundle.resourceDefinitions,
  effects: bundle.effects,
  interactionTypes: bundle.interactionTypes,
  enemies: bundle.enemies,
  dropTables: bundle.dropTables,
  collectionLogs: bundle.collectionLogs,
  dialogues: bundle.dialogues,
  recipes: bundle.recipes,
});

const currentDialogueNode = (bundle: ContentBundle, state: UniversePlayState) => {
  if (!state.activeDialogue) return null;
  const dialogue = (bundle.dialogues ?? []).find((candidate) => candidate.id === state.activeDialogue?.dialogueId);
  return dialogue?.nodes.find((node) => node.id === state.activeDialogue?.nodeId) ?? null;
};

const logDialogueNode = (
  bundle: ContentBundle,
  state: UniversePlayState,
  t: ReturnType<typeof createTranslator>,
  events: TranscriptEvent[],
) => {
  const node = currentDialogueNode(bundle, state);
  if (!node) return;
  const textKey = node.textKey ?? node.narratorKey;
  if (!textKey) return;
  const speaker = node.speakerId ? `${t(entityTitleKey(node.speakerId), node.speakerId)}: ` : '';
  events.push({ kind: 'chat', text: `${speaker}${t(textKey, textKey)}` });
};

export const visibleChoices = (
  bundle: ContentBundle,
  context: ActionResolutionContext,
  state: UniversePlayState,
  t: ReturnType<typeof createTranslator>,
): Choice[] => {
  const dialogueNode = currentDialogueNode(bundle, state);
  if (dialogueNode?.options?.length) {
    return dialogueNode.options
      .filter((option: DialogueOption) => !option.conditions)
      .map((option) => ({
        choiceId: `${DIALOGUE_PREFIX}${option.id}`,
        kind: 'dialogue-option' as const,
        title: t(option.labelKey),
        requirementsMet: true,
      }));
  }

  const currentLocation = bundle.locations.find((location) => location.id === state.currentLocationId);
  const entities = (currentLocation?.entities ?? [])
    .map((entityId) => (bundle.entities ?? []).find((entity) => entity.id === entityId))
    .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity));
  const entityActionIds = new Set(entities.flatMap((entity) => entity.actionIds ?? []));

  const describe = (action: GameAction, kind: Choice['kind'], entityId?: string): Choice[] => {
    if (!action.stationId) {
      return [{
        choiceId: `${ACTION_PREFIX}${action.id}`,
        kind,
        entityId,
        title: getActionTitleText(action, bundle, t),
        description: getActionDescriptionText(action, bundle, t),
        requirementsMet: canStartAction(state, action, context),
      }];
    }

    return availableRecipesForStation(state, action.stationId, context).map((recipe) => {
      const resolved = resolveStationAction(action, recipe.id, context);
      const itemId = recipe.inputs[0]?.itemId;
      return {
        choiceId: `${ACTION_PREFIX}${action.id}${RECIPE_SEPARATOR}${recipe.id}`,
        kind,
        entityId,
        title: itemId ? t(itemTitleKey(itemId), itemId) : getActionTitleText(action, bundle, t),
        description: getActionDescriptionText(action, bundle, t),
        requirementsMet: canStartAction(state, resolved, context),
      };
    });
  };

  const locationActions = bundle.actions
    .filter((action) => action.locationId === state.currentLocationId && !entityActionIds.has(action.id))
    .filter((action) => isActionVisible(state, action, context))
    .flatMap((action) => describe(action, 'action'));

  const entityChoices = entities.flatMap((entity) =>
    (entity.actionIds ?? [])
      .map((actionId) => bundle.actions.find((action) => action.id === actionId))
      .filter((action): action is GameAction => Boolean(action))
      .filter((action) => isActionVisible(state, action, context))
      .flatMap((action) => describe(action, 'entity-action', entity.id)));

  return [...locationActions, ...entityChoices];
};

export const describeLocation = (bundle: ContentBundle, state: UniversePlayState, t: ReturnType<typeof createTranslator>) => {
  const location = bundle.locations.find((candidate) => candidate.id === state.currentLocationId);
  const entityNames = (location?.entities ?? []).map((entityId) => t(entityTitleKey(entityId), entityId));
  return {
    id: state.currentLocationId,
    title: location ? t(locationTitleKey(location.id), location.id) : state.currentLocationId,
    description: location ? t(locationDescriptionKey(location.id), '') : '',
    entityCount: location?.entities?.length ?? 0,
    entityNames,
  };
};

const pushChatEvents = (
  events: TranscriptEvent[],
  messages: UniversePlayState['chatMessages'],
  t: ReturnType<typeof createTranslator>,
) => {
  for (const message of messages) {
    events.push({ kind: 'chat', text: t(message.key ?? '', message.text ?? '', message.params) });
  }
};

const settle = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  t: ReturnType<typeof createTranslator>,
  events: TranscriptEvent[],
  random: () => number = Math.random,
) => {
  let next = state;
  let iterations = 0;
  while ((next.activeAction || next.activeTravel) && iterations < 30) {
    iterations += 1;
    const wakeAt = next.activeTravel?.pathCompletesAt ?? next.activeAction?.completesAt ?? Date.now();
    const before = next.chatMessages.length;
    const resolution = resolveIdleTimers(next, context, { random }, wakeAt + 1);
    next = resolution.state;
    pushChatEvents(events, next.chatMessages.slice(before), t);
    if (resolution.report.kind === 'none') break;
  }
  return next;
};

export const applyChoice = (
  bundle: ContentBundle,
  context: ActionResolutionContext,
  state: UniversePlayState,
  choiceId: string,
  t: ReturnType<typeof createTranslator>,
  events: TranscriptEvent[],
  now = Date.now(),
  random: () => number = Math.random,
): UniversePlayState => {
  if (choiceId.startsWith(DIALOGUE_PREFIX)) {
    const optionId = choiceId.slice(DIALOGUE_PREFIX.length);
    const before = state.chatMessages.length;
    let next = chooseDialogueOption(state, context, optionId, now);
    pushChatEvents(events, next.chatMessages.slice(before), t);
    next = settle(next, context, t, events, random);
    logDialogueNode(bundle, next, t, events);
    return next;
  }

  const rawId = choiceId.startsWith(ACTION_PREFIX) ? choiceId.slice(ACTION_PREFIX.length) : choiceId;
  const [actionId, recipeId] = rawId.split(RECIPE_SEPARATOR);
  const action = bundle.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`Unknown choice: ${choiceId}`);

  // Matches gameState.ts's real startAction handler, which always cancels any
  // active dialogue before starting a new action.
  const before = state.chatMessages.length;
  let next = startAction(cancelDialogue(state, now), action, context, now, { random, recipeId });
  pushChatEvents(events, next.chatMessages.slice(before), t);
  next = settle(next, context, t, events, random);
  logDialogueNode(bundle, next, t, events);
  return next;
};

export const freshState = (bundle: ContentBundle): UniversePlayState => {
  const startingLocationId = bundle.locations.find((location) => location.starting)?.id ?? bundle.locations[0]?.id ?? 'start';
  const context = contextFromBundle(bundle);
  return resolveIdleTimers(createInitialPlayState(bundle.manifest.id, startingLocationId, context), context, {}, Date.now()).state;
};
