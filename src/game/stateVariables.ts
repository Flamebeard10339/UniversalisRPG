import { skillLevelFromXp } from './skills';
import type { ActionResolutionContext, ContentBundle, UniversePlayState } from './types';

export type StateVariableValue = boolean | number;

export const stateVariableKeys = (bundle: Pick<ContentBundle, 'flags' | 'items' | 'resourceDefinitions' | 'skills' | 'actions'>) => [
  ...bundle.flags.map((item) => `flag:${item.id}`),
  ...bundle.items.map((item) => `item:${item.id}`),
  ...bundle.resourceDefinitions.map((item) => `resource:${item.id}`),
  ...bundle.skills.map((item) => `skill-level:${item.id}`),
  ...bundle.actions.map((item) => `action-completions:${item.id}`),
];

export const readStateVariable = (
  state: UniversePlayState,
  variable: string,
  context?: Pick<ActionResolutionContext, 'skills'>,
): StateVariableValue => {
  const separator = variable.indexOf(':');
  const category = separator >= 0 ? variable.slice(0, separator) : 'flag';
  const id = separator >= 0 ? variable.slice(separator + 1) : variable;
  if (category === 'flag') return state.flags[id] ?? false;
  if (category === 'item') return state.inventory[id] ?? 0;
  if (category === 'resource') return state.resourcePools[id]?.current ?? 0;
  if (category === 'skill-level') {
    const skill = context?.skills.find((candidate) => candidate.id === id);
    return skill ? Math.min(skill.maxLevel, skillLevelFromXp(state.skillXp[id] ?? 0)) : skillLevelFromXp(state.skillXp[id] ?? 0);
  }
  if (category === 'action-completions') return state.actionCompletions[id] ?? 0;
  return state.flags[variable] ?? false;
};

export const writeStateVariable = (state: UniversePlayState, variable: string, value: StateVariableValue): UniversePlayState => {
  const separator = variable.indexOf(':');
  const category = separator >= 0 ? variable.slice(0, separator) : 'flag';
  const id = separator >= 0 ? variable.slice(separator + 1) : variable;
  if (category === 'flag') return { ...state, flags: { ...state.flags, [id]: value } };
  if (category === 'item') return { ...state, inventory: { ...state.inventory, [id]: Number(value) } };
  if (category === 'resource') {
    const pool = state.resourcePools[id] ?? { current: 0, min: 0, max: Math.max(100, Number(value)) };
    return { ...state, resourcePools: { ...state.resourcePools, [id]: { ...pool, current: Number(value) } } };
  }
  if (category === 'skill-level') {
    const level = Math.max(1, Number(value));
    return { ...state, skillXp: { ...state.skillXp, [id]: (level - 1) ** 2 * 10 } };
  }
  if (category === 'action-completions') return { ...state, actionCompletions: { ...state.actionCompletions, [id]: Number(value) } };
  return { ...state, flags: { ...state.flags, [variable]: value } };
};
