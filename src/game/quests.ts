import type { ActionResolutionContext, QuestDefinition, QuestStage, UniversePlayState } from './types';
import { evaluateCondition } from './conditions';

export type QuestStatus = 'not-started' | 'in-progress' | 'complete';

export const currentQuestStage = (
  state: UniversePlayState,
  quest: QuestDefinition,
  context: ActionResolutionContext,
): QuestStage | null => quest.stages.find((stage) => !evaluateCondition(stage.condition, state, context)) ?? null;

export const deriveQuestStatus = (
  state: UniversePlayState,
  quest: QuestDefinition,
  context: ActionResolutionContext,
): QuestStatus => {
  const stage = currentQuestStage(state, quest, context);
  if (!stage) return 'complete';
  return stage.id === quest.stages[0]?.id ? 'not-started' : 'in-progress';
};
