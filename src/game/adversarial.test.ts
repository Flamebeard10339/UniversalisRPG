import { describe, expect, it } from 'vitest';
import { actionDps, expectedDamage, getActionDps } from './adversarial';
import type { ActionResolutionContext, GameAction } from './types';
import { createInitialPlayState, resolveIdleTimers, startAction } from './timers';

const context: ActionResolutionContext = {
  actions: [],
  skills: [
    { id: 'attack', maxLevel: 100, imprecision: 70 },
    { id: 'defense', maxLevel: 100, imprecision: 70 },
  ],
  interactionTypes: [
    {
      id: 'melee-combat',
      sourceSkillId: 'attack',
      targetSkillId: 'defense',
      targetPlayerHealth: true,
    },
  ],
};

const action: GameAction = {
  id: 'test-fight',
  locationId: 'arena',
  durationSeconds: 10,
  interactionTypeId: 'melee-combat',
  health: 20,
  rate: 2,
  rewards: [{ kind: 'resource', resourceId: 'fang', amount: 1 }],
};

describe('adversarial actions', () => {
  it('loops without rewards when sampled damage leaves target health above zero', () => {
    const startedAt = 1_000;
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), action, context, startedAt),
      skillXp: {
        attack: 10,
      },
    };

    const resolved = resolveIdleTimers(state, { ...context, actions: [action] }, {
      random: () => 1,
      showReport: true,
    }, startedAt + 10_000);

    expect(resolved.state.activeAction).toMatchObject({
      actionId: 'test-fight',
      targetHealth: 13,
    });
    expect(resolved.state.resources.fang).toBeUndefined();
    expect(resolved.state.playerHealth).toBe(98);
    expect(resolved.state.chatMessages).toHaveLength(0);
    expect(resolved.report).toEqual({ kind: 'none' });
  });

  it('grants rewards once when sampled damage defeats the target', () => {
    const startedAt = 1_000;
    const weakAction = {
      ...action,
      health: 5,
    };
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), weakAction, context, startedAt),
      skillXp: {
        attack: 10,
      },
    };

    const resolved = resolveIdleTimers(state, { ...context, actions: [weakAction] }, {
      random: () => 1,
      showReport: true,
    }, startedAt + 10_000);
    const repeated = resolveIdleTimers(resolved.state, { ...context, actions: [weakAction] }, {
      random: () => 1,
      showReport: true,
    }, startedAt + 10_001);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.resources.fang).toBe(1);
    expect(resolved.state.playerHealth).toBe(98);
    expect(resolved.state.chatMessages).toHaveLength(1);
    expect(resolved.report).toMatchObject({
      kind: 'actionCompleted',
      actionId: 'test-fight',
    });
    expect(repeated.state.resources.fang).toBe(1);
    expect(repeated.state.chatMessages).toHaveLength(1);
  });

  it('calculates debug DPS from expected damage and effective action time', () => {
    const state = {
      ...createInitialPlayState('test', 'arena'),
      skillXp: {
        attack: 10,
      },
    };
    const actual = getActionDps(state, action, context);
    const expected = actionDps(14, 70, 7, 10);

    expect(actual).toBeCloseTo(expected, 5);
    expect(expected).toBeCloseTo(expectedDamage(14, 70, 7) / 10, 5);
  });
});
