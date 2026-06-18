import { useState, type ReactNode } from 'react';
import { edgeId, toKebabInput } from '../../game/contentIds';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, ContributionRemovedIds, EnemyDefinition, GameAction, InteractionTypeDefinition, ItemDefinition, LocationNode, Reward, SkillDefinition, SkillEquipmentBonuses, TravelEdgeDefinition } from '../../game/types';
import { ContributionMapEditor } from './ContributionMapEditor';

type ContentDataEditorProps = {
  baseBundle: ContentBundle;
  bundle: ContentBundle;
  draft: ContributionDraft;
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  t: Translator;
};

type ContentDataTab = 'map' | 'actions' | 'skills' | 'interactions' | 'enemies' | 'items' | 'json';
type DraftListKey = Exclude<keyof ContributionRemovedIds, never>;
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

const contentTabs: ContentDataTab[] = ['map', 'actions', 'skills', 'interactions', 'enemies', 'items', 'json'];

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
const allInteractionTypes = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.interactionTypes ?? []), ...draft.interactionTypes]);
const allEnemies = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.enemies ?? []), ...draft.enemies]);
const defaultRewardDraft = (): RewardDraft => ({ kind: 'skillXp', targetId: '', amount: '1' });
const defaultEnemySkillStats = (): SkillEquipmentBonuses => ({ base: 1, added: 0, increased: 0, imprecision: 70 });
const rewardTargetId = (reward: Reward) => reward.kind === 'skillXp' ? reward.skillId : reward.resourceId;
const formatReward = (reward: Reward, t: Translator) => `${reward.kind === 'skillXp' ? t('contribution.reward.skillXp') : t('contribution.reward.item')}: ${rewardTargetId(reward)} x${reward.amount}`;
const numberOrUndefined = (value: string) => {
  if (value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

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
          <option value="resource">{t('contribution.reward.item')}</option>
        </select>
        <input
          className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm"
          list={draft.kind === 'skillXp' ? 'content-skill-ids' : 'content-item-ids'}
          onChange={(event) => onDraftChange({ targetId: toKebabInput(event.target.value) })}
          placeholder={draft.kind === 'skillXp' ? t('contribution.placeholder.skillId') : t('contribution.placeholder.itemId')}
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
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  const removed = draft.removed;
  const removeButtonClass = 'rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200';
  const locations = layeredRows(draft.locations, baseBundle.locations, removed.locations, filter);
  const edges = layeredRows(draft.edges, baseBundle.edges, removed.edges, filter);
  const actions = layeredRows(draft.actions, baseBundle.actions, removed.actions, filter);
  const skills = layeredRows(draft.skills, baseBundle.skills, removed.skills, filter);
  const items = layeredRows(draft.items, baseBundle.items ?? [], removed.items, filter);
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

  const updateInteractionType = (row: LayeredRow<InteractionTypeDefinition>, patch: Partial<InteractionTypeDefinition>) => {
    promote('interactionTypes', { ...row.item, ...patch }, row.item.id);
  };

  const updateEnemy = (row: LayeredRow<EnemyDefinition>, patch: Partial<EnemyDefinition>) => {
    promote('enemies', { ...row.item, ...patch }, row.item.id);
  };

  const enemySkillRowsForInteraction = (interactionTypeId: string, currentSkills: EnemyDefinition['skills']) => {
    const interactionType = allInteractionTypes(bundle, draft).find((candidate) => candidate.id === interactionTypeId);
    const skillIds = interactionType
      ? Array.from(new Set([interactionType.sourceSkillId, interactionType.targetSkillId].filter(Boolean)))
      : Object.keys(currentSkills);

    return skillIds.map((skillId) => {
      const { rate: _rate, ...currentStats } = currentSkills[skillId] ?? {};

      return {
        skillId,
        stats: {
          ...defaultEnemySkillStats(),
          ...currentStats,
          added: 0,
          increased: 0,
        },
      };
    });
  };

  const skillsForInteraction = (interactionTypeId: string, currentSkills: EnemyDefinition['skills']) =>
    Object.fromEntries(
      enemySkillRowsForInteraction(interactionTypeId, currentSkills).map(({ skillId, stats }) => [skillId, stats]),
    );

  const updateEnemyInteraction = (row: LayeredRow<EnemyDefinition>, interactionTypeId: string) => {
    updateEnemy(row, {
      interactionTypeId,
      skills: skillsForInteraction(interactionTypeId, row.item.skills),
    });
  };

  const renameEnemyEditorState = (previousId: string, nextId: string) => {
    if (previousId === nextId) {
      return;
    }

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
    onPatch({ items: [{ id }, ...draft.items] });
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
    setSelectedEnemyId(id);
    onPatch({
      enemies: [
        {
          id,
          interactionTypeId,
          health: 10,
          rate: 0,
          skills: skillsForInteraction(interactionTypeId, {}),
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
      : { kind: 'resource', resourceId: rewardDraft.targetId, amount };

    onUpdate([...rewards, reward]);
    setRewardDrafts((current) => ({
      ...current,
      [ownerId]: { ...rewardDraft, targetId: '', amount: '1' },
    }));
  };

  const updateEnemySkillStat = (row: LayeredRow<EnemyDefinition>, skillId: string, patch: Partial<SkillEquipmentBonuses>) => {
    const { rate: _rate, ...currentStats } = row.item.skills[skillId] ?? {};
    updateEnemy(row, {
      skills: {
        ...row.item.skills,
        [skillId]: {
          ...currentStats,
          ...patch,
          added: 0,
          increased: 0,
        },
      },
    });
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
    { path: 'interaction-types.json', json: interactionTypes.map((row) => row.item) },
    { path: 'enemies.json', json: enemies.map((row) => row.item) },
    { path: 'removed.json', json: draft.removed },
    { path: 'locales.json', json: draft.locales },
  ];

  return (
    <section className="grid gap-3">
      <div className="grid grid-cols-7 gap-2 rounded border border-slate-800 bg-slate-900 p-2">
        {contentTabs.map((tab) => (
          <button
            className={`rounded px-3 py-2 text-sm font-semibold capitalize ${
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
                  <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1.2fr_7rem_7rem_1fr_5rem_6rem]" key={`${row.source}-${row.item.id}-${row.index}`}>
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
                  <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_1fr_1fr_8rem_6rem]" key={`${row.source}-${row.item.id}-${row.index}`}>
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
                  <div className="grid gap-1 rounded bg-slate-950 p-2" key={`action-row-${row.source}-${action.id}-${row.index}`}>
                    <div className="grid gap-2 lg:grid-cols-[1fr_1fr_7rem_1fr_6rem]">
                      <input
                        aria-label="Action id"
                        className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm"
                        onChange={(event) => {
                          const nextId = toKebabInput(event.target.value);
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
                <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_8rem_6rem]" key={`${row.source}-${row.item.id}-${row.index}`}>
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
                <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_1fr_1fr_8rem_6rem]" key={`${row.source}-${row.item.id}-${row.index}`}>
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
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.enemies')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addEnemy} type="button">
              {t('contribution.data.addEnemy')}
            </button>
          </div>
          <div className="hidden grid-cols-[1fr_1fr_7rem_7rem_6rem] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>{t('contribution.column.id')}</span>
            <span>{t('contribution.column.interaction')}</span>
            <span>{t('contribution.column.health')}</span>
            <span>{t('contribution.column.ratePerMinute')}</span>
            <span>{t('contribution.column.remove')}</span>
          </div>
          {enemies.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noEnemyChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {enemies.map((row) => {
                const enemy = row.item;
                const rewardDraft = rewardDrafts[enemy.id] ?? defaultRewardDraft();
                const selected = selectedEnemyId === enemy.id;
                const skillEntries = enemySkillRowsForInteraction(enemy.interactionTypeId, enemy.skills);

                return (
                  <div className="grid gap-2 rounded bg-slate-950 p-2" key={`enemy-row-${row.source}-${enemy.id}-${row.index}`}>
                    <div className="grid gap-2 lg:grid-cols-[1fr_1fr_7rem_7rem_6rem]">
                      <input
                        aria-label="Enemy id"
                        className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm"
                        onChange={(event) => {
                          const nextId = toKebabInput(event.target.value);
                          renameEnemyEditorState(enemy.id, nextId);
                          setSelectedEnemyId(nextId);
                          updateEnemy(row, { id: nextId });
                        }}
                        onFocus={() => setSelectedEnemyId(enemy.id)}
                        value={enemy.id}
                      />
                      <input aria-label="Enemy interaction" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-interaction-ids" onChange={(event) => updateEnemyInteraction(row, toKebabInput(event.target.value))} onFocus={() => setSelectedEnemyId(enemy.id)} value={enemy.interactionTypeId} />
                      <input aria-label="Enemy health" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="1" onChange={(event) => updateEnemy(row, { health: Number(event.target.value) })} onFocus={() => setSelectedEnemyId(enemy.id)} type="number" value={enemy.health} />
                      <input aria-label="Enemy rate per minute" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="0" onChange={(event) => updateEnemy(row, { rate: Number(event.target.value) })} onFocus={() => setSelectedEnemyId(enemy.id)} type="number" value={enemy.rate} />
                      <button
                        className={removeButtonClass}
                        onClick={() => {
                          if (selectedEnemyId === enemy.id) {
                            setSelectedEnemyId(null);
                          }
                          removeRow('enemies', row);
                        }}
                        type="button"
                      >
                        {t('contribution.column.remove')}
                      </button>
                    </div>
                    <NestedListSection label={t('contribution.column.skillStats')} onActivate={() => setSelectedEnemyId(enemy.id)}>
                      <div className="grid gap-2 border-b border-slate-800 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid-cols-[1fr_7rem_7rem]">
                        <span>{t('contribution.column.skill')}</span>
                        <span>{t('contribution.column.stat')}</span>
                        <span>{t('contribution.column.imprecision')}</span>
                      </div>
                      {skillEntries.length === 0 && <p className="py-1 text-sm text-slate-500">{t('contribution.skillStat.empty')}</p>}
                      {skillEntries.map(({ skillId, stats }) => (
                        <div className="grid gap-2 border-b border-slate-800 py-1.5 last:border-0 lg:grid-cols-[1fr_7rem_7rem]" key={skillId}>
                          <input aria-label="Enemy skill" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-skill-ids" readOnly value={skillId} />
                          <input aria-label="Enemy skill stat" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateEnemySkillStat(row, skillId, { base: numberOrUndefined(event.target.value), added: 0, increased: 0 })} type="number" value={stats.base ?? ''} />
                          <input aria-label="Enemy skill imprecision" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="0.01" onChange={(event) => updateEnemySkillStat(row, skillId, { imprecision: numberOrUndefined(event.target.value) })} step="0.01" type="number" value={stats.imprecision ?? ''} />
                        </div>
                      ))}
                    </NestedListSection>
                    {(selected || enemy.rewards.length > 0) && (
                      <RewardListEditor
                        draft={rewardDraft}
                        label={t('contribution.column.rewards')}
                        onAdd={() => addEnemyReward(row)}
                        onActivate={() => setSelectedEnemyId(enemy.id)}
                        onDraftChange={(patch) => updateRewardDraft(enemy.id, patch)}
                        onRemove={(rewardIndex) => removeEnemyReward(row, rewardIndex)}
                        rewards={enemy.rewards}
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

      {activeTab === 'items' && (
        <section className="grid gap-1 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.data.items')}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addItem} type="button">
              {t('contribution.data.addItem')}
            </button>
          </div>
          <div className="hidden grid-cols-[1fr_6rem] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>{t('contribution.column.id')}</span>
            <span>{t('contribution.column.remove')}</span>
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noItemChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {items.map((row) => (
                <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_6rem]" key={`${row.source}-${row.item.id}-${row.index}`}>
                  <input aria-label="Item id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateItem(row, { id: toKebabInput(event.target.value) })} value={row.item.id} />
                  <button className={removeButtonClass} onClick={() => removeRow('items', row)} type="button">
                    {t('contribution.column.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}
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

