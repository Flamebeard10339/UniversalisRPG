import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { edgeId, itemTitleKey, statTitleKey, toKebabInput } from '../../game/contentIds';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, ContributionRemovedIds, EffectDefinition, EnemyDefinition, EnemyStatKey, GameAction, InteractionTypeDefinition, ItemDefinition, LocationNode, ResourceDefinition, SkillDefinition, StatDefinition, StateFlagDefinition, TravelEdgeDefinition } from '../../game/types';
import { ContributionMapEditor } from './ContributionMapEditor';
import { EnemyDiagnostics } from './EnemyDiagnostics';
import { DEBUG_PLAYER_PROFILES, getProfileStatSummary, profileDescription, profileTitle } from '../../game/playerProfiles';
import { resolveCombatBalance } from '../../game/combatBalance';
import { ENEMY_STAT_DEFAULTS, ENEMY_STAT_KEYS, getEnemyStat, normalizeEnemyStats } from '../../game/enemies';
import { resolveUniverseUiSettings } from '../../game/universeSettings';
import { EdgeFields, LocationFields } from './MapContentFields';
import { StructuredDataDisplay, StructuredDataEditor, type StructuredValue } from '../structuredData/StructuredData';
import { actionSchema, effectDefinitionSchema, flagDefinitionSchema, resourceDefinitionSchema, rewardSchema, statDefinitionSchema } from '../structuredData/contentSchemas';

type ContentDataEditorProps = {
  baseBundle: ContentBundle;
  bundle: ContentBundle;
  draft: ContributionDraft;
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  t: Translator;
};

type ContentDataTab = 'universe' | 'map' | 'actions' | 'skills' | 'stats' | 'profiles' | 'interactions' | 'enemies' | 'items' | 'resources' | 'json';
type DraftListKey = Exclude<keyof ContributionRemovedIds, 'resources'>;
type LayeredRow<T> = {
  index: number;
  item: T;
  source: 'draft' | 'base';
};

const contentTabs: ContentDataTab[] = ['universe', 'map', 'actions', 'skills', 'stats', 'profiles', 'interactions', 'enemies', 'items', 'resources', 'json'];

const uniqueId = (baseId: string, existingIds: string[]) => {
  let index = 1;
  let nextId = baseId;

  while (existingIds.includes(nextId)) {
    index += 1;
    nextId = `${baseId}-${index}`;
  }

  return nextId;
};

const replaceAt = <T,>(items: T[], index: number, item: T) => items.map((candidate, candidateIndex) => (candidateIndex === index ? item : candidate));
const removeAt = <T,>(items: T[], index: number) => items.filter((_, candidateIndex) => candidateIndex !== index);
const upsertById = <T extends { id: string }>(items: T[], item: T) =>
  items.some((candidate) => candidate.id === item.id)
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [item, ...items];
const withoutId = <T extends { id: string }>(items: T[], id: string) => items.filter((item) => item.id !== id);
const uniqueStrings = (items: string[]) => Array.from(new Set(items));
const emptyRemoved = (): ContributionRemovedIds => ({
  locations: [],
  edges: [],
  actions: [],
  skills: [],
  stats: [],
  items: [],
  flags: [],
  resources: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
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
const allLocations = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...bundle.locations, ...draft.locations]);
const allSkills = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...bundle.skills, ...draft.skills]);
const allStats = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...bundle.stats, ...draft.stats]);
const allItems = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.items ?? []), ...draft.items]);
const allFlags = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.flags ?? []), ...draft.flags]);
const allInteractionTypes = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.interactionTypes ?? []), ...draft.interactionTypes]);
const allEnemies = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.enemies ?? []), ...draft.enemies]);

type NumericEditorProps = {
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  step?: number | 'any';
  value: number;
};

