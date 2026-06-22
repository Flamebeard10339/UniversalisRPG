import { useEffect, useMemo, useState } from 'react';
import { canStartAction } from '../../game/conditions';
import { toKebabInput } from '../../game/contentIds';
import type { Translator } from '../../game/i18n';
import { skillLevelFromXp } from '../../game/skills';
import type { Condition, ContentBundle, ContributionDraft, GameAction, LocationNode, NumericComparison, TravelEdgeDefinition, UniversePlayState } from '../../game/types';
import { useContributionPlayState } from '../../stores/contributionPlayState';

type StateKey = `flag:${string}` | `item:${string}` | `resource:${string}` | `skill-level:${string}` | `action-completions:${string}` | 'death-count' | 'player-health';

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
  if (condition.kind === 'death-count') return 'death-count';
  if (condition.kind === 'flag') return `flag:${condition.flagId}`;
  if (condition.kind === 'item') return `item:${condition.itemId}`;
  if (condition.kind === 'resource') return `resource:${condition.resourceId}`;
  if (condition.kind === 'skill-level') return `skill-level:${condition.skillId}`;
  if (condition.kind === 'action-completions') return `action-completions:${condition.actionId}`;
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
  if (comparison === 'at-least') return actual >= expected;
  if (comparison === 'at-most') return actual <= expected;
  if (comparison === 'greater-than') return actual > expected;
  return actual < expected;
};

const actionMatchesStateFilter = (action: GameAction, key: StateKey | '', value: number | boolean) => {
  if (!key || !action.requirements || Array.isArray(action.requirements)) return true;
  const matching: Condition[] = [];
  visitCondition(action.requirements, (condition) => {
    if (conditionKey(condition) === key) matching.push(condition);
  });
  if (!matching.length) return true;
  return matching.every((condition) => condition.kind === 'flag'
    ? condition.value === Boolean(value)
    : 'comparison' in condition && compare(Number(value), condition.comparison, condition.value));
};

