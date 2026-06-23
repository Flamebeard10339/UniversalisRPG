import { useEffect, useMemo, useState } from 'react';
import { canStartAction } from '../../game/conditions';
import { edgeId, toKebabInput } from '../../game/contentIds';
import type { Translator } from '../../game/i18n';
import type { Condition, ContentBundle, ContributionDraft, GameAction, LocationNode, NumericComparison, TravelEdgeDefinition, UniversePlayState } from '../../game/types';
import { readStateVariable, stateVariableKeys, writeStateVariable, type StateVariableValue } from '../../game/stateVariables';
import { useContributionPlayState } from '../../stores/contributionPlayState';
import { StructuredDataEditor, type StructuredValue } from '../structuredData/StructuredData';
import { actionSchema } from '../structuredData/contentSchemas';
import { EdgeFields, LocationFields } from './MapContentFields';

type StateKey = string;

type Props = {
  baseBundle: ContentBundle;
  bundle: ContentBundle;
  draft: ContributionDraft;
  onPatchDraft: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  onPlayAction: (action: GameAction) => void;
  onReplaceState: (state: UniversePlayState) => void;
  playState: UniversePlayState;
  t: Translator;
};

const conditionKey = (condition: Condition): StateKey | null => {
  if (condition.kind === 'state-variable') return condition.variable;
  return null;
};

const visitCondition = (condition: Condition | undefined, visit: (condition: Condition) => void) => {
  if (!condition) return;
  if (condition.kind === 'all' || condition.kind === 'any') condition.conditions.forEach((child) => visitCondition(child, visit));
  else if (condition.kind === 'not') visitCondition(condition.condition, visit);
  else visit(condition);
};

const compare = (actual: number, comparison: NumericComparison, expected: number) => {
  if (comparison === 'equal') return actual === expected;
  if (comparison === 'greater-than') return actual > expected;
  return actual < expected;
};

const actionMatchesStateFilter = (action: GameAction, key: StateKey | '', value: number | boolean) => {
  if (!key || !action.requirements) return true;
  const matching: Condition[] = [];
  visitCondition(action.requirements, (condition) => {
    if (conditionKey(condition) === key) matching.push(condition);
  });
  if (!matching.length) return true;
  return matching.every((condition) => condition.kind === 'state-variable'
    && (typeof condition.value === 'boolean' || typeof value === 'boolean'
      ? condition.comparison === 'equal' && condition.value === value
      : compare(Number(value), condition.comparison, condition.value)));
};

const referencedStateKeys = (actions: GameAction[]) => {
  const keys = new Set<StateKey>();
  for (const action of actions) {
    visitCondition(action.requirements, (condition) => {
      const key = conditionKey(condition);
      if (key) keys.add(key);
    });
    visitCondition(action.visibleWhen, (condition) => {
      const key = conditionKey(condition);
      if (key) keys.add(key);
    });
    for (const reward of action.rewards) {
      keys.add(reward.kind === 'skillXp' ? `skill-level:${reward.skillId}` : `${reward.kind}:${reward.kind === 'item' ? reward.itemId : reward.resourceId}`);
    }
    for (const result of action.results ?? []) {
      if (result.kind === 'flag') keys.add(`flag:${result.flagId}`);
      if (result.kind === 'item') keys.add(`item:${result.itemId}`);
      if (result.kind === 'resource') keys.add(`resource:${result.resourceId}`);
      if (result.kind === 'skill-xp') keys.add(`skill-level:${result.skillId}`);
    }
    keys.add(`action-completions:${action.id}`);
  }
  return keys;
};

const keyLabel = (key: StateKey) => key.replace(':', ' / ');
const conditionFor = (key: StateKey, value: StateVariableValue): Condition => ({ kind: 'state-variable', variable: key, comparison: 'equal', value });

const mergeRequirement = (action: GameAction, condition: Condition): GameAction => {
  const current = action.requirements;
  if (!current) return { ...action, requirements: condition };
  return { ...action, requirements: current.kind === 'all'
    ? { ...current, conditions: [...current.conditions, condition] }
    : { kind: 'all', conditions: [current, condition] } };
};

