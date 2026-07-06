import { describe, expect, it } from 'vitest';
import type { ActionResolutionContext, QuestDefinition } from './types';
import { createInitialPlayState } from './timers';
import { currentQuestStage, deriveQuestStatus } from './quests';

const context: ActionResolutionContext = {
  actions: [],
  skills: [],
  stats: [],
  locations: [],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dropTables: [],
};

const quest: QuestDefinition = {
  id: 'leave-tutorial-island',
  titleKey: 'quest.leave-tutorial-island.title',
  stages: [
    { id: 'accept', descriptionKey: 'quest.leave-tutorial-island.accept', condition: { kind: 'state-variable', variable: 'flag:quest-started', comparison: 'equal', value: true } },
    { id: 'reach-mainland', descriptionKey: 'quest.leave-tutorial-island.reach-mainland', condition: { kind: 'state-variable', variable: 'flag:reached-mainland', comparison: 'equal', value: true } },
  ],
};

describe('quests', () => {
  it('is not-started when the first stage condition is unmet', () => {
    const state = createInitialPlayState('test-universe', 'start');
    expect(deriveQuestStatus(state, quest, context)).toBe('not-started');
    expect(currentQuestStage(state, quest, context)?.id).toBe('accept');
  });

  it('is in-progress once the first stage is met but not the last', () => {
    const state = { ...createInitialPlayState('test-universe', 'start'), flags: { 'quest-started': true } };
    expect(deriveQuestStatus(state, quest, context)).toBe('in-progress');
    expect(currentQuestStage(state, quest, context)?.id).toBe('reach-mainland');
  });

  it('is complete once every stage condition is met', () => {
    const state = { ...createInitialPlayState('test-universe', 'start'), flags: { 'quest-started': true, 'reached-mainland': true } };
    expect(deriveQuestStatus(state, quest, context)).toBe('complete');
    expect(currentQuestStage(state, quest, context)).toBeNull();
  });
});
