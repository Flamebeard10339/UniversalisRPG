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
  enemies: [
    {
      id: 'training-dummy',
      interactionTypeId: 'melee-combat',
      health: 20,
      rate: 0,
      skills: {
        attack: { base: 1, imprecision: 70 },
        defense: { base: 1, imprecision: 70 },
      },
      rewards: [{ kind: 'resource', resourceId: 'trophy', amount: 1 }],
    },
  ],
};

const action: GameAction = {
  id: 'test-fight',
  locationId: 'arena',
  durationSeconds: 10,
  enemyId: 'training-dummy',
  rewards: [{ kind: 'resource', resourceId: 'fang', amount: 1 }],
};

describe('adversarial actions', () => {
  it('grants hit rewards and loops when sampled damage leaves target health above zero', () => {
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
    expect(resolved.state.resources.fang).toBe(1);
    expect(resolved.state.resources.trophy).toBeUndefined();
    expect(resolved.state.chatMessages).toHaveLength(1);
    expect(resolved.state.chatMessages[0].key).toBe('action.test-fight.success');
    expect(resolved.report).toEqual({ kind: 'none' });
  });

  it('logs a miss and keeps combat running without rewards', () => {
    const startedAt = 1_000;
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), action, context, startedAt),
      skillXp: {
        attack: 0,
      },
    };

    const resolved = resolveIdleTimers(state, { ...context, actions: [action] }, {
      random: () => 0.5,
      showReport: true,
    }, startedAt + 10_000);

    expect(resolved.state.activeAction).toMatchObject({
      actionId: 'test-fight',
      targetHealth: 20,
    });
    expect(resolved.state.resources.fang).toBeUndefined();
    expect(resolved.state.resources.trophy).toBeUndefined();
    expect(resolved.state.chatMessages).toHaveLength(1);
    expect(resolved.state.chatMessages[0].key).toBe('action.test-fight.failure');
    expect(resolved.report).toEqual({ kind: 'none' });
  });

  it('grants hit and kill rewards once when sampled damage defeats the target', () => {
    const startedAt = 1_000;
    const weakContext: ActionResolutionContext = {
      ...context,
      enemies: [{
        ...context.enemies[0],
        health: 5,
      }],
    };
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), action, weakContext, startedAt),
      skillXp: {
        attack: 10,
      },
    };

    const resolved = resolveIdleTimers(state, { ...weakContext, actions: [action] }, {
      random: () => 1,
      showReport: true,
    }, startedAt + 10_000);
    const repeated = resolveIdleTimers(resolved.state, { ...weakContext, actions: [action] }, {
      random: () => 1,
      showReport: true,
    }, startedAt + 10_001);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.resources.fang).toBe(1);
    expect(resolved.state.resources.trophy).toBe(1);
    expect(resolved.state.chatMessages).toHaveLength(1);
    expect(resolved.state.chatMessages[0].key).toBe('action.test-fight.kill');
    expect(resolved.report).toMatchObject({
      kind: 'actionCompleted',
      actionId: 'test-fight',
    });
    expect(repeated.state.resources.fang).toBe(1);
    expect(repeated.state.resources.trophy).toBe(1);
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

  it('resolves enemy attack progress independently before player action completion', () => {
    const startedAt = 1_000;
    const hostileContext: ActionResolutionContext = {
      ...context,
      enemies: [{
        ...context.enemies[0],
        rate: 60,
        skills: {
          attack: { base: 2, imprecision: 70 },
          defense: { base: 1, imprecision: 70 },
        },
      }],
    };
    const state = startAction(createInitialPlayState('test', 'arena'), action, hostileContext, startedAt);

    const resolved = resolveIdleTimers(state, { ...hostileContext, actions: [action] }, {
      random: () => 1,
      showReport: true,
    }, startedAt + 1_000);

    expect(resolved.state.activeAction).toMatchObject({
      actionId: 'test-fight',
      targetHealth: 20,
      enemyAttackStartedAt: startedAt + 1_000,
      enemyAttackCompletesAt: startedAt + 2_000,
    });
    expect(resolved.state.playerHealth).toBe(93);
    expect(resolved.state.chatMessages).toHaveLength(0);
  });

  it('stops the active action when enemy damage drops player health to zero', () => {
    const startedAt = 1_000;
    const dangerousContext: ActionResolutionContext = {
      ...context,
      enemies: [{
        ...context.enemies[0],
        rate: 60,
        skills: {
          attack: { base: 20, imprecision: 70 },
          defense: { base: 1, imprecision: 70 },
        },
      }],
    };
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), action, dangerousContext, startedAt),
      playerHealth: 10,
    };

    const resolved = resolveIdleTimers(state, { ...dangerousContext, actions: [action] }, {
      random: () => 1,
      showReport: true,
    }, startedAt + 1_000);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.playerHealth).toBe(0);
    expect(resolved.state.actionProgress['test-fight'].elapsedMs).toBe(1_000);
    expect(resolved.state.resources.fang).toBeUndefined();
    expect(resolved.state.resources.trophy).toBeUndefined();
  });
});
