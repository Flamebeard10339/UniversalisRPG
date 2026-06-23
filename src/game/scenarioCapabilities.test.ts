import { describe, expect, it } from 'vitest';
import type { ActionResolutionContext, GameAction, UniversePlayState } from './types';
import { canStartAction, isActionVisible } from './conditions';
import { completeAction, createInitialPlayState, resolveIdleTimers, startAction } from './timers';
import { recordAgentSessionMessage } from './agentSession';
import { validateContentBundle, validateContentShape } from './validators';
import type { ContentBundle } from './types';

const pickupWater: GameAction = {
  id: 'pick-up-water',
  locationId: 'storage',
  durationSeconds: 1,
  maxCompletions: 5,
  rewards: [],
  results: [{ kind: 'item', itemId: 'water-bottle', amount: 1 }],
};

const context: ActionResolutionContext = {
  manifest: {
    schemaVersion: 1,
    id: 'test',
    version: '1',
    author: 'test',
    locales: ['en'],
    files: [],
  },
  actions: [pickupWater],
  skills: [],
  stats: [
    { id: 'air-capacity', base: 100 },
    { id: 'memory-capacity', base: 100 },
    { id: 'air-loss', base: -30 },
  ],
  items: [
    { id: 'water-bottle', maxQuantity: 5 },
    { id: 'space-suit', maxQuantity: 1 },
    { id: 'ration', maxQuantity: 5 },
  ],
  flags: [
    { id: 'death-count', initialValue: 0 },
    { id: 'torn-suit', initialValue: false },
    { id: 'temporary-access', initialValue: false },
  ],
  locations: [
    { id: 'cryopod', position: { x: 0, y: 0 }, starting: true },
    { id: 'storage', position: { x: 8, y: 0 } },
    { id: 'corridor', position: { x: 16, y: 0 } },
  ],
  resourceDefinitions: [
    {
      id: 'air',
      sourceStat: 'air-capacity',
      initialValue: 'full',
      onEmpty: [{
        kind: 'reset-state',
        locationId: 'cryopod',
        incrementFlagId: 'death-count',
        preserve: {
          inventoryIds: ['space-suit'],
          resourceIds: ['memory-debt'],
          flagIds: ['torn-suit'],
          skillXp: true,
          discoveredLocations: true,
          actionCompletionIds: ['pick-up-water'],
        },
      }, { kind: 'chat', messageKey: 'resource.air.empty' }],
    },
    { id: 'memory-debt', sourceStat: 'memory-capacity', initialValue: 'empty' },
  ],
  effects: [],
  interactionTypes: [],
  enemies: [],
};

