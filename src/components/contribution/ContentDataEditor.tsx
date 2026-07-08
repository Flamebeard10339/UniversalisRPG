import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { locationDescriptionKey, locationTitleKey, toKebabInput } from '../../game/contentIds';
import type { Translator } from '../../game/i18n';
import type { BasePlayerDefinition, CombatBalanceDefinition, ContentBundle, ContentModule, ContentModulePack, ContributionDraft, ContributionRemovedIds, DialogueDefinition, DisplayProfileDefinition, DropTableDefinition, EffectDefinition, EnemyDefinition, EntityDefinition, ExperienceCurveDefinition, ExperienceTrigger, GameAction, InteractionTypeDefinition, ItemDefinition, LocationNode, ResourceDefinition, SkillDefinition, StatDefinition, StateFlagDefinition, UniverseUiSettings, ValidationIssue } from '../../game/types';
import { editableModuleJsonFiles, mergedContributionModules } from '../../game/contributionFiles';
import { DslModuleEditor } from './DslModuleEditor';
import { ContributionMapEditor } from './ContributionMapEditor';
import { DialogueGraphEditor } from './DialogueGraphEditor';
import { dialogueNarratorKey, dialogueOptionLabelKey, dialogueTextKey, mergeLocalePatch, workingLocale, defaultModuleLocalePatch } from './contributionLocalization';
import { EnemyDiagnostics } from './EnemyDiagnostics';
import { DEBUG_PLAYER_PROFILES, getProfileStatSummary, profileDescription, profileTitle } from '../../game/playerProfiles';
import { resolveCombatBalance } from '../../game/combatBalance';
import { getEnemyStat, normalizeEnemyStats } from '../../game/enemies';
import { resolveUniverseUiSettings } from '../../game/universeSettings';
import { resolveExperienceCurve } from '../../game/skills';
import { StructuredDataEditor, type StructuredSchema, type StructuredValue } from '../structuredData/StructuredData';
import { actionSchema, basePlayerSchema, combatBalanceSchema, contentModuleSchema, dialogueSchema, displayProfileSchema, dropTableDefinitionSchema, effectDefinitionSchema, enemyStatsSchema, entityDefinitionSchema, experienceCurveSchema, flagDefinitionSchema, interactionTypeDefinitionSchema, itemDefinitionSchema, locationSchema, modulePackSchema, resourceDefinitionSchema, rewardSchema, skillDefinitionSchema, statDefinitionSchema, universeExperienceSchema, universeUiSchema } from '../structuredData/contentSchemas';
import { useUniverseState } from '../../stores/universeState';
import { createModEditService, localContributionsModId } from '../../game/modEditService';
import { createDraftModStore } from '../../game/modStore';

type ContentDataEditorProps = {
  activeTab: ContentDataTab;
  baseBundle: ContentBundle;
  bundle: ContentBundle;
  draft: ContributionDraft;
  issues: ValidationIssue[];
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  onTabChange: (tab: ContentDataTab) => void;
  t: Translator;
};

export type ContentDataTab = 'universe' | 'map' | 'actions' | 'primitives' | 'enemies' | 'resources' | 'dsl' | 'json';
type JsonEditorFile = {
  path: string;
  json: unknown;
  onChange: (value: StructuredValue | undefined) => void;
  schema?: StructuredSchema;
};
type DraftListKey = Exclude<keyof ContributionRemovedIds, 'resources'>;
type LayeredRow<T> = {
  index: number;
  item: T;
  source: 'draft' | 'base';
};

const contentTabs: ContentDataTab[] = ['universe', 'map', 'actions', 'primitives', 'enemies', 'resources', 'dsl', 'json'];

const uniqueId = (baseId: string, existingIds: string[]) => {
  let index = 1;
  let nextId = baseId;

  while (existingIds.includes(nextId)) {
    index += 1;
    nextId = `${baseId}-${index}`;
  }

  return nextId;
};

const upsertById = <T extends { id: string }>(items: T[], item: T) =>
  items.some((candidate) => candidate.id === item.id)
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [item, ...items];
const withoutId = <T extends { id: string }>(items: T[], id: string) => items.filter((item) => item.id !== id);
const emptyRemoved = (): ContributionRemovedIds => ({
  locations: [],
  entities: [],
  actions: [],
  skills: [],
  stats: [],
  items: [],
  flags: [],
  resources: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dropTables: [],
  dialogues: [],
  modules: [],
});
const matchesFilter = (value: unknown, filter: string) =>
  filter.trim().length === 0 || JSON.stringify(value).toLowerCase().includes(filter.trim().toLowerCase());
const layeredRows = <T extends { id: string }>(
  draftItems: T[],
  baseItems: T[],
  removedIds: string[],
  filter: string,
): LayeredRow<T>[] => {
  const draftIds = new Set(draftItems.map((item) => item.id));
  const removed = new Set(removedIds);
  return [
    ...draftItems.map((item, index) => ({ item, index, source: 'draft' as const })),
    ...baseItems
      .map((item, index) => ({ item, index, source: 'base' as const }))
      .filter((row) => !draftIds.has(row.item.id) && !removed.has(row.item.id)),
  ].filter((row) => matchesFilter(row.item, filter));
};

const uniqueById = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];
const allSkills = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...bundle.skills, ...draft.skills]);
const allStats = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...bundle.stats, ...draft.stats]);
const allItems = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.items ?? []), ...draft.items]);
const allFlags = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.flags ?? []), ...draft.flags]);
const allInteractionTypes = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.interactionTypes ?? []), ...draft.interactionTypes]);
const allEnemies = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.enemies ?? []), ...draft.enemies]);

const defaultPatchTargetModId = (bundle: ContentBundle) =>
  bundle.modules?.some((module) => module.id === 'base-core') ? 'base-core' : bundle.manifest.id;


