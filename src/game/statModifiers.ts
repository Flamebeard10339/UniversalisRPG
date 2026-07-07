import type { ActionResolutionContext, StatModifierDefinition, UniversePlayState } from './types';
import { evaluateCondition } from './conditions';

export const getActiveStatModifiers = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  statId: string,
): StatModifierDefinition[] => {
  const contentModifiers = (context.statModifiers ?? []).filter((modifier) =>
    modifier.statId === statId && evaluateCondition(modifier.activeWhen, state, context));
  const buffModifiers = Object.entries(state.activeBuffs ?? {})
    .filter(([, buff]) => buff.statId === statId)
    .map(([id, buff]) => ({
      id,
      statId: buff.statId,
      amount: buff.amount,
      kind: buff.kind,
      activeWhen: { kind: 'all' as const, conditions: [] },
    }));
  return [...contentModifiers, ...buffModifiers];
};