const referencedStateKeys = (actions: GameAction[]) => {
  const keys = new Set<StateKey>(['death-count', 'player-health']);
  for (const action of actions) {
    visitCondition(Array.isArray(action.requirements) ? undefined : action.requirements, (condition) => {
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
const getStateValue = (state: UniversePlayState, key: StateKey): number | boolean => {
  if (key === 'death-count') return state.deathCount;
  if (key === 'player-health') return state.playerHealth;
  const [kind, id] = key.split(':');
  if (kind === 'flag') return state.flags[id] ?? false;
  if (kind === 'item') return state.inventory[id] ?? 0;
  if (kind === 'resource') return state.resourcePools[id]?.current ?? 0;
  if (kind === 'skill-level') return skillLevelFromXp(state.skillXp[id] ?? 0);
  return state.actionCompletions[id] ?? 0;
};

const setStateValue = (state: UniversePlayState, key: StateKey, value: number | boolean): UniversePlayState => {
  if (key === 'death-count') return { ...state, deathCount: Number(value) };
  if (key === 'player-health') return { ...state, playerHealth: Number(value) };
  const [kind, id] = key.split(':');
  if (kind === 'flag') return { ...state, flags: { ...state.flags, [id]: Boolean(value) } };
  if (kind === 'item') return { ...state, inventory: { ...state.inventory, [id]: Number(value) } };
  if (kind === 'resource') {
    const current = state.resourcePools[id] ?? { current: 0, min: 0, max: Math.max(100, Number(value)) };
    return { ...state, resourcePools: { ...state.resourcePools, [id]: { ...current, current: Number(value) } } };
  }
  if (kind === 'skill-level') {
    const level = Math.max(1, Number(value));
    return { ...state, skillXp: { ...state.skillXp, [id]: (level - 1) ** 2 * 10 } };
  }
  return { ...state, actionCompletions: { ...state.actionCompletions, [id]: Number(value) } };
};

const conditionFor = (key: StateKey, value: number | boolean): Condition | null => {
  if (key === 'player-health') return null;
  if (key === 'death-count') return { kind: 'death-count', comparison: 'equal', value: Number(value) };
  const [kind, id] = key.split(':');
  if (kind === 'flag') return { kind: 'flag', flagId: id, value: Boolean(value) };
  if (kind === 'item') return { kind: 'item', itemId: id, comparison: 'equal', value: Number(value) };
  if (kind === 'resource') return { kind: 'resource', resourceId: id, comparison: 'equal', value: Number(value) };
  if (kind === 'skill-level') return { kind: 'skill-level', skillId: id, comparison: 'equal', value: Number(value) };
  return { kind: 'action-completions', actionId: id, comparison: 'equal', value: Number(value) };
};

const mergeRequirement = (action: GameAction, condition: Condition): GameAction => {
  const current = action.requirements;
  if (!current) return { ...action, requirements: condition };
  if (Array.isArray(current)) {
    const converted: Condition[] = current.map((requirement) => requirement.kind === 'skillLevel'
      ? { kind: 'skill-level', skillId: requirement.skillId, comparison: 'at-least', value: requirement.level }
      : { kind: 'item', itemId: requirement.resourceId, comparison: 'at-least', value: requirement.amount });
    return { ...action, requirements: { kind: 'all', conditions: [...converted, condition] } };
  }
  return { ...action, requirements: current.kind === 'all'
    ? { ...current, conditions: [...current.conditions, condition] }
    : { kind: 'all', conditions: [current, condition] } };
};

const JsonCard = <T,>({ label, value, onCommit }: { label: string; value: T; onCommit: (value: T) => void }) => {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(JSON.stringify(value, null, 2)); setInvalid(false); }, [value]);
  return (
    <label className="grid gap-1 text-xs text-slate-400">
      <span>{label}</span>
      <textarea className={`min-h-40 rounded border bg-slate-950 p-2 font-mono text-xs text-slate-100 ${invalid ? 'border-rose-500' : 'border-slate-700'}`} onBlur={() => {
        try { onCommit(JSON.parse(text) as T); setInvalid(false); } catch { setInvalid(true); }
      }} onChange={(event) => { setText(event.target.value); setInvalid(false); }} value={text} />
    </label>
  );
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
  const allKeys = useMemo<StateKey[]>(() => [
    'death-count', 'player-health',
    ...bundle.flags.map((flag) => `flag:${flag.id}` as StateKey),
    ...bundle.items.map((item) => `item:${item.id}` as StateKey),
    ...bundle.resourceDefinitions.map((resource) => `resource:${resource.id}` as StateKey),
    ...bundle.skills.map((skill) => `skill-level:${skill.id}` as StateKey),
    ...bundle.actions.map((action) => `action-completions:${action.id}` as StateKey),
  ], [bundle]);
  const filteredActions = currentActions.filter((action) => actionMatchesStateFilter(action, filterKey, filterValue));
  const selectedAction = bundle.actions.find((action) => action.id === selectedActionId) ?? null;
  const currentLocation = bundle.locations.find((location) => location.id === playState.currentLocationId)!;
  const connections = bundle.edges.filter((edge) => edge.source === currentLocation.id || edge.target === currentLocation.id);

  const removed = draft.removed;
  const upsertAction = (action: GameAction) => onPatchDraft({ actions: [action, ...draft.actions.filter((item) => item.id !== action.id)], removed: { ...removed, actions: removed.actions.filter((id) => id !== action.id) } });
  const upsertLocation = (location: LocationNode) => onPatchDraft({ locations: [location, ...draft.locations.filter((item) => item.id !== location.id)], removed: { ...removed, locations: removed.locations.filter((id) => id !== location.id) } });
  const upsertEdge = (edge: TravelEdgeDefinition) => onPatchDraft({ edges: [edge, ...draft.edges.filter((item) => item.id !== edge.id)], removed: { ...removed, edges: removed.edges.filter((id) => id !== edge.id) } });
  const removeContent = (kind: 'actions' | 'locations' | 'edges', id: string) => {
    const baseItems = kind === 'actions' ? baseBundle.actions : kind === 'locations' ? baseBundle.locations : baseBundle.edges;
    onPatchDraft({
      [kind]: draft[kind].filter((item) => item.id !== id),
      removed: { ...removed, [kind]: baseItems.some((item) => item.id === id) ? Array.from(new Set([...removed[kind], id])) : removed[kind].filter((item) => item !== id) },
    });
  };

  return (
    <section className="grid min-h-0 gap-4 overflow-auto rounded border border-cyan-800/70 bg-slate-900 p-4" data-testid="contribution-workbench">
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
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{relevantKeys.map((key) => { const value = getStateValue(playState, key); return <label className="grid grid-cols-[1fr_7rem] items-center gap-2 rounded bg-slate-950 p-2 text-xs" key={key}><span className="truncate text-slate-300">{keyLabel(key)}</span>{typeof value === 'boolean' ? <input checked={value} onChange={(event) => onReplaceState(setStateValue(playState, key, event.target.checked))} type="checkbox" /> : <input className="min-w-0 rounded bg-slate-900 px-2 py-1" min="0" onChange={(event) => onReplaceState(setStateValue(playState, key, Number(event.target.value)))} type="number" value={value} />}</label>; })}</div>
      </section>

      <section className="grid gap-3 rounded border border-slate-700 p-3">
        <div className="flex flex-wrap items-end gap-2"><div className="mr-auto"><h3 className="font-semibold text-slate-100">{t('workbench.actions')}</h3><p className="text-xs text-slate-400">{t('workbench.actionFilterDescription')}</p></div><select className="rounded bg-slate-950 px-2 py-1.5 text-sm" onChange={(event) => { const key = event.target.value as StateKey | ''; setFilterKey(key); if (key) setFilterValue(getStateValue(playState, key)); }} value={filterKey}><option value="">{t('workbench.noStateFilter')}</option>{relevantKeys.filter((key) => key !== 'player-health').map((key) => <option key={key} value={key}>{keyLabel(key)}</option>)}</select>{filterKey && (typeof getStateValue(playState, filterKey) === 'boolean' ? <select className="rounded bg-slate-950 px-2 py-1.5 text-sm" onChange={(event) => setFilterValue(event.target.value === 'true')} value={String(filterValue)}><option value="true">true</option><option value="false">false</option></select> : <input className="w-24 rounded bg-slate-950 px-2 py-1.5 text-sm" onChange={(event) => setFilterValue(Number(event.target.value))} type="number" value={Number(filterValue)} />)}<button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => { const id = toKebabInput(`action-${currentLocation.id}-${Date.now().toString(36)}`); const action = { id, locationId: currentLocation.id, durationSeconds: 1, rewards: [] }; upsertAction(action); setSelectedActionId(id); }} type="button">{t('workbench.addAction')}</button></div>
        <div className="grid gap-2">{filteredActions.map((action) => <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_auto_auto_auto]" key={action.id}><button className="text-left text-sm font-semibold text-slate-100" onClick={() => setSelectedActionId(action.id)} type="button">{action.id}<span className="block text-xs font-normal text-slate-500">{canStartAction(playState, action, { ...bundle }) ? t('workbench.ready') : t('workbench.blocked')}</span></button><button className="rounded border border-cyan-700 px-3 py-1.5 text-sm" onClick={() => onPlayAction(action)} type="button">{t('actionPanel.start')}</button><button className="rounded border border-slate-600 px-3 py-1.5 text-sm" onClick={() => setSelectedActionId(action.id)} type="button">{t('contribution.column.edit')}</button><button className="rounded border border-rose-800 px-3 py-1.5 text-sm text-rose-300" onClick={() => { removeContent('actions', action.id); if (selectedActionId === action.id) setSelectedActionId(null); }} type="button">{t('contribution.column.remove')}</button></div>)}</div>
        {selectedAction && <div className="grid gap-3 rounded border border-slate-700 p-3"><JsonCard label={t('workbench.actionJson')} onCommit={upsertAction} value={selectedAction} /><div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs text-slate-400"><span>{t('workbench.requireFromState')}</span><select className="rounded bg-slate-950 px-2 py-1.5 text-sm" id="workbench-requirement-key"><option value="">{t('workbench.selectStateKey')}</option>{relevantKeys.filter((key) => key !== 'player-health').map((key) => <option key={key} value={key}>{keyLabel(key)} = {String(getStateValue(playState, key))}</option>)}</select></label><button className="rounded border border-slate-600 px-3 py-1.5 text-sm" onClick={() => { const select = document.getElementById('workbench-requirement-key') as HTMLSelectElement | null; const key = select?.value as StateKey; if (!key) return; const condition = conditionFor(key, getStateValue(playState, key)); if (condition) upsertAction(mergeRequirement(selectedAction, condition)); }} type="button">{t('workbench.addRequirement')}</button></div></div>}
      </section>

      <section className="grid gap-3 rounded border border-slate-700 p-3"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-100">{t('workbench.locationEditor')}</h3><button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => { const id = toKebabInput(`location-${Date.now().toString(36)}`); const location = { id, position: { x: currentLocation.position.x + 160, y: currentLocation.position.y } }; upsertLocation(location); onReplaceState({ ...playState, currentLocationId: id, discoveredLocationIds: [...playState.discoveredLocationIds, id] }); }} type="button">{t('contribution.data.addLocation')}</button></div><JsonCard label={t('workbench.locationJson')} onCommit={upsertLocation} value={currentLocation} />{bundle.locations.length > 1 && <button className="justify-self-start rounded border border-rose-800 px-3 py-1.5 text-sm text-rose-300" onClick={() => { const next = bundle.locations.find((location) => location.id !== currentLocation.id)!; onReplaceState({ ...playState, currentLocationId: next.id, activeAction: null, activeTravel: null }); removeContent('locations', currentLocation.id); }} type="button">{t('contribution.removeNode')}</button>}</section>

      <section className="grid gap-3 rounded border border-slate-700 p-3"><div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-100">{t('workbench.connections')}</h3><p className="text-xs text-slate-400">{t('workbench.connectionsDescription')}</p></div>{bundle.locations.length > 1 && <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => { const target = bundle.locations.find((location) => location.id !== currentLocation.id)!; const id = toKebabInput(`${currentLocation.id}-${target.id}-${Date.now().toString(36)}`); upsertEdge({ id, source: currentLocation.id, target: target.id, travelTimeSeconds: 1 }); }} type="button">{t('contribution.data.addEdge')}</button>}</div>{connections.map((edge) => <div className="grid gap-2 rounded bg-slate-950 p-2 lg:grid-cols-[1fr_auto]" key={edge.id}><JsonCard label={edge.id} onCommit={upsertEdge} value={edge} /><button className="self-start rounded border border-rose-800 px-3 py-1.5 text-sm text-rose-300" onClick={() => removeContent('edges', edge.id)} type="button">{t('contribution.removeEdge')}</button></div>)}</section>
    </section>
  );
};
