import { skillLevelFromXp, xpRequiredForLevel } from './skills';
import { getCharacterStatValue } from './characterStats';
import { getEnemy } from './adversarial';
import type { ActionResolutionContext, ContentBundle, UniversePlayState } from './types';

export type StateVariableValue = boolean | number | string;

export const stateVariableKeys = (bundle: Pick<ContentBundle, 'flags' | 'items' | 'resourceDefinitions' | 'skills' | 'stats' | 'actions' | 'locations'>) => [
  ...bundle.flags.map((item) => `flag:${item.id}`),
  ...bundle.items.map((item) => `item:${item.id}`),
  ...bundle.resourceDefinitions.map((item) => `resource:${item.id}`),
  ...bundle.skills.map((item) => `skill-level:${item.id}`),
  ...bundle.stats.map((item) => `stat:${item.id}`),
  ...bundle.actions.map((item) => `action-completions:${item.id}`),
  ...bundle.locations.map((item) => `discovered-location:${item.id}`),
  'location',
  'active-action',
  'active-interaction',
];

export const readStateVariable = (
  state: UniversePlayState,
  variable: string,
  context?: Pick<ActionResolutionContext, 'actions' | 'enemies' | 'interactionTypes' | 'items' | 'manifest' | 'skills' | 'stats'>,
): StateVariableValue => {
  const separator = variable.indexOf(':');
  const category = separator >= 0 ? variable.slice(0, separator) : 'flag';
  const id = separator >= 0 ? variable.slice(separator + 1) : variable;
  if (variable === 'location') return state.currentLocationId;
  if (variable === 'active-action') return Boolean(state.activeAction);
  if (variable === 'active-interaction') {
    const action = context?.actions.find((candidate) => candidate.id === state.activeAction?.actionId);
    return Boolean(action && (action.interactionTypeId || getEnemy(action, {
      actions: context?.actions ?? [],
      skills: context?.skills ?? [],
      stats: context?.stats,
      manifest: context?.manifest,
      interactionTypes: context?.interactionTypes ?? [],
      enemies: context?.enemies ?? [],
    })));
  }
  if (category === 'flag') return state.flags[id] ?? false;
  if (category === 'item') return state.inventory[id] ?? 0;
  if (category === 'resource') return state.resourcePools[id]?.current ?? 0;
  if (category === 'skill-level') {
    const skill = context?.skills.find((candidate) => candidate.id === id);
    return skill
      ? Math.min(skill.maxLevel, skillLevelFromXp(state.skillXp[id] ?? 0, context?.manifest?.experienceCurve))
      : skillLevelFromXp(state.skillXp[id] ?? 0, context?.manifest?.experienceCurve);
  }
  if (category === 'stat') return getCharacterStatValue(state, context?.stats ?? [], id, context?.skills ?? [], context?.items ?? [], context?.manifest?.experienceCurve);
  if (category === 'action-completions') return state.actionCompletions[id] ?? 0;
  if (category === 'discovered-location') return state.discoveredLocationIds.includes(id) ? 1 : 0;
  return state.flags[variable] ?? false;
};

export const writeStateVariable = (state: UniversePlayState, variable: string, value: StateVariableValue): UniversePlayState => {
  const separator = variable.indexOf(':');
  const category = separator >= 0 ? variable.slice(0, separator) : 'flag';
  const id = separator >= 0 ? variable.slice(separator + 1) : variable;
  if (variable === 'location') {
    const locationId = String(value);
    return {
      ...state,
      currentLocationId: locationId,
      discoveredLocationIds: Array.from(new Set([...state.discoveredLocationIds, locationId])),
      activeTravel: null,
    };
  }
  if (category === 'flag') return { ...state, flags: { ...state.flags, [id]: value } };
  if (category === 'item') return { ...state, inventory: { ...state.inventory, [id]: Number(value) } };
  if (category === 'resource') {
    const pool = state.resourcePools[id] ?? { current: 0, min: 0, max: Math.max(100, Number(value)) };
    return { ...state, resourcePools: { ...state.resourcePools, [id]: { ...pool, current: Number(value) } } };
  }
  if (category === 'skill-level') {
    const level = Math.max(1, Number(value));
    return { ...state, skillXp: { ...state.skillXp, [id]: xpRequiredForLevel(level) } };
  }
  if (category === 'stat') return { ...state, statOverrides: { ...state.statOverrides, [id]: Number(value) } };
  if (category === 'action-completions') return { ...state, actionCompletions: { ...state.actionCompletions, [id]: Number(value) } };
  return { ...state, flags: { ...state.flags, [variable]: value } };
};