export const ContributionWorkbench = ({ baseBundle, bundle, draft, onPatchDraft, onPlayAction, onReplaceState, playState, t }: Props) => {
  const [profileName, setProfileName] = useState('');
  const [filterKey, setFilterKey] = useState<StateKey | ''>('');
  const [filterValue, setFilterValue] = useState<number | boolean>(0);
  const [extraKeys, setExtraKeys] = useState<StateKey[]>([]);
  const [newKey, setNewKey] = useState<StateKey | ''>('');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const profiles = useContributionPlayState((state) => state.profiles[bundle.manifest.id] ?? []);
  const hydrateProfiles = useContributionPlayState((state) => state.hydrate);
  const saveProfile = useContributionPlayState((state) => state.saveProfile);
  const deleteProfile = useContributionPlayState((state) => state.deleteProfile);

  useEffect(() => { void hydrateProfiles(bundle.manifest.id); }, [bundle.manifest.id, hydrateProfiles]);

  const currentActions = bundle.actions.filter((action) => action.locationId === playState.currentLocationId);
  const relevantKeys = useMemo(() => Array.from(new Set([...referencedStateKeys(currentActions), ...extraKeys])), [currentActions, extraKeys]);
  const allKeys = useMemo<StateKey[]>(() => stateVariableKeys(bundle), [bundle]);
  const filteredActions = currentActions.filter((action) => actionMatchesStateFilter(action, filterKey, filterValue));
  const selectedAction = bundle.actions.find((action) => action.id === selectedActionId) ?? null;
  const currentLocation = bundle.locations.find((location) => location.id === playState.currentLocationId)!;
  const connections = bundle.edges.filter((edge) => edge.source === currentLocation.id || edge.target === currentLocation.id);

  const removed = draft.removed;
  const upsertAction = (action: GameAction, originalId = action.id) => onPatchDraft({
    actions: [action, ...draft.actions.filter((item) => item.id !== originalId && item.id !== action.id)],
    removed: { ...removed, actions: Array.from(new Set([
      ...removed.actions.filter((id) => id !== action.id),
      ...(originalId !== action.id && baseBundle.actions.some((item) => item.id === originalId) ? [originalId] : []),
    ])) },
  });
  const upsertLocation = (location: LocationNode, originalId = location.id) => onPatchDraft({
    locations: [location, ...draft.locations.filter((item) => item.id !== originalId && item.id !== location.id)],
    removed: { ...removed, locations: Array.from(new Set([
      ...removed.locations.filter((id) => id !== location.id),
      ...(originalId !== location.id && baseBundle.locations.some((item) => item.id === originalId) ? [originalId] : []),
    ])) },
  });
  const upsertEdge = (edge: TravelEdgeDefinition, originalId = edge.id) => onPatchDraft({
    edges: [edge, ...draft.edges.filter((item) => item.id !== originalId && item.id !== edge.id)],
    removed: { ...removed, edges: Array.from(new Set([
      ...removed.edges.filter((id) => id !== edge.id),
      ...(originalId !== edge.id && baseBundle.edges.some((item) => item.id === originalId) ? [originalId] : []),
    ])) },
  });
  const removeContent = (kind: 'actions' | 'locations' | 'edges', id: string) => {
    const baseItems = kind === 'actions' ? baseBundle.actions : kind === 'locations' ? baseBundle.locations : baseBundle.edges;
    onPatchDraft({
      [kind]: draft[kind].filter((item) => item.id !== id),
      removed: { ...removed, [kind]: baseItems.some((item) => item.id === id) ? Array.from(new Set([...removed[kind], id])) : removed[kind].filter((item) => item !== id) },
    });
  };

  return (
    <section className="grid gap-4 rounded border border-cyan-800/70 bg-slate-900 p-4" data-testid="contribution-workbench">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-cyan-200">{t('workbench.title')}</h2><p className="text-sm text-slate-400">{t('workbench.description')}</p></div>
        <label className="grid gap-1 text-xs text-slate-400"><span>{t('workbench.location')}</span><select className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => onReplaceState({ ...playState, currentLocationId: event.target.value, discoveredLocationIds: Array.from(new Set([...playState.discoveredLocationIds, event.target.value])), activeAction: null, activeTravel: null })} value={currentLocation.id}>{bundle.locations.map((location) => <option key={location.id} value={location.id}>{location.id}</option>)}</select></label>
      </div>

      <section className="grid gap-2 rounded border border-slate-700 p-3">
        <h3 className="font-semibold text-slate-100">{t('workbench.profiles')}</h3>
        <div className="flex flex-wrap gap-2"><input className="min-w-48 flex-1 rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setProfileName(event.target.value)} placeholder={t('workbench.profileName')} value={profileName} /><button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" disabled={!profileName.trim()} onClick={() => { saveProfile(bundle.manifest.id, profileName, playState); setProfileName(''); }} type="button">{t('workbench.saveProfile')}</button></div>
        <div className="flex flex-wrap gap-2">{profiles.map((profile) => <div className="flex overflow-hidden rounded border border-slate-700" key={profile.id}><button className="px-3 py-1.5 text-sm hover:bg-slate-800" onClick={() => onReplaceState(profile.state)} type="button">{profile.name}</button><button aria-label={t('workbench.deleteProfile', { name: profile.name })} className="border-l border-slate-700 px-2 text-rose-300" onClick={() => deleteProfile(bundle.manifest.id, profile.id)} type="button">×</button></div>)}</div>
      </section>

      <section className="grid gap-3 rounded border border-slate-700 p-3">
        <div className="flex flex-wrap items-end gap-2"><div className="mr-auto"><h3 className="font-semibold text-slate-100">{t('workbench.relevantState')}</h3><p className="text-xs text-slate-400">{t('workbench.relevantStateDescription')}</p></div><select className="rounded bg-slate-950 px-2 py-1.5 text-sm" onChange={(event) => setNewKey(event.target.value as StateKey)} value={newKey}><option value="">{t('workbench.addStateKey')}</option>{allKeys.filter((key) => !relevantKeys.includes(key)).map((key) => <option key={key} value={key}>{keyLabel(key)}</option>)}</select><button className="rounded border border-slate-600 px-2 py-1.5 text-sm" disabled={!newKey} onClick={() => { if (newKey) setExtraKeys((keys) => [...keys, newKey]); setNewKey(''); }} type="button">{t('workbench.add')}</button></div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{relevantKeys.map((key) => { const value = readStateVariable(playState, key, bundle); return <label className="grid grid-cols-[1fr_7rem] items-center gap-2 rounded bg-slate-950 p-2 text-xs" key={key}><span className="truncate text-slate-300">{keyLabel(key)}</span>{typeof value === 'boolean' ? <input checked={value} onChange={(event) => onReplaceState(writeStateVariable(playState, key, event.target.checked))} type="checkbox" /> : <input className="min-w-0 rounded bg-slate-900 px-2 py-1" min="0" onChange={(event) => onReplaceState(writeStateVariable(playState, key, Number(event.target.value)))} type="number" value={value} />}</label>; })}</div>
      </section>

      <section className="grid gap-3 rounded border border-slate-700 p-3">
        <div className="flex flex-wrap items-end gap-2"><div className="mr-auto"><h3 className="font-semibold text-slate-100">{t('workbench.actions')}</h3><p className="text-xs text-slate-400">{t('workbench.actionFilterDescription')}</p></div><select className="rounded bg-slate-950 px-2 py-1.5 text-sm" onChange={(event) => { const key = event.target.value as StateKey | ''; setFilterKey(key); if (key) setFilterValue(readStateVariable(playState, key, bundle)); }} value={filterKey}><option value="">{t('workbench.noStateFilter')}</option>{relevantKeys.map((key) => <option key={key} value={key}>{keyLabel(key)}</option>)}</select>{filterKey && (typeof readStateVariable(playState, filterKey, bundle) === 'boolean' ? <select className="rounded bg-slate-950 px-2 py-1.5 text-sm" onChange={(event) => setFilterValue(event.target.value === 'true')} value={String(filterValue)}><option value="true">true</option><option value="false">false</option></select> : <input className="w-24 rounded bg-slate-950 px-2 py-1.5 text-sm" onChange={(event) => setFilterValue(Number(event.target.value))} type="number" value={Number(filterValue)} />)}<button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => { const id = toKebabInput(`action-${currentLocation.id}-${Date.now().toString(36)}`); const action = { id, locationId: currentLocation.id, durationSeconds: 1, rewards: [] }; upsertAction(action); setSelectedActionId(id); }} type="button">{t('workbench.addAction')}</button></div>
        <div className="grid gap-2">{filteredActions.map((action) => <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_auto_auto_auto]" key={action.id}><button className="text-left text-sm font-semibold text-slate-100" onClick={() => setSelectedActionId(action.id)} type="button">{action.id}<span className="block text-xs font-normal text-slate-500">{canStartAction(playState, action, { ...bundle }) ? t('workbench.ready') : t('workbench.blocked')}</span></button><button className="rounded border border-cyan-700 px-3 py-1.5 text-sm" onClick={() => onPlayAction(action)} type="button">{t('actionPanel.start')}</button><button className="rounded border border-slate-600 px-3 py-1.5 text-sm" onClick={() => setSelectedActionId(action.id)} type="button">{t('contribution.column.edit')}</button><button className="rounded border border-rose-800 px-3 py-1.5 text-sm text-rose-300" onClick={() => { removeContent('actions', action.id); if (selectedActionId === action.id) setSelectedActionId(null); }} type="button">{t('contribution.column.remove')}</button></div>)}</div>
        {selectedAction && <div className="grid gap-3 rounded border border-slate-700 p-3"><StructuredDataEditor label="workbench.actionFields" onChange={(value) => { if (value) { const next = value as unknown as GameAction; upsertAction(next, selectedAction.id); if (next.id !== selectedAction.id) setSelectedActionId(next.id); } }} schema={actionSchema(bundle)} t={t} value={selectedAction as unknown as StructuredValue} /><div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs text-slate-400"><span>{t('workbench.requireFromState')}</span><select className="rounded bg-slate-950 px-2 py-1.5 text-sm" id="workbench-requirement-key"><option value="">{t('workbench.selectStateKey')}</option>{relevantKeys.map((key) => <option key={key} value={key}>{keyLabel(key)} = {String(readStateVariable(playState, key, bundle))}</option>)}</select></label><button className="rounded border border-slate-600 px-3 py-1.5 text-sm" onClick={() => { const select = document.getElementById('workbench-requirement-key') as HTMLSelectElement | null; const key = select?.value as StateKey; if (!key) return; upsertAction(mergeRequirement(selectedAction, conditionFor(key, readStateVariable(playState, key, bundle)))); }} type="button">{t('workbench.addRequirement')}</button></div></div>}
      </section>

      <section className="grid gap-3 rounded border border-slate-700 p-3"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-100">{t('workbench.locationEditor')}</h3><button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => { const id = toKebabInput(`location-${Date.now().toString(36)}`); const location = { id, position: { x: currentLocation.position.x + 160, y: currentLocation.position.y } }; upsertLocation(location); onReplaceState({ ...playState, currentLocationId: id, discoveredLocationIds: [...playState.discoveredLocationIds, id] }); }} type="button">{t('contribution.data.addLocation')}</button></div><LocationFields location={currentLocation} onChange={(next) => { upsertLocation(next, currentLocation.id); if (next.id !== currentLocation.id) onReplaceState({ ...playState, currentLocationId: next.id, discoveredLocationIds: playState.discoveredLocationIds.map((id) => id === currentLocation.id ? next.id : id) }); }} onRemove={() => { if (bundle.locations.length <= 1) return; const next = bundle.locations.find((location) => location.id !== currentLocation.id)!; onReplaceState({ ...playState, currentLocationId: next.id, activeAction: null, activeTravel: null }); removeContent('locations', currentLocation.id); }} t={t} /></section>

      <section className="grid gap-3 rounded border border-slate-700 p-3"><div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-100">{t('workbench.connections')}</h3><p className="text-xs text-slate-400">{t('workbench.connectionsDescription')}</p></div>{bundle.locations.length > 1 && <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => { const target = bundle.locations.find((location) => location.id !== currentLocation.id)!; const id = toKebabInput(`${currentLocation.id}-${target.id}-${Date.now().toString(36)}`); upsertEdge({ id, source: currentLocation.id, target: target.id, travelTimeSeconds: 1 }); }} type="button">{t('contribution.data.addEdge')}</button>}</div>{connections.map((edge) => <EdgeFields bundle={bundle} edge={edge} key={edge.id} onChange={(next) => { const normalized = { ...next, id: edgeId(next.source, next.target) }; upsertEdge(normalized, edge.id); }} onRemove={() => removeContent('edges', edge.id)} t={t} />)}<datalist id="content-location-ids">{bundle.locations.map((location) => <option key={location.id} value={location.id} />)}</datalist></section>
    </section>
  );
};
