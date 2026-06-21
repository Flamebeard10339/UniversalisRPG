import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { edgeId, toKebabInput } from '../../game/contentIds';
import type { Translator } from '../../game/i18n';
import type { ActionResult, Condition, ContentBundle, ContributionDraft, ContributionRemovedIds, DeathResetPolicy, EffectDefinition, EnemyDefinition, GameAction, InteractionTypeDefinition, ItemDefinition, LocationNode, ResourceBoundaryBehavior, ResourceDefinition, Reward, SkillDefinition, StateFlagDefinition, TravelEdgeDefinition } from '../../game/types';
import { ContributionMapEditor } from './ContributionMapEditor';
import { EnemyDiagnostics } from './EnemyDiagnostics';

type ContentDataEditorProps = {
  baseBundle: ContentBundle;
  bundle: ContentBundle;
  draft: ContributionDraft;
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  t: Translator;
};

type ContentDataTab = 'map' | 'actions' | 'skills' | 'interactions' | 'enemies' | 'items' | 'resources' | 'json';
type DraftListKey = Exclude<keyof ContributionRemovedIds, 'resources'>;
type LayeredRow<T> = {
  index: number;
  item: T;
  source: 'draft' | 'base';
};
type RewardDraft = {
  kind: Reward['kind'];
  targetId: string;
  amount: string;
};

const contentTabs: ContentDataTab[] = ['map', 'actions', 'skills', 'interactions', 'enemies', 'items', 'resources', 'json'];

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
const allItems = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.items ?? []), ...draft.items]);
const allFlags = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.flags ?? []), ...draft.flags]);
const allInteractionTypes = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.interactionTypes ?? []), ...draft.interactionTypes]);
const allEnemies = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.enemies ?? []), ...draft.enemies]);
const defaultRewardDraft = (): RewardDraft => ({ kind: 'skillXp', targetId: '', amount: '1' });
const rewardTargetId = (reward: Reward) => reward.kind === 'skillXp'
  ? reward.skillId
  : reward.kind === 'item'
    ? reward.itemId
    : reward.resourceId;
const formatReward = (reward: Reward, t: Translator) => `${reward.kind === 'skillXp'
  ? t('contribution.reward.skillXp')
  : reward.kind === 'item'
    ? t('contribution.reward.item')
    : t('contribution.reward.resource')}: ${rewardTargetId(reward)} x${reward.amount}`;
type RewardListEditorProps = {
  draft: RewardDraft;
  label: string;
  onAdd: () => void;
  onActivate: () => void;
  onDraftChange: (patch: Partial<RewardDraft>) => void;
  onRemove: (index: number) => void;
  rewards: Reward[];
  showAdd: boolean;
  t: Translator;
};

type NestedListSectionProps = {
  children: ReactNode;
  label: string;
  onActivate: () => void;
};

type NumericEditorProps = {
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
};

