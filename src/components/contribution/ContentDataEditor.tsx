import { useState } from 'react';
import { edgeId, toKebabInput } from '../../game/contentIds';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, GameAction, ItemDefinition, LocationNode, Reward, SkillDefinition, TravelEdgeDefinition } from '../../game/types';
import { ContributionMapEditor } from './ContributionMapEditor';

type ContentDataEditorProps = {
  bundle: ContentBundle;
  draft: ContributionDraft;
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  t: Translator;
};

type ContentDataTab = 'map' | 'actions' | 'skills' | 'items' | 'json';
type RewardDraft = {
  kind: Reward['kind'];
  targetId: string;
  amount: string;
};

const contentTabs: ContentDataTab[] = ['map', 'actions', 'skills', 'items', 'json'];

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

const uniqueById = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];
const allLocations = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...bundle.locations, ...draft.locations]);
const allSkills = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...bundle.skills, ...draft.skills]);
const allItems = (bundle: ContentBundle, draft: ContributionDraft) => uniqueById([...(bundle.items ?? []), ...draft.items]);
const defaultRewardDraft = (): RewardDraft => ({ kind: 'skillXp', targetId: '', amount: '1' });

export const ContentDataEditor = ({ bundle, draft, onPatch, t }: ContentDataEditorProps) => {
  const [activeTab, setActiveTab] = useState<ContentDataTab>('map');
  const [rewardDrafts, setRewardDrafts] = useState<Record<string, RewardDraft>>({});
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  const updateLocation = (index: number, patch: Partial<LocationNode>) => {
    onPatch({ locations: replaceAt(draft.locations, index, { ...draft.locations[index], ...patch }) });
  };

  const updateEdge = (index: number, patch: Partial<TravelEdgeDefinition>) => {
    const edge = { ...draft.edges[index], ...patch };
    const nextEdge = patch.source || patch.target ? { ...edge, id: edgeId(edge.source, edge.target) } : edge;
    onPatch({ edges: replaceAt(draft.edges, index, nextEdge) });
  };

  const updateAction = (index: number, patch: Partial<GameAction>) => {
    onPatch({ actions: replaceAt(draft.actions, index, { ...draft.actions[index], ...patch }) });
  };

  const updateSkill = (index: number, patch: Partial<SkillDefinition>) => {
    onPatch({ skills: replaceAt(draft.skills, index, { ...draft.skills[index], ...patch }) });
  };

  const updateItem = (index: number, patch: Partial<ItemDefinition>) => {
    onPatch({ items: replaceAt(draft.items, index, { ...draft.items[index], ...patch }) });
  };

  const addLocation = () => {
    const id = uniqueId('new-location', draft.locations.map((location) => location.id));
    onPatch({
      locations: [
        ...draft.locations,
        {
          id,
          position: { x: 80 + draft.locations.length * 80, y: 320 },
          tags: ['community'],
        },
      ],
    });
  };

  const addEdge = () => {
    const locations = allLocations(bundle, draft);
    const source = locations[0]?.id ?? '';
    const target = locations.find((location) => location.id !== source)?.id ?? '';

    if (!source || !target) {
      return;
    }

    const id = edgeId(source, target);
    if (draft.edges.some((edge) => edge.id === id)) {
      return;
    }

    onPatch({ edges: [...draft.edges, { id, source, target, travelTimeSeconds: 15 }] });
  };

  const addAction = () => {
    const id = uniqueId('new-action', draft.actions.map((action) => action.id));
    setSelectedActionId(id);
    onPatch({
      actions: [
        ...draft.actions,
        {
          id,
          locationId: allLocations(bundle, draft)[0]?.id ?? '',
          durationSeconds: 10,
          rewards: [],
        },
      ],
    });
  };

  const addSkill = () => {
    const id = uniqueId('new-skill', draft.skills.map((skill) => skill.id));
    onPatch({ skills: [...draft.skills, { id, maxLevel: 100 }] });
  };

  const addItem = () => {
    const id = uniqueId('new-item', draft.items.map((item) => item.id));
    onPatch({ items: [...draft.items, { id }] });
  };

  const updateRewardDraft = (actionId: string, patch: Partial<RewardDraft>) => {
    setRewardDrafts((current) => ({
      ...current,
      [actionId]: {
        ...defaultRewardDraft(),
        ...current[actionId],
        ...patch,
      },
    }));
  };

  const addReward = (actionIndex: number) => {
    const action = draft.actions[actionIndex];
    const rewardDraft = rewardDrafts[action.id] ?? { kind: 'skillXp', targetId: '', amount: '1' };
    const amount = Number(rewardDraft.amount);

    if (!rewardDraft.targetId || !Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const reward: Reward = rewardDraft.kind === 'skillXp'
      ? { kind: 'skillXp', skillId: rewardDraft.targetId, amount }
      : { kind: 'resource', resourceId: rewardDraft.targetId, amount };

    updateAction(actionIndex, { rewards: [...action.rewards, reward] });
    setRewardDrafts((current) => ({
      ...current,
      [action.id]: { ...rewardDraft, targetId: '', amount: '1' },
    }));
  };

  const removeReward = (actionIndex: number, rewardIndex: number) => {
    const action = draft.actions[actionIndex];
    updateAction(actionIndex, { rewards: removeAt(action.rewards, rewardIndex) });
  };

  const jsonFiles = [
    { path: 'locations.json', json: draft.locations },
    { path: 'edges.json', json: draft.edges },
    { path: 'actions.json', json: draft.actions },
    { path: 'skills.json', json: draft.skills },
    { path: 'items.json', json: draft.items },
    { path: 'locales.json', json: draft.locales },
  ];

  return (
    <section className="grid gap-3">
      <div className="grid grid-cols-5 gap-2 rounded border border-slate-800 bg-slate-900 p-2">
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

      {activeTab === 'map' && (
        <section className="grid gap-2">
          <ContributionMapEditor
            bundle={bundle}
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
            {draft.locations.length === 0 ? (
              <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noLocationChanges')}</p>
            ) : (
              <div className="grid gap-1">
                {draft.locations.map((location, index) => (
                  <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1.2fr_7rem_7rem_1fr_5rem_6rem]" key={`${location.id}-${index}`}>
                    <input aria-label="Location id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateLocation(index, { id: toKebabInput(event.target.value) })} value={location.id} />
                    <input aria-label="Location x" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateLocation(index, { position: { ...location.position, x: Number(event.target.value) } })} type="number" value={Math.round(location.position.x)} />
                    <input aria-label="Location y" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateLocation(index, { position: { ...location.position, y: Number(event.target.value) } })} type="number" value={Math.round(location.position.y)} />
                    <input aria-label="Location tags" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateLocation(index, { tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} placeholder={t('contribution.placeholder.tags')} value={(location.tags ?? []).join(', ')} />
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input checked={Boolean(location.starting)} onChange={(event) => updateLocation(index, { starting: event.target.checked })} type="checkbox" />
                      <span className="lg:hidden">{t('contribution.column.start')}</span>
                    </label>
                    <button className="rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200" onClick={() => onPatch({ locations: removeAt(draft.locations, index) })} type="button">
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
            {draft.edges.length === 0 ? (
              <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noEdgeChanges')}</p>
            ) : (
              <div className="grid gap-1">
                {draft.edges.map((edge, index) => (
                  <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_1fr_1fr_8rem_6rem]" key={`${edge.id}-${index}`}>
                    <input aria-label="Edge id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" readOnly value={edge.id} />
                    <input aria-label="Edge source" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-location-ids" onChange={(event) => updateEdge(index, { source: toKebabInput(event.target.value) })} value={edge.source} />
                    <input aria-label="Edge target" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-location-ids" onChange={(event) => updateEdge(index, { target: toKebabInput(event.target.value) })} value={edge.target} />
                    <input aria-label="Edge duration" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="1" onChange={(event) => updateEdge(index, { travelTimeSeconds: Number(event.target.value) })} type="number" value={edge.travelTimeSeconds} />
                    <button className="rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200" onClick={() => onPatch({ edges: removeAt(draft.edges, index) })} type="button">
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
          <div className="hidden grid-cols-[1fr_1fr_8rem_6rem] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>{t('contribution.column.id')}</span>
            <span>{t('contribution.column.location')}</span>
            <span>{t('contribution.column.seconds')}</span>
            <span>{t('contribution.column.remove')}</span>
          </div>
          {draft.actions.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noActionChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {draft.actions.map((action, index) => {
                const rewardDraft = rewardDrafts[action.id] ?? { kind: 'skillXp', targetId: '', amount: '1' };
                const selected = selectedActionId === action.id;

                return (
                  <div className="grid gap-1 rounded bg-slate-950 p-2" key={`${action.id}-${index}`}>
                    <div className="grid gap-2 lg:grid-cols-[1fr_1fr_8rem_6rem]">
                      <input
                        aria-label="Action id"
                        className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm"
                        onChange={(event) => {
                          const nextId = toKebabInput(event.target.value);
                          setSelectedActionId(nextId);
                          updateAction(index, { id: nextId });
                        }}
                        onFocus={() => setSelectedActionId(action.id)}
                        value={action.id}
                      />
                      <input aria-label="Action location" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" list="content-location-ids" onChange={(event) => updateAction(index, { locationId: toKebabInput(event.target.value) })} onFocus={() => setSelectedActionId(action.id)} value={action.locationId} />
                      <input aria-label="Action duration" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="1" onChange={(event) => updateAction(index, { durationSeconds: Number(event.target.value) })} onFocus={() => setSelectedActionId(action.id)} type="number" value={action.durationSeconds} />
                      <button
                        className="rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200"
                        onClick={() => {
                          if (selectedActionId === action.id) {
                            setSelectedActionId(null);
                          }
                          onPatch({ actions: removeAt(draft.actions, index) });
                        }}
                        type="button"
                      >
                        {t('contribution.column.remove')}
                      </button>
                    </div>
                    {selected && (
                      <div className="ml-3 grid gap-2 border-l border-slate-800 pl-3 pt-1 lg:grid-cols-[9rem_1fr_7rem_auto]">
                        <select className="rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateRewardDraft(action.id, { kind: event.target.value as Reward['kind'], targetId: '' })} value={rewardDraft.kind}>
                          <option value="skillXp">{t('contribution.reward.skillXp')}</option>
                          <option value="resource">{t('contribution.reward.item')}</option>
                        </select>
                        <input
                          className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm"
                          list={rewardDraft.kind === 'skillXp' ? 'content-skill-ids' : 'content-item-ids'}
                          onChange={(event) => updateRewardDraft(action.id, { targetId: toKebabInput(event.target.value) })}
                          placeholder={rewardDraft.kind === 'skillXp' ? t('contribution.placeholder.skillId') : t('contribution.placeholder.itemId')}
                          value={rewardDraft.targetId}
                        />
                        <input className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="1" onChange={(event) => updateRewardDraft(action.id, { amount: event.target.value })} type="number" value={rewardDraft.amount} />
                        <button className="rounded border border-slate-600 px-2 py-1.5 text-sm font-semibold text-slate-100" onClick={() => addReward(index)} type="button">
                          {t('contribution.reward.add')}
                        </button>
                      </div>
                    )}
                    {action.rewards.length > 0 && (
                      <div className="ml-3 flex flex-wrap gap-1 border-l border-slate-800 pl-3">
                        {action.rewards.map((reward, rewardIndex) => (
                          <button className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300" key={`${reward.kind}-${rewardIndex}`} onClick={() => removeReward(index, rewardIndex)} type="button">
                            {JSON.stringify(reward)} x
                          </button>
                        ))}
                      </div>
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
          {draft.skills.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noSkillChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {draft.skills.map((skill, index) => (
                <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_8rem_6rem]" key={`${skill.id}-${index}`}>
                  <input aria-label="Skill id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateSkill(index, { id: toKebabInput(event.target.value) })} value={skill.id} />
                  <input aria-label="Skill max level" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" min="1" onChange={(event) => updateSkill(index, { maxLevel: Number(event.target.value) })} type="number" value={skill.maxLevel} />
                  <button className="rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200" onClick={() => onPatch({ skills: removeAt(draft.skills, index) })} type="button">
                    {t('contribution.column.remove')}
                  </button>
                </div>
              ))}
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
          {draft.items.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">{t('contribution.data.noItemChanges')}</p>
          ) : (
            <div className="grid gap-1">
              {draft.items.map((item, index) => (
                <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_6rem]" key={`${item.id}-${index}`}>
                  <input aria-label="Item id" className="min-w-0 rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => updateItem(index, { id: toKebabInput(event.target.value) })} value={item.id} />
                  <button className="rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200" onClick={() => onPatch({ items: removeAt(draft.items, index) })} type="button">
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
    </section>
  );
};

