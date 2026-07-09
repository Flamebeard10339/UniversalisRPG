import { readFileSync } from 'node:fs';
import path from 'node:path';
import { applyModulesToBundle } from '../src/game/contentModules';
import { compileDsl } from '../src/game/contentDsl/compiler';
import { entityTitleKey } from '../src/game/contentIds';
import {
  ACTION_PREFIX,
  currentDialogueNode,
  describeLocation,
  DIALOGUE_PREFIX,
  RECIPE_SEPARATOR,
  visibleChoices,
} from '../src/game/choices';
import type { Choice } from '../src/game/choices';
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
  UniversePlayState,
} from '../src/game/types';

export type { Choice };
export { visibleChoices, describeLocation };

export type TranscriptEvent = {
  kind: 'location' | 'choice' | 'chat' | 'note';
  text: string;
};

const stripBom = (text: string) => text.replace(/^﻿/, '');

const tryReadFile = (filePath: string): string | null => {
  try {
    return stripBom(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
};

// Mirrors loader.ts's real json-then-DSL-compile fallback (see CLAUDE.md's
// Content Pipeline section) — every Tutorial Island module ships as `.md`
// DSL now, so a `.json`-only reader here would silently fail to find any of
// them and this CLI would only ever work against hand-authored JSON stubs,
// not the real shipped content.
export const readModule = (moduleDirs: string[], moduleId: string): ContentModule => {
  for (const moduleDir of moduleDirs) {
    const jsonText = tryReadFile(path.join(moduleDir, `${moduleId}.json`));
    if (jsonText !== null) return JSON.parse(jsonText) as ContentModule;
    const mdText = tryReadFile(path.join(moduleDir, `${moduleId}.md`));
    if (mdText !== null) return compileDsl(mdText).module;
  }
  throw new Error(`Module "${moduleId}" not found in: ${moduleDirs.join(', ')}`);
};

// Known gap: this doesn't load the real universe.json (combatBalance/
// experienceCurve/ui settings) or content/gui locales, so headless numeric
// results (durations, damage) can drift from the real app if those get
// overridden away from their defaults. Fine for choice-availability/flag/
// result-shape regression coverage (this CLI's actual purpose); revisit if a
// headless test ever needs numeric parity with the live game.
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
  statModifiers: [],
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
  statModifiers: bundle.statModifiers,
});

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