const NumericEditor = ({ max, min = 0, onChange, step = 1, value }: NumericEditorProps) => {
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

const JsonEditor = <T,>({ label, onChange, value }: { label: string; onChange: (value: T | undefined) => void; value: T | undefined }) => {
  const [text, setText] = useState(value === undefined ? '' : JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(value === undefined ? '' : JSON.stringify(value, null, 2));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    if (!text.trim()) {
      setInvalid(false);
      onChange(undefined);
      return;
    }
    try {
      onChange(JSON.parse(text) as T);
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  };

  return (
    <label className="grid min-w-0 gap-1 text-xs text-slate-400">
      <span>{label}</span>
      <textarea
        aria-invalid={invalid}
        aria-label={label}
        className={`min-h-28 rounded border bg-slate-900 p-2 font-mono text-xs text-slate-100 ${invalid ? 'border-rose-500' : 'border-slate-800'}`}
        onBlur={commit}
        onChange={(event) => { setText(event.target.value); setInvalid(false); }}
        value={text}
      />
    </label>
  );
};

const NestedListSection = ({ children, label, onActivate }: NestedListSectionProps) => (
  <div className="ml-3 grid grid-cols-[5rem_1fr] gap-2" onFocusCapture={onActivate} onPointerDown={onActivate}>
    <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="grid gap-1 border-l border-slate-800 pl-3">{children}</div>
  </div>
);

const RewardListEditor = ({ draft, label, onAdd, onActivate, onDraftChange, onRemove, rewards, showAdd, t }: RewardListEditorProps) => (
  <NestedListSection label={label} onActivate={onActivate}>
    {showAdd && (
      <div className="grid gap-2 border-b border-slate-800 bg-slate-900/60 p-2 lg:grid-cols-[9rem_1fr_7rem_auto]">
        <select className="rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => onDraftChange({ kind: event.target.value as Reward['kind'], targetId: '' })} value={draft.kind}>
          <option value="skillXp">{t('contribution.reward.skillXp')}</option>
          <option value="item">{t('contribution.reward.item')}</option>
          <option value="resource">{t('contribution.reward.resource')}</option>
        </select>
        <input
          className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm"
          list={draft.kind === 'skillXp' ? 'content-skill-ids' : draft.kind === 'item' ? 'content-item-ids' : 'content-resource-ids'}
          onChange={(event) => onDraftChange({ targetId: toKebabInput(event.target.value) })}
          placeholder={draft.kind === 'skillXp' ? t('contribution.placeholder.skillId') : draft.kind === 'item' ? t('contribution.placeholder.itemId') : t('contribution.placeholder.resourceId')}
          value={draft.targetId}
        />
        <input className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="1" onChange={(event) => onDraftChange({ amount: event.target.value })} type="number" value={draft.amount} />
        <button className="rounded border border-slate-600 px-2 py-1.5 text-sm font-semibold text-slate-100" onClick={onAdd} type="button">
          {t('contribution.reward.add')}
        </button>
      </div>
    )}
    {rewards.length > 0 && (
      <div className="grid">
        {rewards.map((reward, rewardIndex) => (
          <button className="border-b border-slate-800 px-2 py-1.5 text-left text-xs text-slate-300 last:border-0 hover:bg-slate-900" key={`${reward.kind}-${rewardIndex}`} onClick={() => onRemove(rewardIndex)} type="button">
            {formatReward(reward, t)}
          </button>
        ))}
      </div>
    )}
  </NestedListSection>
);

export const ContentDataEditor = ({ baseBundle, bundle, draft, onPatch, t }: ContentDataEditorProps) => {
  const [activeTab, setActiveTab] = useState<ContentDataTab>('map');
  const [filter, setFilter] = useState('');
  const [rewardDrafts, setRewardDrafts] = useState<Record<string, RewardDraft>>({});
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
  const items = layeredRows(draft.items, baseBundle.items ?? [], removed.items, filter);
  const flags = layeredRows(draft.flags, baseBundle.flags ?? [], removed.flags, filter);
  const resources = layeredRows(draft.resourceDefinitions, baseBundle.resourceDefinitions ?? [], removed.resources, filter);
  const effects = layeredRows(draft.effects, baseBundle.effects ?? [], removed.effects, filter);
  const interactionTypes = layeredRows(draft.interactionTypes, baseBundle.interactionTypes ?? [], removed.interactionTypes, filter);
  const enemies = layeredRows(draft.enemies, baseBundle.enemies ?? [], removed.enemies, filter);
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

  const updateAction = (row: LayeredRow<GameAction>, patch: Partial<GameAction>) => {
    promote('actions', { ...row.item, ...patch }, row.item.id);
  };

  const updateSkill = (row: LayeredRow<SkillDefinition>, patch: Partial<SkillDefinition>) => {
    promote('skills', { ...row.item, ...patch }, row.item.id);
  };

  const updateItem = (row: LayeredRow<ItemDefinition>, patch: Partial<ItemDefinition>) => {
    promote('items', { ...row.item, ...patch }, row.item.id);
  };

  const updateFlag = (row: LayeredRow<StateFlagDefinition>, patch: Partial<StateFlagDefinition>) => {
    promote('flags', { ...row.item, ...patch }, row.item.id);
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

  const enemyEditorKey = (enemyId: string) => {
    enemyEditorKeys.current[enemyId] ??= `enemy-${Object.keys(enemyEditorKeys.current).length + 1}`;
    return enemyEditorKeys.current[enemyId];
  };

  const renameEnemyEditorState = (previousId: string, nextId: string) => {
    if (previousId === nextId) {
      return;
    }

    enemyEditorKeys.current[nextId] = enemyEditorKey(previousId);

    setRewardDrafts((current) => {
      if (!current[previousId]) {
        return current;
      }

      return {
        ...Object.fromEntries(Object.entries(current).filter(([ownerId]) => ownerId !== previousId)),
        [nextId]: current[previousId],
      };
    });
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

  const renameActionEditorState = (previousId: string, nextId: string) => {
    if (previousId === nextId) return;
    actionEditorKeys.current[nextId] = actionEditorKey(previousId);
    setRewardDrafts((current) => current[previousId]
      ? {
          ...Object.fromEntries(Object.entries(current).filter(([ownerId]) => ownerId !== previousId)),
          [nextId]: current[previousId],
        }
      : current);
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

  const addItem = () => {
    const id = uniqueId('new-item', items.map((row) => row.item.id));
    onPatch({ items: [{ id, initialQuantity: 0 }, ...draft.items] });
  };

  const addFlag = () => {
    const id = uniqueId('new-flag', flags.map((row) => row.item.id));
    onPatch({ flags: [{ id, initialValue: false }, ...draft.flags] });
  };

  const addResource = () => {
    const id = uniqueId('new-resource', resources.map((row) => row.item.id));
    onPatch({ resourceDefinitions: [{ id, minValue: 0, baseMaxValue: 100, initialValue: 100 }, ...draft.resourceDefinitions] });
  };

  const addEffect = () => {
    const id = uniqueId('new-effect', effects.map((row) => row.item.id));
    onPatch({
      effects: [{
        id,
        resourceId: resources[0]?.item.id ?? '',
        ratePerMinute: 0,
        source: 'player',
      }, ...draft.effects],
    });
  };

  const addInteractionType = () => {
    const id = uniqueId('new-interaction', interactionTypes.map((row) => row.item.id));
    const sourceSkillId = skills[0]?.item.id ?? '';
    const targetSkillId = skills[1]?.item.id ?? sourceSkillId;
    onPatch({ interactionTypes: [{ id, sourceSkillId, targetSkillId, targetPlayerHealth: false }, ...draft.interactionTypes] });
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
          attack: 10,
          defense: 10,
          health: 100,
          rate: 25,
          regeneration: 0,
          armorPenetration: 0,
          torpidity: 0,
          critChance: 0,
          critMultiplier: 2,
          showHealthBar: true,
          rewards: [],
        },
        ...draft.enemies,
      ],
    });
  };

  const updateRewardDraft = (ownerId: string, patch: Partial<RewardDraft>) => {
    setRewardDrafts((current) => ({
      ...current,
      [ownerId]: {
        ...defaultRewardDraft(),
        ...current[ownerId],
        ...patch,
      },
    }));
  };

  const addRewardToList = (ownerId: string, rewards: Reward[], onUpdate: (rewards: Reward[]) => void) => {
    const rewardDraft = rewardDrafts[ownerId] ?? defaultRewardDraft();
    const amount = Number(rewardDraft.amount);

    if (!rewardDraft.targetId || !Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const reward: Reward = rewardDraft.kind === 'skillXp'
      ? { kind: 'skillXp', skillId: rewardDraft.targetId, amount }
      : rewardDraft.kind === 'item'
        ? { kind: 'item', itemId: rewardDraft.targetId, amount }
        : { kind: 'resource', resourceId: rewardDraft.targetId, amount };

    onUpdate([...rewards, reward]);
    setRewardDrafts((current) => ({
      ...current,
      [ownerId]: { ...rewardDraft, targetId: '', amount: '1' },
    }));
  };

  const addActionReward = (row: LayeredRow<GameAction>) => {
    addRewardToList(row.item.id, row.item.rewards, (rewards) => updateAction(row, { rewards }));
  };

  const removeActionReward = (row: LayeredRow<GameAction>, rewardIndex: number) => {
    updateAction(row, { rewards: removeAt(row.item.rewards, rewardIndex) });
  };

  const addEnemyReward = (row: LayeredRow<EnemyDefinition>) => {
    addRewardToList(row.item.id, row.item.rewards, (rewards) => updateEnemy(row, { rewards }));
  };

  const removeEnemyReward = (row: LayeredRow<EnemyDefinition>, rewardIndex: number) => {
    updateEnemy(row, { rewards: removeAt(row.item.rewards, rewardIndex) });
  };

  const jsonFiles = [
    { path: 'locations.json', json: locations.map((row) => row.item) },
    { path: 'edges.json', json: edges.map((row) => row.item) },
    { path: 'actions.json', json: actions.map((row) => row.item) },
    { path: 'skills.json', json: skills.map((row) => row.item) },
    { path: 'items.json', json: items.map((row) => row.item) },
    { path: 'flags.json', json: flags.map((row) => row.item) },
    { path: 'resources.json', json: resources.map((row) => row.item) },
    { path: 'effects.json', json: effects.map((row) => row.item) },
    { path: 'universe.json', json: { deathReset: draft.deathReset ?? baseBundle.manifest.deathReset } },
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
                  <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1.2fr_7rem_7rem_1fr_5rem_6rem]" key={`${row.source}-${row.index}`}>
                    <input aria-label="Location id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateLocation(row, { id: toKebabInput(event.target.value) })} value={row.item.id} />
                    <input aria-label="Location x" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateLocation(row, { position: { ...row.item.position, x: Number(event.target.value) } })} type="number" value={Math.round(row.item.position.x)} />
                    <input aria-label="Location y" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateLocation(row, { position: { ...row.item.position, y: Number(event.target.value) } })} type="number" value={Math.round(row.item.position.y)} />
                    <input aria-label="Location tags" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateLocation(row, { tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} placeholder={t('contribution.placeholder.tags')} value={(row.item.tags ?? []).join(', ')} />
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input checked={Boolean(row.item.starting)} onChange={(event) => updateLocation(row, { starting: event.target.checked })} type="checkbox" />
                      <span className="lg:hidden">{t('contribution.column.start')}</span>
                    </label>
                    <button className={removeButtonClass} onClick={() => removeRow('locations', row)} type="button">
                      {t('contribution.column.remove')}
                    </button>
                  </div>
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
                  <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_1fr_1fr_8rem_6rem]" key={`${row.source}-${row.index}`}>
                    <input aria-label="Edge id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" readOnly value={row.item.id} />
                    <input aria-label="Edge source" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-location-ids" onChange={(event) => updateEdge(row, { source: toKebabInput(event.target.value) })} value={row.item.source} />
                    <input aria-label="Edge target" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-location-ids" onChange={(event) => updateEdge(row, { target: toKebabInput(event.target.value) })} value={row.item.target} />
                    <input aria-label="Edge duration" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="1" onChange={(event) => updateEdge(row, { travelTimeSeconds: Number(event.target.value) })} type="number" value={row.item.travelTimeSeconds} />
                    <button className={removeButtonClass} onClick={() => removeRow('edges', row)} type="button">
                      {t('contribution.column.remove')}
                    </button>
                  </div>
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
          <div className="hidden grid-cols-[1fr_1fr_7rem_1fr_6rem] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>{t('contribution.column.id')}</span>
            <span>{t('contribution.column.location')}</span>
            <span>{t('contribution.column.seconds')}</span>
            <span>{t('contribution.column.enemy')}</span>
            <span>{t('contribution.column.remove')}</span>
          </div>
          {actions.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noActionChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {actions.map((row) => {
                const action = row.item;
                const rewardDraft = rewardDrafts[action.id] ?? { kind: 'skillXp', targetId: '', amount: '1' };
                const selected = selectedActionId === action.id;

                return (
                  <div className="grid gap-2 rounded bg-slate-950 p-2" key={actionEditorKey(action.id)}>
                    <div className="grid gap-2 lg:grid-cols-[1fr_1fr_7rem_1fr_6rem]">
                      <input
                        aria-label="Action id"
                        className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm"
                        onChange={(event) => {
                          const nextId = toKebabInput(event.target.value);
                          renameActionEditorState(action.id, nextId);
                          setSelectedActionId(nextId);
                          updateAction(row, { id: nextId });
                        }}
                        onFocus={() => setSelectedActionId(action.id)}
                        value={action.id}
                      />
                      <input aria-label="Action location" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-location-ids" onChange={(event) => updateAction(row, { locationId: toKebabInput(event.target.value) })} onFocus={() => setSelectedActionId(action.id)} value={action.locationId} />
                      <input aria-label="Action duration" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="1" onChange={(event) => updateAction(row, { durationSeconds: Number(event.target.value) })} onFocus={() => setSelectedActionId(action.id)} type="number" value={action.durationSeconds} />
                      <input aria-label="Action enemy" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-enemy-ids" onChange={(event) => updateAction(row, { enemyId: toKebabInput(event.target.value) || undefined })} onFocus={() => setSelectedActionId(action.id)} value={action.enemyId ?? ''} />
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
                      <section className="grid gap-3 border-l border-slate-800 bg-slate-900/50 p-3 lg:grid-cols-2">
                        <label className="grid gap-1 text-xs text-slate-400">
                          <span>{t('contribution.column.maxCompletions')}</span>
                          <input
                            aria-label={t('contribution.column.maxCompletions')}
                            className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                            min="1"
                            onChange={(event) => updateAction(row, { maxCompletions: event.target.value ? Number(event.target.value) : undefined })}
                            type="number"
                            value={action.maxCompletions ?? ''}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-slate-400">
                          <span>{t('contribution.column.actionRole')}</span>
                          <select
                            className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                            onChange={(event) => updateAction(row, { role: (event.target.value || undefined) as GameAction['role'] })}
                            value={action.role ?? ''}
                          >
                            <option value="">{t('contribution.actionRole.unset')}</option>
                            <option value="optional">{t('contribution.actionRole.optional')}</option>
                            <option value="progression">{t('contribution.actionRole.progression')}</option>
                            <option value="utility">{t('contribution.actionRole.utility')}</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs text-slate-400 lg:col-span-2">
                          <span>{t('contribution.column.inventoryItem')}</span>
                          <input
                            className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                            list="content-item-ids"
                            onChange={(event) => updateAction(row, { inventoryItemId: toKebabInput(event.target.value) || undefined })}
                            value={action.inventoryItemId ?? ''}
                          />
                        </label>
                        <JsonEditor<Condition>
                          label={t('contribution.column.visibleWhen')}
                          onChange={(visibleWhen) => updateAction(row, { visibleWhen })}
                          value={action.visibleWhen}
                        />
                        <JsonEditor<Condition>
                          label={t('contribution.column.requirements')}
                          onChange={(requirements) => updateAction(row, { requirements })}
                          value={Array.isArray(action.requirements) ? undefined : action.requirements}
                        />
                        <div className="lg:col-span-2">
                          <JsonEditor<ActionResult[]>
                            label={t('contribution.column.results')}
                            onChange={(results) => updateAction(row, { results })}
                            value={action.results}
                          />
                        </div>
                      </section>
                    )}
                    {(selected || action.rewards.length > 0) && (
                      <RewardListEditor
                        draft={rewardDraft}
                        label={t('contribution.column.rewards')}
                        onAdd={() => addActionReward(row)}
                        onActivate={() => setSelectedActionId(action.id)}
                        onDraftChange={(patch) => updateRewardDraft(action.id, patch)}
                        onRemove={(rewardIndex) => removeActionReward(row, rewardIndex)}
                        rewards={action.rewards}
                        showAdd={selected}
                        t={t}
                      />
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
            <span>{t('contribution.column.sourceSkill')}</span>
            <span>{t('contribution.column.targetSkill')}</span>
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
                  <input aria-label="Interaction source skill" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-skill-ids" onChange={(event) => updateInteractionType(row, { sourceSkillId: toKebabInput(event.target.value) })} value={row.item.sourceSkillId} />
                  <input aria-label="Interaction target skill" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-skill-ids" onChange={(event) => updateInteractionType(row, { targetSkillId: toKebabInput(event.target.value) })} value={row.item.targetSkillId} />
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
            const rowKey = enemyEditorKey(enemy.id);
            const rewardDraft = rewardDrafts[enemy.id] ?? defaultRewardDraft();
            const numberField = (
              labelKey: string,
              value: number,
              patchKey: keyof EnemyDefinition,
              options: { min?: number; max?: number; step?: number } = {},
            ) => (
              <label className="grid gap-1 text-xs text-slate-400">
                <span>{t(labelKey)}</span>
                <NumericEditor
                  max={options.max}
                  min={options.min ?? 0}
                  onChange={(value) => updateEnemy(row, { [patchKey]: value })}
                  step={options.step ?? 1}
                  value={value}
                />
              </label>
            );

            return (
              <section className="grid gap-y-4 border-y border-slate-700 bg-slate-900 p-3 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(28rem,1.2fr)] xl:gap-x-8">
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
                  <div className="grid grid-cols-2 gap-2">
                    {numberField('contribution.column.attack', enemy.attack, 'attack', { min: 0.01 })}
                    {numberField('contribution.column.defense', enemy.defense, 'defense')}
                    {numberField('contribution.column.health', enemy.health, 'health', { min: 0.01 })}
                    {numberField('contribution.column.ratePerMinute', enemy.rate, 'rate')}
                    {numberField('contribution.column.regeneration', enemy.regeneration, 'regeneration', { step: 0.1 })}
                    {numberField('contribution.column.armorPenetration', enemy.armorPenetration, 'armorPenetration', { step: 0.1 })}
                    {numberField('contribution.column.torpidity', enemy.torpidity, 'torpidity', { step: 0.1 })}
                    {numberField('contribution.column.critChance', enemy.critChance, 'critChance', { max: 100, step: 0.1 })}
                    {numberField('contribution.column.critMultiplier', enemy.critMultiplier, 'critMultiplier', { min: 1, step: 0.1 })}
                  </div>
                  <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span>{t('contribution.column.showHealth')}</span>
                    <input checked={enemy.showHealthBar ?? true} onChange={(event) => updateEnemy(row, { showHealthBar: event.target.checked })} type="checkbox" />
                  </label>
                  <RewardListEditor
                    draft={rewardDraft}
                    label={t('contribution.column.rewards')}
                    onAdd={() => addEnemyReward(row)}
                    onActivate={() => setSelectedEnemyKey(rowKey)}
                    onDraftChange={(patch) => updateRewardDraft(enemy.id, patch)}
                    onRemove={(rewardIndex) => removeEnemyReward(row, rewardIndex)}
                    rewards={enemy.rewards}
                    showAdd
                    t={t}
                  />
                  <button className={`${removeButtonClass} justify-self-end`} onClick={() => { setSelectedEnemyKey(null); removeRow('enemies', row); }} type="button">
                    {t('contribution.column.remove')}
                  </button>
                </div>
                <EnemyDiagnostics enemy={enemy} t={t} />
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
                    <span className="text-slate-300">{enemy.attack}</span>
                    <span className="text-slate-300">{enemy.defense}</span>
                    <span className="text-slate-300">{enemy.health}</span>
                    <span className="text-slate-300">{enemy.rate}</span>
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
          <div className="hidden grid-cols-[1fr_8rem_8rem_6rem] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>{t('contribution.column.id')}</span>
            <span>{t('contribution.column.initialQuantity')}</span>
            <span>{t('contribution.column.maxQuantity')}</span>
            <span>{t('contribution.column.remove')}</span>
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noItemChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {items.map((row) => (
                <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_8rem_8rem_6rem]" key={`${row.source}-${row.index}`}>
                  <input aria-label="Item id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateItem(row, { id: toKebabInput(event.target.value) })} value={row.item.id} />
                  <input aria-label={t('contribution.column.initialQuantity')} className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="0" onChange={(event) => updateItem(row, { initialQuantity: Number(event.target.value) })} type="number" value={row.item.initialQuantity ?? 0} />
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
                <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_8rem_6rem]" key={`${row.source}-${row.index}`}>
                  <input aria-label={t('contribution.column.id')} className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateFlag(row, { id: toKebabInput(event.target.value) })} value={row.item.id} />
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input checked={row.item.initialValue ?? false} onChange={(event) => updateFlag(row, { initialValue: event.target.checked })} type="checkbox" />
                    {t('contribution.column.initialValue')}
                  </label>
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
                <div className="grid gap-2 lg:grid-cols-[1fr_7rem_7rem_7rem_6rem]">
                  <label className="grid gap-1 text-xs text-slate-400"><span>{t('contribution.column.id')}</span><input className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100" onChange={(event) => {
                    const id = toKebabInput(event.target.value);
                    renameStableEditorKey(resourceEditorKeys, 'resource', row.item.id, id);
                    updateResource(row, { id });
                  }} value={row.item.id} /></label>
                  <label className="grid gap-1 text-xs text-slate-400"><span>{t('contribution.column.minimum')}</span><NumericEditor min={-1000000} onChange={(minValue) => updateResource(row, { minValue })} value={row.item.minValue} /></label>
                  <label className="grid gap-1 text-xs text-slate-400"><span>{t('contribution.column.maximum')}</span><NumericEditor onChange={(baseMaxValue) => updateResource(row, { baseMaxValue })} value={row.item.baseMaxValue} /></label>
                  <label className="grid gap-1 text-xs text-slate-400"><span>{t('contribution.column.initialValue')}</span><NumericEditor min={-1000000} onChange={(initialValue) => updateResource(row, { initialValue })} value={row.item.initialValue ?? row.item.baseMaxValue} /></label>
                  <button className={`${removeButtonClass} self-end`} onClick={() => removeResource(row)} type="button">{t('contribution.column.remove')}</button>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  <JsonEditor<ResourceBoundaryBehavior[]> label={t('contribution.column.onEmpty')} onChange={(onEmpty) => updateResource(row, { onEmpty })} value={row.item.onEmpty} />
                  <JsonEditor<ResourceBoundaryBehavior[]> label={t('contribution.column.onFull')} onChange={(onFull) => updateResource(row, { onFull })} value={row.item.onFull} />
                </div>
              </div>
            ))}
          </section>

          <section className="grid gap-2 border-t border-slate-700 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.effects')}</h3>
              <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addEffect} type="button">{t('contribution.data.addEffect')}</button>
            </div>
            {effects.map((row) => (
              <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_1fr_8rem_8rem_1fr_6rem]" key={stableEditorKey(effectEditorKeys, 'effect', row.item.id)}>
                <label className="grid gap-1 text-xs text-slate-400"><span>{t('contribution.column.id')}</span><input className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100" onChange={(event) => {
                  const id = toKebabInput(event.target.value);
                  renameStableEditorKey(effectEditorKeys, 'effect', row.item.id, id);
                  updateEffect(row, { id });
                }} value={row.item.id} /></label>
                <label className="grid gap-1 text-xs text-slate-400"><span>{t('contribution.column.resource')}</span><input className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100" list="content-resource-ids" onChange={(event) => updateEffect(row, { resourceId: toKebabInput(event.target.value) })} value={row.item.resourceId} /></label>
                <label className="grid gap-1 text-xs text-slate-400"><span>{t('contribution.column.ratePerMinute')}</span><NumericEditor min={-1000000} onChange={(ratePerMinute) => updateEffect(row, { ratePerMinute })} step={0.1} value={row.item.ratePerMinute} /></label>
                <label className="grid gap-1 text-xs text-slate-400"><span>{t('contribution.column.source')}</span><select className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100" onChange={(event) => updateEffect(row, { source: event.target.value as EffectDefinition['source'] })} value={row.item.source}>
                  <option value="player">{t('contribution.effectSource.player')}</option>
                  <option value="location">{t('contribution.effectSource.location')}</option>
                </select></label>
                <label className="grid gap-1 text-xs text-slate-400"><span>{t('contribution.column.location')}</span><input className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100" disabled={row.item.source !== 'location'} list="content-location-ids" onChange={(event) => updateEffect(row, { locationId: toKebabInput(event.target.value) || undefined })} value={row.item.locationId ?? ''} /></label>
                <button className={`${removeButtonClass} self-end`} onClick={() => removeRow('effects', row)} type="button">{t('contribution.column.remove')}</button>
              </div>
            ))}
          </section>

          <section className="border-t border-slate-700 pt-4">
            <JsonEditor<DeathResetPolicy>
              label={t('contribution.column.deathReset')}
              onChange={(deathReset) => onPatch({ deathReset })}
              value={draft.deathReset ?? baseBundle.manifest.deathReset}
            />
          </section>
        </section>
      )}

      {activeTab === 'json' && (
        <section className="grid gap-2 rounded border border-slate-700 p-2">
          <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.jsonFiles')}</h3>
          {jsonFiles.map((file) => (
            <details className="rounded bg-slate-950 p-2" key={file.path}>
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">{file.path}</summary>
              <pre className="mt-2 max-h-80 overflow-auto text-xs text-slate-300">{JSON.stringify(file.json, null, 2)}</pre>
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