const NumericEditor = ({ max, min = 0, onChange, step = 'any', value }: NumericEditorProps) => {
  const [draftValue, setDraftValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraftValue(String(value));
    }
  }, [value]);

  return (
    <input
      className="rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
      max={max}
      min={min}
      onBlur={() => setDraftValue(String(value))}
      onChange={(event) => {
        const nextDraft = event.target.value;
        const nextValue = Number(nextDraft);
        setDraftValue(nextDraft);
        if (nextDraft !== '' && Number.isFinite(nextValue)) {
          onChange(nextValue);
        }
      }}
      ref={inputRef}
      step={step}
      type="number"
      value={draftValue}
    />
  );
};

type KeyValueRowsProps = {
  addLabel: string;
  createValue?: (key: string) => number;
  datalistId: string;
  keyLabel: string;
  labelForKey: (key: string) => string;
  onChange: (value: Record<string, number>) => void;
  validKeys: string[];
  value: Record<string, number>;
  valueLabel: string;
};

type KeyValueRow = {
  id: string;
  key: string;
  value: number;
};

const rowsFromRecord = (value: Record<string, number>): KeyValueRow[] =>
  Object.entries(value).map(([key, amount], index) => ({ id: `${key}-${index}`, key, value: amount }));

const KeyValueRows = ({ addLabel, createValue = () => 0, datalistId, keyLabel, labelForKey, onChange, validKeys, value, valueLabel }: KeyValueRowsProps) => {
  const valid = new Set(validKeys);
  const [rows, setRows] = useState<KeyValueRow[]>(() => rowsFromRecord(value));
  const internalChange = useRef(false);
  const nextRowId = useRef(rows.length + 1);
  const valueSignature = JSON.stringify(value);

  useEffect(() => {
    if (internalChange.current) {
      internalChange.current = false;
      return;
    }
    setRows(rowsFromRecord(value));
    nextRowId.current = Object.keys(value).length + 1;
  }, [valueSignature]);

  const emit = (nextRows: KeyValueRow[]) => {
    const seen = new Set<string>();
    const next: Record<string, number> = {};

    for (const row of nextRows) {
      if (!valid.has(row.key) || seen.has(row.key)) {
        continue;
      }
      seen.add(row.key);
      next[row.key] = row.value;
    }

    internalChange.current = true;
    onChange(next);
  };

  const updateRows = (nextRows: KeyValueRow[]) => {
    setRows(nextRows);
    emit(nextRows);
  };

  const updateKey = (rowId: string, nextKey: string) => {
    updateRows(rows.map((row) => row.id === rowId ? { ...row, key: nextKey } : row));
  };

  const updateValue = (rowId: string, nextValue: number) => {
    updateRows(rows.map((row) => row.id === rowId ? { ...row, value: nextValue } : row));
  };

  const removeRow = (rowId: string) => {
    updateRows(rows.filter((row) => row.id !== rowId));
  };

  const keyCounts = rows.reduce<Record<string, number>>((counts, row) => ({
    ...counts,
    [row.key]: (counts[row.key] ?? 0) + 1,
  }), {});
  const used = new Set(rows.filter((row) => valid.has(row.key)).map((row) => row.key));
  const available = validKeys.filter((key) => !used.has(key));

  return (
    <div className="grid gap-2">
      <div className="hidden grid-cols-[minmax(9rem,1fr)_8rem_4rem] gap-2 px-2 text-xs font-semibold uppercase text-slate-500 sm:grid">
        <span>{keyLabel}</span>
        <span>{valueLabel}</span>
        <span />
      </div>
      {rows.map((row) => {
        const invalid = !valid.has(row.key) || keyCounts[row.key] > 1;
        return (
        <div className={`grid gap-2 rounded p-2 sm:grid-cols-[minmax(9rem,1fr)_8rem_4rem] ${invalid ? 'bg-rose-950/70 ring-1 ring-rose-600' : 'bg-slate-950'}`} key={row.id}>
          <input
            className={`min-w-0 rounded px-2 py-1.5 text-sm text-slate-100 ${invalid ? 'bg-rose-950' : 'bg-slate-900'}`}
            list={datalistId}
            onChange={(event) => updateKey(row.id, event.target.value)}
            value={row.key}
          />
          <NumericEditor onChange={(nextValue) => updateValue(row.id, nextValue)} value={row.value} />
          <button className="rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200" onClick={() => removeRow(row.id)} type="button">
            -
          </button>
        </div>
        );
      })}
      {available.length > 0 && (
        <button
          className="justify-self-start rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
          onClick={() => {
            const key = available[0];
            updateRows([...rows, { id: `row-${nextRowId.current++}`, key, value: createValue(key) }]);
          }}
          type="button"
        >
          {addLabel}
        </button>
      )}
      <datalist id={datalistId}>
        {validKeys.map((key) => (
          <option key={key} label={labelForKey(key)} value={key} />
        ))}
      </datalist>
    </div>
  );
};

