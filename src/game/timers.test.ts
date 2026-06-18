import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResolutionContext, GameAction } from './types';
import { createInitialPlayState, resolveIdleTimers, startAction } from './timers';

describe('resolveIdleTimers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('completes a serialized active action after closed-app idle time without running timers', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const startedAt = 1_000;
    const rejoinedAt = startedAt + 15_000;
    const action: GameAction = {
      id: 'closed-app-action',
      locationId: 'test-location',
      durationSeconds: 10,
      rewards: [
        {
          kind: 'resource',
          resourceId: 'test-resource',
          amount: 3,
        },
      ],
    };
    const activeState = startAction(createInitialPlayState('test-universe', 'test-location'), action, startedAt);
    const closedAppSave = JSON.stringify(activeState);
    const rehydratedState = JSON.parse(closedAppSave) as typeof activeState;

    const resolved = resolveIdleTimers(rehydratedState, [action], { showReport: true }, rejoinedAt);

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.resources['test-resource']).toBe(3);
    expect(resolved.state.actionProgress['closed-app-action']).toMatchObject({
      elapsedMs: 0,
      runningSince: null,
    });
    expect(resolved.report).toMatchObject({
      kind: 'actionCompleted',
      inactiveMs: 15_000,
      actionId: 'closed-app-action',
      completedAt: startedAt + 10_000,
      rewards: [
        {
          kind: 'resource',
          resourceId: 'test-resource',
          amount: 3,
          labelId: 'test-resource',
        },
      ],
    });
    expect(resolved.state.chatMessages).toHaveLength(1);
    expect(resolved.state.chatMessages[0]).toMatchObject({
      author: 'system',
      key: 'action.closed-app-action.success',
    });
  });

  it('completes once when the app is inactive across the action completion boundary', () => {
    const startedAt = 5_000;
    const hiddenAt = startedAt + 8_000;
    const rejoinedAt = startedAt + 11_000;
    const action: GameAction = {
      id: 'boundary-action',
      locationId: 'test-location',
      durationSeconds: 10,
      rewards: [
        {
          kind: 'resource',
          resourceId: 'boundary-resource',
          amount: 7,
        },
      ],
    };
    const activeState = startAction(createInitialPlayState('test-universe', 'test-location'), action, startedAt);
    const hiddenState = {
      ...activeState,
      lastTickAt: hiddenAt,
    };

    const resolved = resolveIdleTimers(hiddenState, [action], { showReport: true }, rejoinedAt);
    const repeated = resolveIdleTimers(resolved.state, [action], { showReport: true }, rejoinedAt + 1);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.resources['boundary-resource']).toBe(7);
    expect(resolved.state.chatMessages).toHaveLength(1);
    expect(resolved.report).toMatchObject({
      kind: 'actionCompleted',
      inactiveMs: 3_000,
      actionId: 'boundary-action',
      completedAt: startedAt + 10_000,
    });
    expect(repeated.state.resources['boundary-resource']).toBe(7);
    expect(repeated.state.chatMessages).toHaveLength(1);
    expect(repeated.report).toEqual({ kind: 'none' });
  });

  it('does not apply resource effects when no action is active', () => {
    const context: ActionResolutionContext = {
      actions: [],
      skills: [{ id: 'regeneration', maxLevel: 100 }],
      resourceDefinitions: [{ id: 'health', minValue: 0, baseMaxValue: 100, initialValue: 100 }],
      effects: [{ id: 'health-regeneration', resourceId: 'health', ratePerMinute: 60, source: 'player' }],
      interactionTypes: [],
      enemies: [],
    };
    const state = {
      ...createInitialPlayState('test-universe', 'test-location'),
      lastTickAt: 1_000,
      resourcePools: {
        health: { current: 50, min: 0, max: 100 },
      },
      playerHealth: 50,
    };

    const resolved = resolveIdleTimers(state, context, { showReport: true }, 61_000);

    expect(resolved.state.resourcePools.health.current).toBe(50);
    expect(resolved.state.playerHealth).toBe(50);
  });

  it('applies resource effects only for the active action window during idle catch-up', () => {
    const startedAt = 1_000;
    const rejoinedAt = startedAt + 60_000;
    const action: GameAction = {
      id: 'rest-action',
      locationId: 'test-location',
      durationSeconds: 10,
      rewards: [],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [{ id: 'regeneration', maxLevel: 100 }],
      resourceDefinitions: [{ id: 'health', minValue: 0, baseMaxValue: 100, initialValue: 100 }],
      effects: [{ id: 'health-regeneration', resourceId: 'health', ratePerMinute: 60, source: 'player' }],
      interactionTypes: [],
      enemies: [],
    };
    const state = {
      ...startAction(createInitialPlayState('test-universe', 'test-location'), action, context, startedAt),
      resourcePools: {
        health: { current: 50, min: 0, max: 100 },
      },
      playerHealth: 50,
    };

    const resolved = resolveIdleTimers(state, context, { showReport: true }, rejoinedAt);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.resourcePools.health.current).toBe(60);
    expect(resolved.state.playerHealth).toBe(60);
  });

  it('fires resource empty behaviors when an effect drains health during an action', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'danger-action',
      locationId: 'test-location',
      durationSeconds: 60,
      rewards: [],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [],
      locations: [{ id: 'test-location', position: { x: 0, y: 0 }, starting: true }],
      resourceDefinitions: [{
        id: 'health',
        minValue: 0,
        baseMaxValue: 100,
        initialValue: 100,
        onEmpty: [
          { kind: 'stop-action' },
          { kind: 'refill', value: 'max' },
          { kind: 'relocate', locationId: 'starting-location' },
          { kind: 'chat', messageKey: 'resource.health.empty' },
        ],
      }],
      effects: [{ id: 'poison', resourceId: 'health', ratePerMinute: -60, source: 'player' }],
      interactionTypes: [],
      enemies: [],
    };
    const state = {
      ...startAction(createInitialPlayState('test-universe', 'test-location'), action, context, startedAt),
      resourcePools: {
        health: { current: 10, min: 0, max: 100 },
      },
      playerHealth: 10,
    };

    const resolved = resolveIdleTimers(state, context, { showReport: true }, startedAt + 30_000);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.resourcePools.health.current).toBe(100);
    expect(resolved.state.playerHealth).toBe(100);
    expect(resolved.state.actionProgress['danger-action'].elapsedMs).toBe(10_000);
    expect(resolved.state.chatMessages[0].key).toBe('resource.health.empty');
  });
});