export const ContentDataEditor = ({ activeTab, baseBundle, bundle, draft, issues, onPatch, onTabChange, t }: ContentDataEditorProps) => {
  const [filter, setFilter] = useState('');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [selectedDialogueId, setSelectedDialogueId] = useState<string | null>(null);
  const dslModuleIds = mergedContributionModules(baseBundle, draft).map((module) => module.id);
  const [selectedDslModuleId, setSelectedDslModuleId] = useState<string | null>(null);
  const activeDslModuleId = selectedDslModuleId && dslModuleIds.includes(selectedDslModuleId) ? selectedDslModuleId : dslModuleIds[0] ?? null;
  const actionEditorKeys = useRef<Record<string, string>>({});
  const resourceEditorKeys = useRef<Record<string, string>>({});
  const effectEditorKeys = useRef<Record<string, string>>({});
  const [selectedEnemyKey, setSelectedEnemyKey] = useState<string | null>(null);
  const enemyEditorKeys = useRef<Record<string, string>>({});
  const localePreference = useUniverseState((state) => state.localePreference);
  const setEnabledModules = useUniverseState((state) => state.setEnabledModules);
  const removed = { ...emptyRemoved(), ...(draft.removed ?? {}) };
  const workingLocaleId = workingLocale(bundle, localePreference);
  const removeButtonClass = 'rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200';
  const locations = layeredRows(draft.locations, bundle.locations, removed.locations, filter);
  const actions = layeredRows(draft.actions, bundle.actions, removed.actions, filter);
  const skills = layeredRows(draft.skills, bundle.skills, removed.skills, filter);
  const stats = layeredRows(draft.stats, bundle.stats, removed.stats, filter);
  const items = layeredRows(draft.items, bundle.items ?? [], removed.items, filter);
  const flags = layeredRows(draft.flags, bundle.flags ?? [], removed.flags, filter);
  const resources = layeredRows(draft.resourceDefinitions, bundle.resourceDefinitions ?? [], removed.resources, filter);
  const effects = layeredRows(draft.effects, bundle.effects ?? [], removed.effects, filter);
  const interactionTypes = layeredRows(draft.interactionTypes, bundle.interactionTypes ?? [], removed.interactionTypes, filter);
  const enemies = layeredRows(draft.enemies, bundle.enemies ?? [], removed.enemies, filter);
  const dropTables = layeredRows(draft.dropTables, bundle.dropTables ?? [], removed.dropTables, filter);
  const dialogues = layeredRows(draft.dialogues, bundle.dialogues ?? [], removed.dialogues, filter);
  const entities = layeredRows(draft.entities ?? [], bundle.entities ?? [], removed.entities ?? [], filter);
  const selectedDialogueRow = dialogues.find((row) => row.item.id === selectedDialogueId) ?? null;
  const basePlayer = draft.basePlayer ?? bundle.manifest.basePlayer ?? { inventory: {} };
  const combatBalance = resolveCombatBalance(draft.combatBalance ?? bundle.manifest.combatBalance);
  const experienceCurve = resolveExperienceCurve({ experienceCurve: draft.experienceCurve ?? bundle.manifest.experienceCurve });
  const universeExperience = draft.experience ?? bundle.manifest.experience ?? [];
  const displayProfiles = draft.displayProfiles ?? bundle.manifest.displayProfiles ?? [];
  const uiSettings = resolveUniverseUiSettings(draft.ui ?? bundle.manifest.ui);
  const patchWorkingLocale = (patch: Record<string, string>) => mergeLocalePatch(draft.locales, workingLocaleId, patch);
  const modEditService = () => createModEditService({
    resolvedBundle: bundle,
    store: createDraftModStore(draft, onPatch),
  });

  const enableLocalContributions = () => {
    const latestActiveModuleIds = new Set(useUniverseState.getState().enabledModules[bundle.manifest.id] ?? bundle.modules?.map((module) => module.id) ?? []);
    if (!latestActiveModuleIds.has(localContributionsModId)) {
      void setEnabledModules(bundle.manifest.id, [...latestActiveModuleIds, localContributionsModId]);
    }
  };

  const saveObjectListEdits = <T extends { id: string }>(objectType: string, previousItems: T[], nextItems: T[]) => {
    const service = modEditService();
    const targetModId = defaultPatchTargetModId(baseBundle);
    const previousById = new Map(previousItems.map((item) => [item.id, item]));
    const nextById = new Map(nextItems.map((item) => [item.id, item]));

    for (const item of nextItems) {
      const previous = previousById.get(item.id);
      const ops = previous ? service.diffEdit(previous, item) : [{ op: 'add' as const, path: '', value: item }];
      if (ops.length > 0) service.saveEdit(targetModId, objectType, item.id, ops);
    }

    for (const item of previousItems) {
      if (!nextById.has(item.id)) service.saveEdit(targetModId, objectType, item.id, [{ op: 'remove', path: '' }]);
    }

    enableLocalContributions();
  };

  const objectTypeForDraftKey = (key: DraftListKey) => key;

  const saveObjectEdit = <T extends { id: string }>(objectType: string, previous: T | null, next: T | null) => {
    const service = modEditService();
    const targetModId = defaultPatchTargetModId(baseBundle);
    if (previous && next && previous.id !== next.id) {
      service.saveEdit(targetModId, objectType, previous.id, [{ op: 'remove', path: '' }]);
      service.saveEdit(targetModId, objectType, next.id, [{ op: 'add', path: '', value: next }]);
    } else if (previous && next) {
      const ops = service.diffEdit(previous, next);
      if (ops.length > 0) service.saveEdit(targetModId, objectType, next.id, ops);
    } else if (next) {
      service.saveEdit(targetModId, objectType, next.id, [{ op: 'add', path: '', value: next }]);
    } else if (previous) {
      service.saveEdit(targetModId, objectType, previous.id, [{ op: 'remove', path: '' }]);
    }
    enableLocalContributions();
  };

  const patchLocalMapModule = (
    nextLocations: LocationNode[] = bundle.locations,
    nextActions: GameAction[] = bundle.actions,
    nextEntities: EntityDefinition[] = bundle.entities ?? [],
    localePatch: Record<string, string> = {},
  ) => {
    saveObjectListEdits('locations', bundle.locations, nextLocations);
    saveObjectListEdits('actions', bundle.actions, nextActions);
    saveObjectListEdits('entities', bundle.entities ?? [], nextEntities);
    if (Object.keys(localePatch).length > 0) {
      onPatch({ locales: patchWorkingLocale(localePatch) });
    }
  };

  useEffect(() => {
    if (selectedDialogueId && dialogues.some((row) => row.item.id === selectedDialogueId)) {
      return;
    }

    setSelectedDialogueId(dialogues[0]?.item.id ?? null);
  }, [dialogues, selectedDialogueId]);

  const promote = <T extends { id: string }>(key: DraftListKey, item: T, originalId = item.id) => {
    const previous = [...(draft[key] as T[]), ...((bundle as unknown as Record<string, T[] | undefined>)[key] ?? [])].find((candidate) => candidate.id === originalId) ?? null;
    saveObjectEdit(objectTypeForDraftKey(key), previous, item);
  };

  const removeRow = <T extends { id: string }>(key: DraftListKey, row: LayeredRow<T>) => {
    saveObjectEdit(objectTypeForDraftKey(key), row.item, null);
  };

  const updateLocation = (row: LayeredRow<LocationNode>, patch: Partial<LocationNode>) => {
    promote('locations', { ...row.item, ...patch }, row.item.id);
  };

  const updateSkill = (row: LayeredRow<SkillDefinition>, patch: Partial<SkillDefinition>) => {
    promote('skills', { ...row.item, ...patch }, row.item.id);
  };

  const updateStat = (row: LayeredRow<StatDefinition>, patch: Partial<StatDefinition>) => {
    promote('stats', { ...row.item, ...patch }, row.item.id);
  };

  const updateItem = (row: LayeredRow<ItemDefinition>, patch: Partial<ItemDefinition>) => {
    promote('items', { ...row.item, ...patch }, row.item.id);
  };

  const updateResource = (row: LayeredRow<ResourceDefinition>, patch: Partial<ResourceDefinition>) => {
    const item = { ...row.item, ...patch };
    saveObjectEdit('resources', row.item, item);
  };

  const removeResource = (row: LayeredRow<ResourceDefinition>) => {
    saveObjectEdit('resources', row.item, null);
  };

  const updateEffect = (row: LayeredRow<EffectDefinition>, patch: Partial<EffectDefinition>) => {
    promote('effects', { ...row.item, ...patch }, row.item.id);
  };

  const updateInteractionType = (row: LayeredRow<InteractionTypeDefinition>, patch: Partial<InteractionTypeDefinition>) => {
    promote('interactionTypes', { ...row.item, ...patch }, row.item.id);
  };

  const updateEnemy = (row: LayeredRow<EnemyDefinition>, patch: Partial<EnemyDefinition>) => {
    promote('enemies', { ...row.item, ...patch }, row.item.id);
  };

  const updateEnemyInteraction = (row: LayeredRow<EnemyDefinition>, interactionTypeId: string) => {
    updateEnemy(row, { interactionTypeId });
  };

  const updateEnemyStats = (row: LayeredRow<EnemyDefinition>, stats: Record<string, number>) => {
    updateEnemy(row, { stats: normalizeEnemyStats(stats) });
  };

  const updateCombatBalance = (value: StructuredValue | undefined) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) onPatch({ combatBalance: resolveCombatBalance(value as unknown as CombatBalanceDefinition) });
  };

  const updateExperienceCurve = (value: StructuredValue | undefined) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) onPatch({ experienceCurve: resolveExperienceCurve({ experienceCurve: value as unknown as ExperienceCurveDefinition }) });
  };

  const updateUiSettings = (value: StructuredValue | undefined) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) onPatch({ ui: resolveUniverseUiSettings(value as unknown as UniverseUiSettings) });
  };

  const updateUniverseExperience = (value: StructuredValue | undefined) => {
    onPatch({ experience: (Array.isArray(value) ? value : []) as unknown as ExperienceTrigger[] });
  };

  const updateDisplayProfiles = (value: StructuredValue | undefined) => {
    onPatch({ displayProfiles: (Array.isArray(value) ? value : []) as unknown as DisplayProfileDefinition[] });
  };

  const updateBasePlayer = (value: StructuredValue | undefined) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) onPatch({ basePlayer: value as unknown as BasePlayerDefinition });
  };

  const enemyEditorKey = (enemyId: string) => {
    enemyEditorKeys.current[enemyId] ??= `enemy-${Object.keys(enemyEditorKeys.current).length + 1}`;
    return enemyEditorKeys.current[enemyId];
  };

  const renameEnemyEditorState = (previousId: string, nextId: string) => {
    if (previousId === nextId) {
      return;
    }

    enemyEditorKeys.current[nextId] = enemyEditorKey(previousId);
  };

  const selectedEnemyRow = enemies.find((row) => enemyEditorKey(row.item.id) === selectedEnemyKey) ?? null;

  const actionEditorKey = (actionId: string) => {
    actionEditorKeys.current[actionId] ??= `action-${Object.keys(actionEditorKeys.current).length + 1}`;
    return actionEditorKeys.current[actionId];
  };

  const stableEditorKey = (keys: MutableRefObject<Record<string, string>>, prefix: string, id: string) => {
    keys.current[id] ??= `${prefix}-${Object.keys(keys.current).length + 1}`;
    return keys.current[id];
  };

  const renameStableEditorKey = (keys: MutableRefObject<Record<string, string>>, prefix: string, previousId: string, nextId: string) => {
    if (previousId !== nextId) keys.current[nextId] = stableEditorKey(keys, prefix, previousId);
  };

  const addLocation = () => {
    const allLocationItems = locations.map((row) => row.item);
    const id = uniqueId('new-location', allLocationItems.map((location) => location.id));
    saveObjectEdit('locations', null, {
      id,
      position: { x: 80 + allLocationItems.length * 80, y: 320 },
      tags: ['community'],
    });
    onPatch({
      locales: patchWorkingLocale(defaultModuleLocalePatch('locations', id)),
    });
  };

  const addAction = () => {
    const allActionItems = actions.map((row) => row.item);
    const id = uniqueId('new-action', allActionItems.map((action) => action.id));
    setSelectedActionId(id);
    saveObjectEdit('actions', null, {
      id,
      locationId: locations[0]?.item.id ?? '',
      instant: false,
      durationSeconds: 10,
      rewards: [],
    });
    onPatch({
      locales: patchWorkingLocale(defaultModuleLocalePatch('actions', id)),
    });
  };

  const addSkill = () => {
    const id = uniqueId('new-skill', skills.map((row) => row.item.id));
    saveObjectEdit('skills', null, { id, maxLevel: 100, statId: stats[0]?.item.id });
    onPatch({
      locales: patchWorkingLocale(defaultModuleLocalePatch('skills', id)),
    });
  };

  const addStat = () => {
    const id = uniqueId('new-stat', stats.map((row) => row.item.id));
    saveObjectEdit('stats', null, { id, base: 0 });
    onPatch({
      locales: patchWorkingLocale(defaultModuleLocalePatch('stats', id)),
    });
  };

  const addItem = () => {
    const id = uniqueId('new-item', items.map((row) => row.item.id));
    saveObjectEdit('items', null, { id });
    onPatch({
      locales: patchWorkingLocale(defaultModuleLocalePatch('items', id)),
    });
  };

  const addFlag = () => {
    const id = uniqueId('new-flag', flags.map((row) => row.item.id));
    saveObjectEdit('flags', null, { id, initialValue: false });
  };

  const addResource = () => {
    const id = uniqueId('new-resource', resources.map((row) => row.item.id));
    saveObjectEdit('resources', null, { id, sourceStat: stats[0]?.item.id ?? '', initialValue: 'full' });
    onPatch({
      locales: patchWorkingLocale(defaultModuleLocalePatch('resources', id)),
    });
  };

  const addEffect = () => {
    const id = uniqueId('new-effect', effects.map((row) => row.item.id));
    saveObjectEdit('effects', null, {
      id,
      resourceId: resources[0]?.item.id ?? '',
      sourceStat: stats[0]?.item.id ?? '',
    });
    onPatch({
      locales: patchWorkingLocale(defaultModuleLocalePatch('effects', id)),
    });
  };

  const addInteractionType = () => {
    const id = uniqueId('new-interaction', interactionTypes.map((row) => row.item.id));
    const sourceStatId = stats[0]?.item.id ?? '';
    const targetStatId = stats[1]?.item.id ?? sourceStatId;
    saveObjectEdit('interactionTypes', null, { id, sourceStatId, targetStatId, targetPlayerHealth: false, experience: [] });
    onPatch({
      locales: patchWorkingLocale(defaultModuleLocalePatch('interactionTypes', id)),
    });
  };

  const addEnemy = () => {
    const id = uniqueId('new-enemy', enemies.map((row) => row.item.id));
    const interactionTypeId = interactionTypes[0]?.item.id ?? '';
    setSelectedEnemyKey(enemyEditorKey(id));
    saveObjectEdit('enemies', null, {
      id,
      interactionTypeId,
      stats: {
        attack: 10,
        defense: 10,
        rate: 25,
      },
      showHealthBar: true,
      rewards: [],
    });
  };

  const addDialogue = () => {
    const id = uniqueId('new-dialogue', dialogues.map((row) => row.item.id));
    const startNodeId = 'start';
    const textKey = dialogueTextKey(id, startNodeId);
    saveObjectEdit('dialogues', null, {
      id,
      startNodeId,
      nodes: [{ id: startNodeId, textKey }],
    });
    onPatch({
      locales: mergeLocalePatch(draft.locales, workingLocaleId, {
        [textKey]: t('contribution.dialogue.defaultNodeText'),
      }),
    });
    setSelectedDialogueId(id);
  };

  const universeBasePlayer = { inventory: basePlayer.inventory ?? {} };
  const packagedModuleIds = new Set((baseBundle.modules ?? []).map((module) => module.id));
  const localDraftModules = (draft.modules ?? []).filter((module) => !packagedModuleIds.has(module.id));
  const moduleJsonFiles: JsonEditorFile[] = editableModuleJsonFiles(baseBundle, draft).map((file) => {
    if (file.path === 'universe.json') {
      return {
        ...file,
        onChange: (value: StructuredValue | undefined) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return;
          const manifest = value as { modules?: unknown };
          const ids = new Set((Array.isArray(manifest.modules) ? manifest.modules : []).filter((item): item is string => typeof item === 'string'));
          onPatch({
            modules: localDraftModules.filter((module) => ids.has(module.id)),
            removed: {
              ...removed,
              modules: removed.modules.filter((id) => !packagedModuleIds.has(id)),
            },
          });
        },
      };
    }

    const originalId = file.path.match(/^modules\/(.+)\.json$/)?.[1] ?? '';
    const editingPackagedModule = packagedModuleIds.has(originalId);
    return {
      ...file,
      schema: contentModuleSchema(bundle),
      onChange: (value: StructuredValue | undefined) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        const nextModule = value as unknown as ContentModule;
        if (editingPackagedModule || packagedModuleIds.has(nextModule.id)) return;
        onPatch({
          modules: upsertById(withoutId(localDraftModules, originalId), nextModule),
          removed: {
            ...removed,
            modules: removed.modules.filter((id) => id !== nextModule.id),
          },
        });
      },
    };
  });
  const jsonFiles: JsonEditorFile[] = [
    { path: 'universe.json', json: { ...bundle.manifest, basePlayer: universeBasePlayer, combatBalance, experienceCurve, experience: universeExperience, displayProfiles, ui: uiSettings }, onChange: (value: StructuredValue | undefined) => {
      const next = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      onPatch({
        basePlayer: next.basePlayer as BasePlayerDefinition | undefined,
        combatBalance: next.combatBalance as CombatBalanceDefinition | undefined,
        experienceCurve: next.experienceCurve as ExperienceCurveDefinition | undefined,
        experience: next.experience as ExperienceTrigger[] | undefined,
        displayProfiles: next.displayProfiles as DisplayProfileDefinition[] | undefined,
        ui: next.ui as UniverseUiSettings | undefined,
      });
    } },
    { path: 'locations.json', json: locations.map((row) => row.item), schema: { kind: 'array' as const, listMode: 'free' as const, item: locationSchema(bundle), createItem: () => ({ id: 'new-location', position: { x: 0, y: 0 } }) }, onChange: (value: StructuredValue | undefined) => patchLocalMapModule((Array.isArray(value) ? value : []) as unknown as LocationNode[], bundle.actions, bundle.entities ?? []) },
    { path: 'actions.json', json: actions.map((row) => row.item), onChange: (value: StructuredValue | undefined) => patchLocalMapModule(bundle.locations, (Array.isArray(value) ? value : []) as unknown as GameAction[], bundle.entities ?? []) },
    { path: 'entities.json', json: entities.map((row) => row.item), schema: { kind: 'array' as const, listMode: 'free' as const, item: entityDefinitionSchema(bundle), createItem: () => ({ id: 'new-entity', actionIds: [] }) }, onChange: (value: StructuredValue | undefined) => patchLocalMapModule(bundle.locations, bundle.actions, (Array.isArray(value) ? value : []) as unknown as EntityDefinition[]) },
    { path: 'dialogues.json', json: dialogues.map((row) => row.item), schema: { kind: 'array' as const, listMode: 'free' as const, item: dialogueSchema(bundle), createItem: () => ({ id: 'new-dialogue', startNodeId: 'start', nodes: [{ id: 'start', textKey: 'dialogue.new-dialogue.start' }] }) }, onChange: (value: StructuredValue | undefined) => saveObjectListEdits('dialogues', bundle.dialogues ?? [], (Array.isArray(value) ? value : []) as unknown as DialogueDefinition[]) },
    { path: 'drop-tables.json', json: dropTables.map((row) => row.item), schema: { kind: 'array' as const, listMode: 'free' as const, item: dropTableDefinitionSchema(bundle), createItem: () => ({ id: 'new-drop-table', mode: 'dependent', drops: [] }) }, onChange: (value: StructuredValue | undefined) => saveObjectListEdits('dropTables', bundle.dropTables ?? [], (Array.isArray(value) ? value : []) as unknown as DropTableDefinition[]) },
    ...moduleJsonFiles.filter((file) => file.path !== 'universe.json'),
    { path: 'module-packs.json', json: draft.modulePacks, schema: { kind: 'array' as const, listMode: 'free' as const, item: modulePackSchema(bundle), createItem: () => ({ id: 'new-pack', modules: [] }) }, onChange: (value: StructuredValue | undefined) => onPatch({ modulePacks: (Array.isArray(value) ? value : []) as unknown as ContentModulePack[] }) },
    { path: 'skills.json', json: skills.map((row) => row.item), schema: { kind: 'array' as const, listMode: 'table' as const, columns: ['id', 'maxLevel', 'statId', 'addedPerLevel', 'increasedPerLevel'], item: skillDefinitionSchema(bundle), createItem: () => ({ id: 'new-skill', maxLevel: 100 }) }, onChange: (value: StructuredValue | undefined) => saveObjectListEdits('skills', bundle.skills, (Array.isArray(value) ? value : []) as unknown as SkillDefinition[]) },
    { path: 'stats.json', json: stats.map((row) => row.item), schema: { kind: 'array' as const, listMode: 'table' as const, columns: ['id', 'base'], item: statDefinitionSchema(), createItem: () => ({ id: 'new-stat', base: 0 }) }, onChange: (value: StructuredValue | undefined) => saveObjectListEdits('stats', bundle.stats, (Array.isArray(value) ? value : []) as unknown as StatDefinition[]) },
    { path: 'items.json', json: items.map((row) => row.item), schema: { kind: 'array' as const, listMode: 'table' as const, columns: ['id', 'maxQuantity', 'tags'], item: itemDefinitionSchema(), createItem: () => ({ id: 'new-item' }) }, onChange: (value: StructuredValue | undefined) => saveObjectListEdits('items', bundle.items ?? [], (Array.isArray(value) ? value : []) as unknown as ItemDefinition[]) },
    { path: 'flags.json', json: flags.map((row) => row.item), schema: { kind: 'array' as const, listMode: 'table' as const, columns: ['id', 'initialValue'], item: flagDefinitionSchema(), createItem: () => ({ id: 'new-flag', initialValue: false }) }, onChange: (value: StructuredValue | undefined) => saveObjectListEdits('flags', bundle.flags ?? [], (Array.isArray(value) ? value : []) as unknown as StateFlagDefinition[]) },
    { path: 'resources.json', json: resources.map((row) => row.item), onChange: (value: StructuredValue | undefined) => saveObjectListEdits('resources', bundle.resourceDefinitions ?? [], (Array.isArray(value) ? value : []) as unknown as ResourceDefinition[]) },
    { path: 'effects.json', json: effects.map((row) => row.item), onChange: (value: StructuredValue | undefined) => saveObjectListEdits('effects', bundle.effects ?? [], (Array.isArray(value) ? value : []) as unknown as EffectDefinition[]) },
    { path: 'interaction-types.json', json: interactionTypes.map((row) => row.item), schema: { kind: 'array' as const, listMode: 'table' as const, columns: ['id', 'sourceStatId', 'targetStatId', 'targetPlayerHealth'], item: interactionTypeDefinitionSchema(bundle), createItem: () => ({ id: 'new-interaction', sourceStatId: stats[0]?.item.id ?? '', targetStatId: stats[0]?.item.id ?? '', targetPlayerHealth: false, experience: [] }) }, onChange: (value: StructuredValue | undefined) => saveObjectListEdits('interactionTypes', bundle.interactionTypes ?? [], (Array.isArray(value) ? value : []) as unknown as InteractionTypeDefinition[]) },
    { path: 'enemies.json', json: enemies.map((row) => row.item), onChange: (value: StructuredValue | undefined) => saveObjectListEdits('enemies', bundle.enemies ?? [], (Array.isArray(value) ? value : []) as unknown as EnemyDefinition[]) },
    { path: 'removed.json', json: draft.removed, onChange: (value: StructuredValue | undefined) => onPatch({ removed: value as unknown as ContributionRemovedIds }) },
    { path: 'locales.json', json: draft.locales, onChange: (value: StructuredValue | undefined) => onPatch({ locales: (value ?? {}) as ContributionDraft['locales'] }) },
  ];

  return (
    <section className="grid gap-3" data-testid="content-data-editor">
      <div className="flex gap-2 overflow-x-auto rounded border border-slate-800 bg-slate-900 p-2" data-testid="content-data-tabs">
        {contentTabs.map((tab) => (
          <button
            className={`min-w-28 flex-1 rounded px-3 py-2 text-sm font-semibold capitalize ${
              activeTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-950 text-slate-300'
            }`}
            data-testid={`content-tab-${tab}`}
            key={tab}
            onClick={() => onTabChange(tab)}
            type="button"
          >
            {t(`contribution.tab.${tab}`)}
          </button>
        ))}
      </div>

      <input
        className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100"
        data-testid="content-data-filter"
        onChange={(event) => setFilter(event.target.value)}
        placeholder={t('contribution.data.filter')}
        value={filter}
      />

      {activeTab === 'universe' && (
        <section className="grid gap-3 rounded border border-slate-700 p-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.universe')}</h3>
            <p className="text-xs text-slate-500">{t('contribution.data.universeDescription')}</p>
          </div>
          <StructuredDataEditor label="contribution.data.combatBalance" onChange={updateCombatBalance} schema={combatBalanceSchema()} t={t} value={combatBalance as unknown as StructuredValue} />
          <StructuredDataEditor label="contribution.universe.experienceCurve" onChange={updateExperienceCurve} schema={experienceCurveSchema()} t={t} value={experienceCurve as unknown as StructuredValue} />
          <StructuredDataEditor label="contribution.universe.experience" onChange={updateUniverseExperience} schema={universeExperienceSchema(bundle)} t={t} value={universeExperience as unknown as StructuredValue} />
          <StructuredDataEditor label="contribution.data.ui" onChange={updateUiSettings} schema={universeUiSchema()} t={t} value={uiSettings as unknown as StructuredValue} />
          <section className="grid gap-2 border-t border-slate-700 pt-3">
            <StructuredDataEditor label="contribution.universe.baseInventory" onChange={updateBasePlayer} schema={basePlayerSchema(bundle)} t={t} value={basePlayer as unknown as StructuredValue} />
          </section>
        </section>
      )}

      {activeTab === 'map' && (
        <section className="grid gap-2">
          <ContributionMapEditor
            bundle={bundle}
            onEntitiesChange={(entities) => patchLocalMapModule(bundle.locations, bundle.actions, entities)}
            onActionsChange={(actions) => patchLocalMapModule(bundle.locations, actions, bundle.entities ?? [])}
            onLocationsChange={(locations) => patchLocalMapModule(locations, bundle.actions, bundle.entities ?? [])}
            onLocalesChange={(patch) => patchLocalMapModule(bundle.locations, bundle.actions, bundle.entities ?? [], patch)}
            t={t}
          />
        </section>
      )}

      {activeTab === 'actions' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.actions')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="content-add-action" onClick={addAction} type="button">
              {t('contribution.data.addAction')}
            </button>
          </div>
          {actions.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noActionChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {actions.map((row) => {
                const action = row.item;
                const selected = selectedActionId === action.id;

                return (
                  <div className="grid gap-2 rounded bg-slate-950 p-2" data-testid={`content-row-action-${action.id}`} key={actionEditorKey(action.id)}>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <button className="min-w-0 rounded bg-slate-900 px-3 py-2 text-left" onClick={() => setSelectedActionId(selected ? null : action.id)} type="button">
                        <span className="block truncate text-sm font-semibold text-slate-100">{action.id}</span>
                        <span className="block truncate text-xs text-slate-400">{action.locationId}</span>
                      </button>
                      <button className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200" onClick={() => setSelectedActionId(selected ? null : action.id)} type="button">{selected ? t('structured.collapse') : t('contribution.column.edit')}</button>
                      <button
                        className={removeButtonClass}
                        onClick={() => {
                          if (selectedActionId === action.id) {
                            setSelectedActionId(null);
                          }
                          removeRow('actions', row);
                        }}
                        type="button"
                      >
                        {t('contribution.column.remove')}
                      </button>
                    </div>
                    {selected && (
                      <section className="grid gap-3 border-l border-slate-800 bg-slate-900/50 p-3">
                        <StructuredDataEditor label="contribution.data.actionFields" onChange={(value) => { if (value) { const next = value as unknown as GameAction; if (next.id !== action.id) { actionEditorKeys.current[next.id] = actionEditorKey(action.id); setSelectedActionId(next.id); } promote('actions', next, action.id); } }} schema={actionSchema(bundle)} t={t} value={action as unknown as StructuredValue} />
                      </section>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === 'actions' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.dialogues')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="content-add-dialogue" onClick={addDialogue} type="button">
              {t('contribution.data.addDialogue')}
            </button>
          </div>
          {dialogues.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noDialogues')}</p>
          ) : (
            <div className="grid gap-2">
              <div className="grid gap-2">
                {dialogues.map((row) => {
                  const dialogue = row.item;
                  const isSelected = selectedDialogueId === dialogue.id;
                  return (
                    <div className={`grid gap-2 rounded border p-3 ${isSelected ? 'border-cyan-500 bg-cyan-950/10' : 'border-slate-800 bg-slate-950'}`} data-testid={`content-row-dialogue-${dialogue.id}`} key={`${row.source}-${row.index}`}>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <button className="min-w-0 flex-1 rounded bg-slate-900 px-3 py-2 text-left" onClick={() => setSelectedDialogueId(isSelected ? null : dialogue.id)} type="button">
                          <span className="block truncate text-sm font-semibold text-slate-100">{dialogue.id}</span>
                          <span className="block truncate text-xs text-slate-400">{dialogue.startNodeId} · {dialogue.nodes.length} nodes</span>
                        </button>
                        <button className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200" onClick={() => setSelectedDialogueId(isSelected ? null : dialogue.id)} type="button">
                          {isSelected ? t('structured.collapse') : t('contribution.column.edit')}
                        </button>
                        <button
                          className={removeButtonClass}
                          onClick={() => {
                            if (selectedDialogueId === dialogue.id) {
                              setSelectedDialogueId(null);
                            }
                            removeRow('dialogues', row);
                          }}
                          type="button"
                        >
                          {t('contribution.column.remove')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedDialogueRow && (
                <DialogueGraphEditor
                  bundle={bundle}
                  dialogue={selectedDialogueRow.item}
                  locales={draft.locales}
                  onChange={(nextDialogue, localePatch) => {
                    promote('dialogues', nextDialogue, selectedDialogueRow.item.id);
                    if (localePatch) {
                      onPatch({ locales: mergeLocalePatch(draft.locales, workingLocaleId, localePatch) });
                    }
                  }}
                  onRemove={() => {
                    removeRow('dialogues', selectedDialogueRow);
                    setSelectedDialogueId(null);
                  }}
                  t={t}
                  workingLocale={workingLocaleId}
                />
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === 'primitives' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.skills')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="content-add-skill" onClick={addSkill} type="button">
              {t('contribution.data.addSkill')}
            </button>
          </div>
          {skills.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noSkillChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {skills.map((row) => (
                <div className="flex min-w-0 flex-wrap items-center gap-2 rounded bg-slate-950 p-2" data-testid={`content-row-skill-${row.item.id}`} key={`${row.source}-${row.index}`}>
                  <div className="min-w-0 flex-1">
                    <StructuredDataEditor onChange={(value) => { if (value) updateSkill(row, value as unknown as SkillDefinition); }} schema={skillDefinitionSchema(bundle)} t={t} value={row.item as unknown as StructuredValue} />
                  </div>
                  <button className={removeButtonClass} onClick={() => removeRow('skills', row)} type="button">
                    {t('contribution.column.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'primitives' && (
        <section className="grid gap-2 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.stats')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="content-add-stat" onClick={addStat} type="button">
              {t('contribution.data.addStat')}
            </button>
          </div>
          {stats.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noStatChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {stats.map((row) => (
                <div className="flex min-w-0 flex-wrap items-center gap-2 rounded bg-slate-950 p-2" data-testid={`content-row-stat-${row.item.id}`} key={`${row.source}-${row.index}`}>
                  <div className="min-w-0 flex-1">
                    <StructuredDataEditor onChange={(value) => { if (value) updateStat(row, value as unknown as StatDefinition); }} schema={statDefinitionSchema()} t={t} value={row.item as unknown as StructuredValue} />
                  </div>
                  <button className={removeButtonClass} onClick={() => removeRow('stats', row)} type="button">{t('contribution.column.remove')}</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'primitives' && (
        <section className="grid gap-2 rounded border border-slate-700 p-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.playerProfiles')}</h3>
            <p className="text-xs text-slate-500">{t('contribution.data.playerProfilesDescription')}</p>
          </div>
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-1 text-left">{t('contribution.enemyDiagnostics.profile')}</th>
                  <th className="px-2 py-1 text-left">{t('contribution.column.description')}</th>
                  <th className="px-2 py-1 text-left">{t('contribution.enemyDiagnostics.profileStats')}</th>
                </tr>
              </thead>
              <tbody>
                {DEBUG_PLAYER_PROFILES.map((profile) => (
                  <tr className="border-t border-slate-800" key={profile.id}>
                    <td className="px-2 py-2 font-semibold text-cyan-200">{profileTitle(profile, t)}</td>
                    <td className="px-2 py-2 text-slate-300">{profileDescription(profile, t)}</td>
                    <td className="px-2 py-2 text-slate-300">{getProfileStatSummary(bundle, profile, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'primitives' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.interactions')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="content-add-interaction" onClick={addInteractionType} type="button">
              {t('contribution.data.addInteraction')}
            </button>
          </div>
          {interactionTypes.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noInteractionChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {interactionTypes.map((row) => (
                <div className="flex min-w-0 flex-wrap items-center gap-2 rounded bg-slate-950 p-2" data-testid={`content-row-interaction-${row.item.id}`} key={`${row.source}-${row.index}`}>
                  <div className="min-w-0 flex-1">
                    <StructuredDataEditor onChange={(value) => { if (value) updateInteractionType(row, value as unknown as InteractionTypeDefinition); }} schema={interactionTypeDefinitionSchema(bundle)} t={t} value={row.item as unknown as StructuredValue} />
                  </div>
                  <button className={removeButtonClass} onClick={() => removeRow('interactionTypes', row)} type="button">
                    {t('contribution.column.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'enemies' && (
        <section className="grid gap-3 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.enemies')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="content-add-enemy" onClick={addEnemy} type="button">
              {t('contribution.data.addEnemy')}
            </button>
          </div>

          {selectedEnemyRow && (() => {
            const row = selectedEnemyRow;
            const enemy = row.item;

            return (
              <section className="grid gap-4 border-y border-slate-700 bg-slate-900 p-3">
                <div className="grid min-w-0 content-start gap-3">
                  <h4 className="font-semibold text-slate-100">{enemy.id}</h4>
                  <label className="grid gap-1 text-xs text-slate-400">
                    <span>{t('contribution.column.id')}</span>
                    <input
                      className="rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                      onChange={(event) => {
                        const nextId = toKebabInput(event.target.value);
                        renameEnemyEditorState(enemy.id, nextId);
                        setSelectedEnemyKey(enemyEditorKey(nextId));
                        updateEnemy(row, { id: nextId });
                      }}
                      value={enemy.id}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    <span>{t('contribution.column.interaction')}</span>
                    <input className="rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100" list="content-interaction-ids" onChange={(event) => updateEnemyInteraction(row, toKebabInput(event.target.value))} value={enemy.interactionTypeId} />
                  </label>
                  <section className="grid gap-2">
                    <h5 className="text-xs font-semibold uppercase text-slate-500">{t('contribution.enemyStats.title')}</h5>
                    <StructuredDataEditor onChange={(value) => updateEnemyStats(row, normalizeEnemyStats((value ?? {}) as Record<string, number>))} schema={enemyStatsSchema()} t={t} value={(enemy.stats ?? {}) as StructuredValue} />
                  </section>
                  <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span>{t('contribution.column.showHealth')}</span>
                    <input checked={enemy.showHealthBar ?? true} onChange={(event) => updateEnemy(row, { showHealthBar: event.target.checked })} type="checkbox" />
                  </label>
                  <StructuredDataEditor label="contribution.column.rewards" onChange={(value) => updateEnemy(row, { rewards: (value ?? []) as unknown as EnemyDefinition['rewards'] })} schema={{ kind: 'array', listMode: 'free', item: rewardSchema(bundle), createItem: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', amount: 1 }) }} t={t} value={enemy.rewards as unknown as StructuredValue} />
                  <button className={`${removeButtonClass} justify-self-end`} onClick={() => { setSelectedEnemyKey(null); removeRow('enemies', row); }} type="button">
                    {t('contribution.column.remove')}
                  </button>
                </div>
                <EnemyDiagnostics bundle={bundle} enemy={enemy} t={t} />
              </section>
            );
          })()}

          {enemies.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noEnemyChanges')}</p>
          ) : (
            <div className="overflow-x-auto overscroll-x-contain">
              <div className="grid min-w-[40rem] grid-cols-[5rem_1fr_6rem_6rem_6rem_8rem_6rem] gap-2 border-b border-slate-700 px-2 py-1 text-xs font-semibold uppercase text-slate-500">
                <span>{t('contribution.column.edit')}</span>
                <span>{t('contribution.column.id')}</span>
                <span>{t('contribution.column.attack')}</span>
                <span>{t('contribution.column.defense')}</span>
                <span>{t('contribution.column.health')}</span>
                <span>{t('contribution.column.ratePerMinute')}</span>
                <span>{t('contribution.column.remove')}</span>
              </div>
              {enemies.map((row) => {
                const enemy = row.item;
                const rowKey = enemyEditorKey(enemy.id);
                return (
                  <div className={`grid min-w-[40rem] grid-cols-[5rem_1fr_6rem_6rem_6rem_8rem_6rem] items-center gap-2 border-b border-slate-800 px-2 py-2 text-sm ${selectedEnemyKey === rowKey ? 'bg-slate-800/70' : 'bg-slate-950'}`} data-testid={`content-row-enemy-${enemy.id}`} key={rowKey}>
                    <button className="rounded border border-slate-600 px-2 py-1 text-xs font-semibold text-slate-100" onClick={() => setSelectedEnemyKey(rowKey)} type="button">{t('contribution.column.edit')}</button>
                    <span className="truncate text-slate-100">{enemy.id}</span>
                    <span className="text-slate-300">{getEnemyStat(enemy, 'attack')}</span>
                    <span className="text-slate-300">{getEnemyStat(enemy, 'defense')}</span>
                    <span className="text-slate-300">{getEnemyStat(enemy, 'health')}</span>
                    <span className="text-slate-300">{getEnemyStat(enemy, 'rate')}</span>
                    <button className={removeButtonClass} onClick={() => { if (selectedEnemyKey === rowKey) setSelectedEnemyKey(null); removeRow('enemies', row); }} type="button">{t('contribution.column.remove')}</button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === 'primitives' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.items')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="content-add-item" onClick={addItem} type="button">
              {t('contribution.data.addItem')}
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noItemChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {items.map((row) => (
                <div className="flex min-w-0 flex-wrap items-center gap-2 rounded bg-slate-950 p-2" data-testid={`content-row-item-${row.item.id}`} key={`${row.source}-${row.index}`}>
                  <div className="min-w-0 flex-1">
                    <StructuredDataEditor onChange={(value) => { if (value) updateItem(row, value as unknown as ItemDefinition); }} schema={itemDefinitionSchema()} t={t} value={row.item as unknown as StructuredValue} />
                  </div>
                  <button className={removeButtonClass} onClick={() => removeRow('items', row)} type="button">
                    {t('contribution.column.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}

        </section>
      )}

      {activeTab === 'primitives' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.flags')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="content-add-flag" onClick={addFlag} type="button">
              {t('contribution.data.addFlag')}
            </button>
          </div>
          {flags.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noFlagChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {flags.map((row) => (
                <div className="flex min-w-0 flex-wrap items-center gap-2 rounded bg-slate-950 p-2" data-testid={`content-row-flag-${row.item.id}`} key={`${row.source}-${row.index}`}>
                  <div className="min-w-0 flex-1">
                    <StructuredDataEditor onChange={(value) => { if (value) promote('flags', value as unknown as StateFlagDefinition, row.item.id); }} schema={flagDefinitionSchema()} t={t} value={row.item as unknown as StructuredValue} />
                  </div>
                  <button className={removeButtonClass} onClick={() => removeRow('flags', row)} type="button">{t('contribution.column.remove')}</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'resources' && (
        <section className="grid gap-4 rounded border border-slate-700 p-2">
          <section className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.resources')}</h3>
              <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="content-add-resource" onClick={addResource} type="button">{t('contribution.data.addResource')}</button>
            </div>
            {resources.map((row) => (
              <div className="grid gap-2 rounded bg-slate-950 p-2" data-testid={`content-row-resource-${row.item.id}`} key={stableEditorKey(resourceEditorKeys, 'resource', row.item.id)}>
                <StructuredDataEditor onChange={(value) => { if (value) updateResource(row, value as unknown as ResourceDefinition); }} schema={resourceDefinitionSchema(bundle)} t={t} value={row.item as unknown as StructuredValue} />
                <button className={`${removeButtonClass} justify-self-start`} onClick={() => removeResource(row)} type="button">{t('contribution.column.remove')}</button>
              </div>
            ))}
          </section>

          <section className="grid gap-2 border-t border-slate-700 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.effects')}</h3>
              <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="content-add-effect" onClick={addEffect} type="button">{t('contribution.data.addEffect')}</button>
            </div>
            {effects.map((row) => (
              <div className="grid gap-2 rounded bg-slate-950 p-2" data-testid={`content-row-effect-${row.item.id}`} key={stableEditorKey(effectEditorKeys, 'effect', row.item.id)}>
                <StructuredDataEditor onChange={(value) => { if (value) updateEffect(row, value as unknown as EffectDefinition); }} schema={effectDefinitionSchema(bundle)} t={t} value={row.item as unknown as StructuredValue} />
                <button className={`${removeButtonClass} justify-self-start`} onClick={() => removeRow('effects', row)} type="button">{t('contribution.column.remove')}</button>
              </div>
            ))}
          </section>

        </section>
      )}

      {activeTab === 'dsl' && (
        <section className="grid gap-3 rounded border border-slate-700 p-2" data-testid="content-dsl-editor">
          <label className="grid gap-1 text-sm text-slate-300">
            {t('contribution.dsl.selectModule', 'Mod')}
            <select
              className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100"
              data-testid="dsl-module-select"
              onChange={(event) => setSelectedDslModuleId(event.target.value)}
              value={activeDslModuleId ?? ''}
            >
              {dslModuleIds.map((moduleId) => (
                <option key={moduleId} value={moduleId}>
                  {moduleId}
                </option>
              ))}
            </select>
          </label>
          {activeDslModuleId && (
            <DslModuleEditor
              bundle={bundle}
              draft={draft}
              issues={issues}
              key={activeDslModuleId}
              moduleId={activeDslModuleId}
              onPatch={onPatch}
              t={t}
              universeId={bundle.manifest.id}
            />
          )}
        </section>
      )}

      {activeTab === 'json' && (
        <section className="grid gap-2 rounded border border-slate-700 p-2">
          <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.jsonFiles')}</h3>
          {jsonFiles.map((file) => (
            <details className="rounded bg-slate-950 p-2" data-testid={`content-json-file-${file.path}`} key={file.path}>
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">{file.path}</summary>
              <div className="mt-2">
                <button
                  className="mb-2 rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-100"
                  onClick={() => void navigator.clipboard.writeText(JSON.stringify(file.json, null, 2))}
                  type="button"
                >
                  {t('contribution.data.copyJson')}
                </button>
                <StructuredDataEditor onChange={file.onChange} schema={file.schema ?? { kind: 'inferred' }} t={t} value={file.json as unknown as StructuredValue} />
              </div>
            </details>
          ))}
        </section>
      )}

      <datalist id="content-location-ids">
        {bundle.locations.map((location) => (
          <option key={location.id} value={location.id} />
        ))}
      </datalist>
      <datalist id="content-skill-ids">
        {allSkills(bundle, draft).map((skill) => (
          <option key={skill.id} value={skill.id} />
        ))}
      </datalist>
      <datalist id="content-stat-ids">
        {allStats(bundle, draft).map((stat) => (
          <option key={stat.id} value={stat.id} />
        ))}
      </datalist>
      <datalist id="content-item-ids">
        {allItems(bundle, draft).map((item) => (
          <option key={item.id} value={item.id} />
        ))}
      </datalist>
      <datalist id="content-resource-ids">
        {bundle.resourceDefinitions.map((resource) => (
          <option key={resource.id} value={resource.id} />
        ))}
      </datalist>
      <datalist id="content-interaction-ids">
        {allInteractionTypes(bundle, draft).map((interactionType) => (
          <option key={interactionType.id} value={interactionType.id} />
        ))}
      </datalist>
      <datalist id="content-enemy-ids">
        {allEnemies(bundle, draft).map((enemy) => (
          <option key={enemy.id} value={enemy.id} />
        ))}
      </datalist>
    </section>
  );
};