describe('Derelict Extant scenario capabilities', () => {
  it('validates recursive capability JSON and rejects malformed conditions', () => {
    const conditionalAction: GameAction = {
      ...pickupWater,
      visibleWhen: {
        kind: 'all',
        conditions: [
          { kind: 'state-variable', variable: 'flag:torn-suit', comparison: 'equal', value: false },
          { kind: 'not', condition: { kind: 'state-variable', variable: 'item:water-bottle', comparison: 'greater-than', value: 4 } },
        ],
      },
      results: [
        { kind: 'resource', resourceId: 'air', amount: -2 },
        { kind: 'relocate', locationId: 'corridor' },
      ],
    };
    const bundle: ContentBundle = {
      manifest: context.manifest!,
      locations: context.locations!,
      edges: [],
      actions: [conditionalAction],
      skills: context.skills,
      stats: context.stats!,
      items: context.items!,
      flags: context.flags!,
      resourceDefinitions: context.resourceDefinitions!,
      effects: [],
      interactionTypes: [],
      enemies: [],
      locales: { en: {} },
    };

    expect(validateContentBundle(bundle).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(validateContentShape({
      ...bundle,
      actions: [{ ...conditionalAction, visibleWhen: { kind: 'unknown' } }],
    } as unknown as ContentBundle)).toContainEqual(expect.objectContaining({ path: 'actions.json' }));
  });

  it('supports finite location actions, inventory consumption, resource deltas, conditions, and relocation', () => {
    let state: UniversePlayState = {
      ...createInitialPlayState('test', 'storage'),
      equipmentSkillBonuses: { 'air-capacity': { added: 93 }, 'memory-capacity': { added: 93 } },
      resourcePools: { air: { current: 20, min: 0, max: 100 }, 'memory-debt': { current: 0, min: 0, max: 100 } },
    };

    for (let completion = 1; completion <= 5; completion += 1) {
      state = startAction(state, pickupWater, context, completion * 10_000);
      state = completeAction(state, pickupWater, context, {}, completion * 10_000 + 1_000);
      expect(state.inventory['water-bottle']).toBe(completion);
      expect(state.actionCompletions[pickupWater.id]).toBe(completion);
    }

    expect(isActionVisible(state, pickupWater, context)).toBe(false);
    expect(canStartAction(state, pickupWater, context)).toBe(false);

    const drinkAndLeave: GameAction = {
      id: 'drink-and-leave',
      locationId: 'storage',
      durationSeconds: 1,
      rewards: [],
      visibleWhen: {
        kind: 'all',
        conditions: [
          {
            kind: 'any',
            conditions: [
              { kind: 'not', condition: { kind: 'state-variable', variable: 'item:water-bottle', comparison: 'less-than', value: 1 } },
              { kind: 'not', condition: { kind: 'state-variable', variable: 'action-completions:pick-up-water', comparison: 'less-than', value: 5 } },
            ],
          },
          { kind: 'not', condition: { kind: 'state-variable', variable: 'flag:torn-suit', comparison: 'equal', value: true } },
        ],
      },
      requirements: { kind: 'not', condition: { kind: 'state-variable', variable: 'resource:air', comparison: 'less-than', value: 10 } },
      results: [
        { kind: 'item', itemId: 'water-bottle', amount: -1 },
        { kind: 'resource', resourceId: 'air', amount: 25 },
        { kind: 'resource', resourceId: 'air', amount: -5 },
        { kind: 'flag', flagId: 'temporary-access', value: true },
        { kind: 'relocate', locationId: 'corridor' },
      ],
    };
    const fullContext = { ...context, actions: [...context.actions, drinkAndLeave] };
    state = startAction(state, drinkAndLeave, fullContext, 70_000);
    state = completeAction(state, drinkAndLeave, fullContext, {}, 71_000);

    expect(state.inventory['water-bottle']).toBe(4);
    expect(state.resourcePools.air.current).toBe(40);
    expect(state.flags['temporary-access']).toBe(true);
    expect(state.currentLocationId).toBe('corridor');
    expect(state.runLog.map((entry) => entry.event)).toContain('action.complete');
  });

  it('applies explicit death persistence and retains a verbose run transcript', () => {
    const wait: GameAction = {
      id: 'wait-for-air-loss',
      locationId: 'storage',
      durationSeconds: 60,
      rewards: [],
    };
    const deathContext: ActionResolutionContext = {
      ...context,
      actions: [wait],
      effects: [{ id: 'air-loss', resourceId: 'air', sourceStat: 'air-loss' }],
    };
    let state: UniversePlayState = {
      ...createInitialPlayState('test', 'storage'),
      equipmentSkillBonuses: { 'air-capacity': { added: 93 }, 'memory-capacity': { added: 93 } },
      resourcePools: { air: { current: 20, min: 0, max: 100 }, 'memory-debt': { current: 0, min: 0, max: 100 } },
    };
    const runId = state.runId;
    state = recordAgentSessionMessage(state, {
      protocolVersion: 1,
      type: 'gm-update',
      turnId: 'turn-1',
      milestoneId: 'first-life',
      runStatus: 'continue',
      operations: [{ op: 'upsert', contentType: 'actions', value: { id: wait.id } }],
      capabilityRequests: [],
      privateNotes: 'Air loss remains legible.',
    }, 90_000);
    state = recordAgentSessionMessage(state, {
      protocolVersion: 1,
      type: 'player-choice',
      turnId: 'turn-1',
      actionId: wait.id,
      feedback: {
        expectedActions: [{ label: 'Check the pressure gauge', reason: 'It was visible.' }],
        confusion: null,
      },
    }, 95_000);
    state = {
      ...state,
      inventory: { 'space-suit': 1, ration: 3 },
      flags: { 'torn-suit': true, 'temporary-access': true },
      skillXp: { survival: 40 },
      actionCompletions: { 'pick-up-water': 3, 'temporary-action': 2 },
      resourcePools: {
        air: { current: 20, min: 0, max: 100 },
        'memory-debt': { current: 12, min: 0, max: 100 },
      },
      discoveredLocationIds: ['cryopod', 'storage'],
    };
    state = startAction(state, wait, deathContext, 100_000);
    const resolved = resolveIdleTimers(state, deathContext, {}, 160_000).state;

    expect(resolved.flags['death-count']).toBe(1);
    expect(resolved.runId).toBe(runId);
    expect(new Set(resolved.runLog.map((entry) => entry.runId))).toEqual(new Set([runId]));
    expect(resolved.currentLocationId).toBe('cryopod');
    expect(resolved.inventory['space-suit']).toBe(1);
    expect(resolved.inventory.ration).toBe(0);
    expect(resolved.flags['torn-suit']).toBe(true);
    expect(resolved.flags['temporary-access']).toBe(false);
    expect(resolved.skillXp.survival).toBe(40);
    expect(resolved.resourcePools['memory-debt'].current).toBe(12);
    expect(resolved.resourcePools.air.current).toBe(100);
    expect(resolved.actionCompletions['pick-up-water']).toBe(3);
    expect(resolved.actionCompletions['temporary-action']).toBeUndefined();
    expect(resolved.discoveredLocationIds).toEqual(['cryopod', 'storage']);
    expect(resolved.runLog.map((entry) => entry.event)).toEqual(expect.arrayContaining([
      'gm.update',
      'player.choice',
      'action.start',
      'state.reset',
    ]));
    expect(resolved.runLog.find((entry) => entry.event === 'player.choice')?.data).toMatchObject({
      feedback: { expectedActions: [{ label: 'Check the pressure gauge' }] },
    });
    expect(resolved.chatMessages[resolved.chatMessages.length - 1]?.key).toBe('resource.air.empty');
  });
});
