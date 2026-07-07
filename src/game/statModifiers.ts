import type { ActionResolutionContext, StatModifierDefinition, UniversePlayState } from './types';
import { evaluateCondition } from './conditions';

export const getActiveStatModifiers = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  statId: string,
): StatModifierDefinition[] =>
  (context.statModifiers ?? []).filter((modifier) =>
    modifier.statId === statId && evaluateCondition(modifier.activeWhen, state, context));