export const ContentDataEditor = ({ baseBundle, bundle, draft, onPatch, t }: ContentDataEditorProps) => {
  const [activeTab, setActiveTab] = useState<ContentDataTab>('map');
  const [filter, setFilter] = useState('');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const actionEditorKeys = useRef<Record<string, string>>({});
  const resourceEditorKeys = useRef<Record<string, string>>({});
  const effectEditorKeys = useRef<Record<string, string>>({});
  const [selectedEnemyKey, setSelectedEnemyKey] = useState<string | null>(null);
  const enemyEditorKeys = useRef<Record<string, string>>({});
  const removed = { ...emptyRemoved(), ...(draft.removed ?? {}) };
  const removeButtonClass = 'rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200';
  const locations = layeredRows(draft.locations, baseBundle.locations, removed.locations, filter);
  const edges = layeredRows(draft.edges, baseBundle.edges, removed.edges, filter);
  const actions = layeredRows(draft.actions, baseBundle.actions, removed.actions, filter);
  const skills = layeredRows(draft.skills, baseBundle.skills, removed.skills, filter);
  const stats = layeredRows(draft.stats, baseBundle.stats, removed.stats, filter);
  const items = layeredRows(draft.items, baseBundle.items ?? [], removed.items, filter);
  const flags = layeredRows(draft.flags, baseBundle.flags ?? [], removed.flags, filter);
  const resources = layeredRows(draft.resourceDefinitions, baseBundle.resourceDefinitions ?? [], removed.resources, filter);
  const effects = layeredRows(draft.effects, baseBundle.effects ?? [], removed.effects, filter);
  const interactionTypes = layeredRows(draft.interactionTypes, baseBundle.interactionTypes ?? [], removed.interactionTypes, filter);
  const enemies = layeredRows(draft.enemies, baseBundle.enemies ?? [], removed.enemies, filter);
  const basePlayer = draft.basePlayer ?? bundle.manifest.basePlayer ?? { stats: {}, inventory: {} };
  const combatBalance = resolveCombatBalance(draft.combatBalance ?? bundle.manifest.combatBalance);
  const uiSettings = resolveUniverseUiSettings(draft.ui ?? bundle.manifest.ui);
  const contributionBundle = {
    ...bundle,
    locations: locations.map((row) => row.item),
    edges: edges.map((row) => row.item),
  };

  const unremoveId = (key: DraftListKey, id: string) => ({
    ...removed,
    [key]: removed[key].filter((removedId) => removedId !== id),
  });

  const promote = <T extends { id: string }>(key: DraftListKey, item: T, originalId = item.id) => {
    onPatch({
      [key]: upsertById(withoutId(draft[key] as T[], originalId), item),
      removed: originalId === item.id ? unremoveId(key, item.id) : { ...unremoveId(key, item.id), [key]: uniqueStrings([...removed[key], originalId]) },
    });
  };

  const removeRow = <T extends { id: string }>(key: DraftListKey, row: LayeredRow<T>) => {
    if (row.source === 'draft') {
      onPatch({ [key]: removeAt(draft[key] as T[], row.index) });
      return;
    }

    onPatch({ removed: { ...removed, [key]: uniqueStrings([...removed[key], row.item.id]) } });
  };

  const updateLocation = (row: LayeredRow<LocationNode>, patch: Partial<LocationNode>) => {
    promote('locations', { ...row.item, ...patch }, row.item.id);
  };

  const updateEdge = (row: LayeredRow<TravelEdgeDefinition>, patch: Partial<TravelEdgeDefinition>) => {
    const edge = { ...row.item, ...patch };
    const nextEdge = patch.source || patch.target ? { ...edge, id: edgeId(edge.source, edge.target) } : edge;
    promote('edges', nextEdge, row.item.id);
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
    onPatch({
      resourceDefinitions: upsertById(withoutId(draft.resourceDefinitions, row.item.id), item),
      removed: row.item.id === item.id
        ? { ...removed, resources: removed.resources.filter((id) => id !== item.id) }
        : { ...removed, resources: uniqueStrings([...removed.resources.filter((id) => id !== item.id), row.item.id]) },
    });
  };

  const removeResource = (row: LayeredRow<ResourceDefinition>) => {
    if (row.source === 'draft') {
      onPatch({ resourceDefinitions: removeAt(draft.resourceDefinitions, row.index) });
    } else {
      onPatch({ removed: { ...removed, resources: uniqueStrings([...removed.resources, row.item.id]) } });
    }
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

  const updateCombatBalance = (patch: Partial<typeof combatBalance>) => {
    onPatch({ combatBalance: resolveCombatBalance({ ...combatBalance, ...patch }) });
  };

  const updateUiSettings = (patch: Partial<typeof uiSettings>) => {
    onPatch({ ui: resolveUniverseUiSettings({ ...uiSettings, ...patch }) });
  };

  const updateBasePlayerStats = (stats: Record<string, number>) => {
    const valid = new Set(allStats(bundle, draft).map((stat) => stat.id));
    onPatch({ basePlayer: { ...basePlayer, stats: Object.fromEntries(Object.entries(stats).filter(([key]) => valid.has(key))) } });
  };

  const updateBasePlayerInventory = (inventory: Record<string, number>) => {
    const valid = new Set(allItems(bundle, draft).map((item) => item.id));
    onPatch({ basePlayer: { ...basePlayer, inventory: Object.fromEntries(Object.entries(inventory).filter(([key, amount]) => valid.has(key) && amount >= 0)) } });
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
    onPatch({
      locations: [
        {
          id,
          position: { x: 80 + allLocationItems.length * 80, y: 320 },
          tags: ['community'],
        },
        ...draft.locations,
      ],
    });
  };

  const addEdge = () => {
    const locationItems = locations.map((row) => row.item);
    const edgeItems = edges.map((row) => row.item);
    const source = locationItems[0]?.id ?? '';
    const target = locationItems.find((location) => location.id !== source)?.id ?? '';

    if (!source || !target) {
      return;
    }

    const id = edgeId(source, target);
    if (edgeItems.some((edge) => edge.id === id)) {
      return;
    }

    onPatch({ edges: [{ id, source, target, travelTimeSeconds: 15 }, ...draft.edges] });
  };

  const addAction = () => {
    const allActionItems = actions.map((row) => row.item);
    const id = uniqueId('new-action', allActionItems.map((action) => action.id));
    setSelectedActionId(id);
    onPatch({
      actions: [
        {
          id,
          locationId: locations[0]?.item.id ?? '',
          durationSeconds: 10,
          rewards: [],
        },
        ...draft.actions,
      ],
    });
  };

  const addSkill = () => {
    const id = uniqueId('new-skill', skills.map((row) => row.item.id));
    onPatch({ skills: [{ id, maxLevel: 100 }, ...draft.skills] });
  };

  const addStat = () => {
    const id = uniqueId('new-stat', stats.map((row) => row.item.id));
    onPatch({ stats: [{ id, base: 0 }, ...draft.stats] });
  };

  const addItem = () => {
    const id = uniqueId('new-item', items.map((row) => row.item.id));
    onPatch({ items: [{ id }, ...draft.items] });
  };

  const addFlag = () => {
    const id = uniqueId('new-flag', flags.map((row) => row.item.id));
    onPatch({ flags: [{ id, initialValue: false }, ...draft.flags] });
  };

  const addResource = () => {
    const id = uniqueId('new-resource', resources.map((row) => row.item.id));
    onPatch({ resourceDefinitions: [{ id, sourceStat: stats[0]?.item.id ?? '', initialValue: 'full' }, ...draft.resourceDefinitions] });
  };

  const addEffect = () => {
    const id = uniqueId('new-effect', effects.map((row) => row.item.id));
    onPatch({
      effects: [{
        id,
        resourceId: resources[0]?.item.id ?? '',
        sourceStat: stats[0]?.item.id ?? '',
      }, ...draft.effects],
    });
  };

  const addInteractionType = () => {
    const id = uniqueId('new-interaction', interactionTypes.map((row) => row.item.id));
    const sourceStatId = stats[0]?.item.id ?? '';
    const targetStatId = stats[1]?.item.id ?? sourceStatId;
    onPatch({ interactionTypes: [{ id, sourceStatId, targetStatId, targetPlayerHealth: false }, ...draft.interactionTypes] });
  };

  const addEnemy = () => {
    const id = uniqueId('new-enemy', enemies.map((row) => row.item.id));
    const interactionTypeId = interactionTypes[0]?.item.id ?? '';
    setSelectedEnemyKey(enemyEditorKey(id));
    onPatch({
      enemies: [
        {
          id,
          interactionTypeId,
          stats: {
            attack: 10,
            defense: 10,
            rate: 25,
          },
          showHealthBar: true,
          rewards: [],
        },
        ...draft.enemies,
      ],
    });
  };

  const jsonFiles = [
    { path: 'universe.json', json: { ...bundle.manifest, basePlayer, combatBalance, ui: uiSettings } },
    { path: 'locations.json', json: locations.map((row) => row.item) },
    { path: 'edges.json', json: edges.map((row) => row.item) },
    { path: 'actions.json', json: actions.map((row) => row.item) },
    { path: 'skills.json', json: skills.map((row) => row.item) },
    { path: 'stats.json', json: stats.map((row) => row.item) },
    { path: 'items.json', json: items.map((row) => row.item) },
    { path: 'flags.json', json: flags.map((row) => row.item) },
    { path: 'resources.json', json: resources.map((row) => row.item) },
    { path: 'effects.json', json: effects.map((row) => row.item) },
    { path: 'interaction-types.json', json: interactionTypes.map((row) => row.item) },
    { path: 'enemies.json', json: enemies.map((row) => row.item) },
    { path: 'removed.json', json: draft.removed },
    { path: 'locales.json', json: draft.locales },
  ];

  return (
    <section className="grid gap-3">
      <div className="flex gap-2 overflow-x-auto rounded border border-slate-800 bg-slate-900 p-2">
        {contentTabs.map((tab) => (
          <button
            className={`min-w-28 flex-1 rounded px-3 py-2 text-sm font-semibold capitalize ${
              activeTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-950 text-slate-300'
            }`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {t(`contribution.tab.${tab}`)}
          </button>
        ))}
      </div>

      <input
        className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100"
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
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-slate-400">
              <span>{t('contribution.universe.expectedHitsToKill')}</span>
              <NumericEditor
                min={0.000001}
                onChange={(value) => updateCombatBalance({ expectedHitsToKill: value })}
                step={0.000001}
                value={combatBalance.expectedHitsToKill}
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              <span>{t('contribution.universe.combatSpread')}</span>
              <NumericEditor
                min={0}
                onChange={(value) => updateCombatBalance({ combatSpread: value })}
                step={0.01}
                value={combatBalance.combatSpread}
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              <span>{t('contribution.universe.floatingTextDuration')}</span>
              <NumericEditor
                min={0.001}
                onChange={(value) => updateUiSettings({ floatingTextDurationSeconds: value })}
                step={0.1}
                value={uiSettings.floatingTextDurationSeconds}
              />
            </label>
          </div>
          <section className="grid gap-2 border-t border-slate-700 pt-3">
            <h4 className="text-sm font-semibold text-slate-100">{t('contribution.universe.baseStats')}</h4>
            <KeyValueRows
              addLabel={t('contribution.universe.addBaseStat')}
              datalistId="base-player-stat-keys"
              keyLabel={t('contribution.column.stat')}
              labelForKey={(key) => t(statTitleKey(key), key)}
              onChange={updateBasePlayerStats}
              validKeys={stats.map((row) => row.item.id)}
              value={basePlayer.stats ?? {}}
              valueLabel={t('structured.value')}
            />
          </section>
          <section className="grid gap-2 border-t border-slate-700 pt-3">
            <h4 className="text-sm font-semibold text-slate-100">{t('contribution.universe.baseInventory')}</h4>
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">{t('inventory.empty')}</p>
            ) : (
              <KeyValueRows
                addLabel={t('contribution.universe.addBaseInventory')}
                datalistId="base-player-inventory-keys"
                keyLabel={t('contribution.column.inventoryItem')}
                labelForKey={(key) => t(itemTitleKey(key), key)}
                onChange={updateBasePlayerInventory}
                validKeys={items.map((row) => row.item.id)}
                value={basePlayer.inventory ?? {}}
                valueLabel={t('structured.value')}
              />
            )}
          </section>
        </section>
      )}

      {activeTab === 'map' && (
        <section className="grid gap-2">
          <ContributionMapEditor
            bundle={contributionBundle}
            onEdgesChange={(edges) => onPatch({ edges })}
            onLocationsChange={(locations) => onPatch({ locations })}
            t={t}
          />

          <div className="grid gap-1 rounded border border-slate-700 p-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.locations')}</h3>
              <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addLocation} type="button">
                {t('contribution.data.addLocation')}
              </button>
            </div>
            <div className="hidden grid-cols-[1.2fr_7rem_7rem_1fr_5rem_6rem] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
              <span>{t('contribution.column.id')}</span>
              <span>{t('contribution.column.x')}</span>
              <span>{t('contribution.column.y')}</span>
              <span>{t('contribution.column.tags')}</span>
              <span>{t('contribution.column.start')}</span>
              <span>{t('contribution.column.remove')}</span>
            </div>
            {locations.length === 0 ? (
              <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noLocationChanges')}</p>
            ) : (
              <div className="grid gap-1">
                {locations.map((row) => (
                  <LocationFields key={`${row.source}-${row.index}`} location={row.item} onChange={(location) => updateLocation(row, location)} onRemove={() => removeRow('locations', row)} t={t} />
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-1 rounded border border-slate-700 p-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.edges')}</h3>
              <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addEdge} type="button">
                {t('contribution.data.addEdge')}
              </button>
            </div>
            <div className="hidden grid-cols-[1fr_1fr_1fr_8rem_6rem] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
              <span>{t('contribution.column.id')}</span>
              <span>{t('contribution.column.source')}</span>
              <span>{t('contribution.column.target')}</span>
              <span>{t('contribution.column.seconds')}</span>
              <span>{t('contribution.column.remove')}</span>
            </div>
            {edges.length === 0 ? (
              <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noEdgeChanges')}</p>
            ) : (
              <div className="grid gap-1">
                {edges.map((row) => (
                  <EdgeFields bundle={bundle} edge={row.item} key={`${row.source}-${row.index}`} onChange={(edge) => updateEdge(row, edge)} onRemove={() => removeRow('edges', row)} t={t} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'actions' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.actions')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addAction} type="button">
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
                  <div className="grid gap-2 rounded bg-slate-950 p-2" key={actionEditorKey(action.id)}>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <button className="min-w-0 rounded bg-slate-900 px-3 py-2 text-left" onClick={() => setSelectedActionId(selected ? null : action.id)} type="button">
                        <span className="block truncate text-sm font-semibold text-slate-100">{action.id}</span>
                        <span className="block truncate text-xs text-slate-400">{action.locationId} · {action.durationSeconds}s</span>
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

      {activeTab === 'skills' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.skills')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addSkill} type="button">
              {t('contribution.data.addSkill')}
            </button>
          </div>
          <div className="hidden grid-cols-[1fr_8rem_6rem] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>{t('contribution.column.id')}</span>
            <span>{t('contribution.column.maxLevel')}</span>
            <span>{t('contribution.column.remove')}</span>
          </div>
          {skills.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noSkillChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {skills.map((row) => (
                <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_8rem_6rem]" key={`${row.source}-${row.index}`}>
                  <input aria-label="Skill id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateSkill(row, { id: toKebabInput(event.target.value) })} value={row.item.id} />
                  <input aria-label="Skill max level" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="1" onChange={(event) => updateSkill(row, { maxLevel: Number(event.target.value) })} type="number" value={row.item.maxLevel} />
                  <button className={removeButtonClass} onClick={() => removeRow('skills', row)} type="button">
                    {t('contribution.column.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'stats' && (
        <section className="grid gap-2 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.stats')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addStat} type="button">
              {t('contribution.data.addStat')}
            </button>
          </div>
          {stats.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noStatChanges')}</p>
          ) : (
            <div className="grid gap-2">
              {stats.map((row) => (
                <div className="flex flex-wrap items-start gap-2 rounded bg-slate-950 p-2" key={`${row.source}-${row.index}`}>
                  <div className="min-w-0 flex-1">
                    <StructuredDataEditor label="contribution.data.statFields" onChange={(value) => { if (value) updateStat(row, value as unknown as StatDefinition); }} schema={statDefinitionSchema(bundle)} t={t} value={row.item as unknown as StructuredValue} />
                  </div>
                  <button className={removeButtonClass} onClick={() => removeRow('stats', row)} type="button">{t('contribution.column.remove')}</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'profiles' && (
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

      {activeTab === 'interactions' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.interactions')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addInteractionType} type="button">
              {t('contribution.data.addInteraction')}
            </button>
          </div>
          <div className="hidden grid-cols-[1fr_1fr_1fr_8rem_6rem] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>{t('contribution.column.id')}</span>
            <span>{t('contribution.column.sourceStat')}</span>
            <span>{t('contribution.column.targetStat')}</span>
            <span>{t('contribution.column.targetPlayerHealth')}</span>
            <span>{t('contribution.column.remove')}</span>
          </div>
          {interactionTypes.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noInteractionChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {interactionTypes.map((row) => (
                <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_1fr_1fr_8rem_6rem]" key={`${row.source}-${row.index}`}>
                  <input aria-label="Interaction id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateInteractionType(row, { id: toKebabInput(event.target.value) })} value={row.item.id} />
                  <input aria-label="Interaction source stat" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-stat-ids" onChange={(event) => updateInteractionType(row, { sourceStatId: toKebabInput(event.target.value) })} value={row.item.sourceStatId} />
                  <input aria-label="Interaction target stat" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-stat-ids" onChange={(event) => updateInteractionType(row, { targetStatId: toKebabInput(event.target.value) })} value={row.item.targetStatId} />
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input checked={row.item.targetPlayerHealth} onChange={(event) => updateInteractionType(row, { targetPlayerHealth: event.target.checked })} type="checkbox" />
                    <span className="lg:hidden">{t('contribution.column.targetPlayerHealth')}</span>
                  </label>
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
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addEnemy} type="button">
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
                    <KeyValueRows
                      addLabel={t('contribution.enemyStats.add')}
                      createValue={(key) => (ENEMY_STAT_DEFAULTS[key as EnemyStatKey] ?? 0) + 1}
                      datalistId="enemy-stat-keys"
                      keyLabel={t('contribution.column.stat')}
                      labelForKey={(key) => t(`contribution.enemyStats.${key}`, key)}
                      onChange={(value) => updateEnemyStats(row, value)}
                      validKeys={[...ENEMY_STAT_KEYS]}
                      value={enemy.stats ?? {}}
                      valueLabel={t('structured.value')}
                    />
                  </section>
                  <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span>{t('contribution.column.showHealth')}</span>
                    <input checked={enemy.showHealthBar ?? true} onChange={(event) => updateEnemy(row, { showHealthBar: event.target.checked })} type="checkbox" />
                  </label>
                  <StructuredDataEditor label="contribution.column.rewards" onChange={(value) => updateEnemy(row, { rewards: (value ?? []) as unknown as EnemyDefinition['rewards'] })} schema={{ kind: 'array', item: rewardSchema(bundle), createItem: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', amount: 1 }) }} t={t} value={enemy.rewards as unknown as StructuredValue} />
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
                  <div className={`grid min-w-[40rem] grid-cols-[5rem_1fr_6rem_6rem_6rem_8rem_6rem] items-center gap-2 border-b border-slate-800 px-2 py-2 text-sm ${selectedEnemyKey === rowKey ? 'bg-slate-800/70' : 'bg-slate-950'}`} key={rowKey}>
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

      {activeTab === 'items' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.items')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addItem} type="button">
              {t('contribution.data.addItem')}
            </button>
          </div>
          <div className="hidden grid-cols-[1fr_8rem_6rem] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>{t('contribution.column.id')}</span>
            <span>{t('contribution.column.maxQuantity')}</span>
            <span>{t('contribution.column.remove')}</span>
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noItemChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {items.map((row) => (
                <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_8rem_6rem]" key={`${row.source}-${row.index}`}>
                  <input aria-label="Item id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateItem(row, { id: toKebabInput(event.target.value) })} value={row.item.id} />
                  <input aria-label={t('contribution.column.maxQuantity')} className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="1" onChange={(event) => updateItem(row, { maxQuantity: event.target.value ? Number(event.target.value) : undefined })} type="number" value={row.item.maxQuantity ?? ''} />
                  <button className={removeButtonClass} onClick={() => removeRow('items', row)} type="button">
                    {t('contribution.column.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-700 pt-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.flags')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addFlag} type="button">
              {t('contribution.data.addFlag')}
            </button>
          </div>
          {flags.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noFlagChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {flags.map((row) => (
                <div className="grid gap-2 rounded bg-slate-950 p-2" key={`${row.source}-${row.index}`}>
                  <StructuredDataEditor onChange={(value) => { if (value) promote('flags', value as unknown as StateFlagDefinition, row.item.id); }} schema={flagDefinitionSchema()} t={t} value={row.item as unknown as StructuredValue} />
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
              <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addResource} type="button">{t('contribution.data.addResource')}</button>
            </div>
            {resources.map((row) => (
              <div className="grid gap-2 rounded bg-slate-950 p-2" key={stableEditorKey(resourceEditorKeys, 'resource', row.item.id)}>
                <StructuredDataEditor onChange={(value) => { if (value) updateResource(row, value as unknown as ResourceDefinition); }} schema={resourceDefinitionSchema(bundle)} t={t} value={row.item as unknown as StructuredValue} />
                <button className={`${removeButtonClass} justify-self-start`} onClick={() => removeResource(row)} type="button">{t('contribution.column.remove')}</button>
              </div>
            ))}
          </section>

          <section className="grid gap-2 border-t border-slate-700 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.effects')}</h3>
              <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addEffect} type="button">{t('contribution.data.addEffect')}</button>
            </div>
            {effects.map((row) => (
              <div className="grid gap-2 rounded bg-slate-950 p-2" key={stableEditorKey(effectEditorKeys, 'effect', row.item.id)}>
                <StructuredDataEditor onChange={(value) => { if (value) updateEffect(row, value as unknown as EffectDefinition); }} schema={effectDefinitionSchema(bundle)} t={t} value={row.item as unknown as StructuredValue} />
                <button className={`${removeButtonClass} justify-self-start`} onClick={() => removeRow('effects', row)} type="button">{t('contribution.column.remove')}</button>
              </div>
            ))}
          </section>

        </section>
      )}

      {activeTab === 'json' && (
        <section className="grid gap-2 rounded border border-slate-700 p-2">
          <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.jsonFiles')}</h3>
          {jsonFiles.map((file) => (
            <details className="rounded bg-slate-950 p-2" key={file.path}>
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">{file.path}</summary>
              <div className="mt-2"><StructuredDataDisplay t={t} value={file.json as unknown as StructuredValue} /></div>
            </details>
          ))}
        </section>
      )}

      <datalist id="content-location-ids">
        {allLocations(bundle, draft).map((location) => (
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

