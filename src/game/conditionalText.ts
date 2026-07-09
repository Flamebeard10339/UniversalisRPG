import type { ActionResolutionContext, ConditionalText, UniversePlayState } from './types';
import { evaluateCondition } from './conditions';

export const renderConditionalText = (
  text: ConditionalText,
  state: UniversePlayState,
  context: ActionResolutionContext,
): string =>
  text
    .filter((fragment) =>
      fragment.kind === 'literal' || evaluateCondition(fragment.condition, state, context),
    )
    .map((fragment) => fragment.text)
    .join('')
    .trim();
