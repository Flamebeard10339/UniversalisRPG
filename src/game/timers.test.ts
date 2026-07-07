import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResolutionContext, GameAction } from './types';
import { appendChatMessage, appendRunLog, applyStateReset, chooseDialogueOption, createInitialPlayState, dropInventoryItem, pickUpGroundItem, resolveIdleTimers, startAction } from './timers';

describe('appendChatMessage', () => {
  it('uses monotonic ids for messages emitted at the same timestamp', () => {
    const state = createInitialPlayState('test-universe', 'test-location');
    const first = appendChatMessage(state, { author: 'system', key: 'first' }, 1_000);
    const second = appendChatMessage(first, { author: 'system', key: 'second' }, 1_000);

    expect(second.chatMessages.map((message) => message.id)).toEqual([1_000, 1_001]);
    expect(second.chatMessages.map((message) => message.createdAt)).toEqual([1_000, 1_000]);
  });
});

describe('appendRunLog', () => {
  it('retains only the newest 100 entries', () => {
    let state = createInitialPlayState('test-universe', 'test-location');

    for (let index = 0; index < 105; index += 1) {
      state = appendRunLog(state, 'engine', 'test.event', { index }, index);
    }

    expect(state.runLog).toHaveLength(100);
    expect(state.runLog[0].sequence).toBe(6);
    expect(state.runLog[99].sequence).toBe(105);
    expect(state.nextRunLogSequence).toBe(106);
  });
});

describe('entity collection actions', () => {
  it('grants xp, rolls drops, and updates collection counters for location entity actions', () => {
    const action: GameAction = {
      id: 'fight-goblin',
      durationSeconds: 1,
      rewards: [
        { kind: 'skillXp', skillId: 'attack', amount: 3 },
        { kind: 'dropTable', dropTableId: 'goblin-drops' },
      ],
      experience: [{ event: 'action-complete', skillId: 'attack', amount: 2 }],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [{ id: 'attack', maxLevel: 100 }],
      stats: [],
      locations: [
        { id: 'road', position: { x: 0, y: 0 }, starting: true, entities: ['goblin'] },
        { id: 'town', position: { x: 1, y: 0 } },
      ],
      entities: [{
        id: 'goblin',
        actionIds: ['fight-goblin'],
        collectionLog: [{
          categoryId: 'enemies',
          actionId: 'fight-goblin',
          dropTableIds: ['goblin-drops'],
        }],
      }],
      items: [{ id: 'bones' }],
      flags: [],
      resourceDefinitions: [],
      effects: [],
      interactionTypes: [],
      enemies: [],
      dropTables: [{
        id: 'goblin-drops',
        mode: 'dependent',
        drops: [{ weight: 1, reward: { kind: 'item', itemId: 'bones', amount: 1 } }],
      }],
    };

    const started = startAction(createInitialPlayState('test-universe', 'road'), action, context, 1_000);
    const resolved = resolveIdleTimers(started, context, { random: () => 0 }, 2_000).state;
    const rejected = startAction({ ...resolved, currentLocationId: 'town' }, action, context, 3_000);

    expect(resolved.skillXp.attack).toBe(5);
    expect(resolved.inventory.bones).toBe(1);
    expect(resolved.actionCompletions['fight-goblin']).toBe(1);
    expect(resolved.collectionLog['entity:goblin:kills']).toBe(1);
    expect(resolved.collectionLog['entity:goblin:drops:bones']).toBe(1);
    expect(rejected.activeAction).toBeNull();
    expect(rejected.inventory.bones).toBe(1);
  });

  it('does not reset existing tracked drops when a later completion rolls no drop', () => {
    const action: GameAction = {
      id: 'fight-goblin',
      durationSeconds: 1,
      rewards: [{ kind: 'dropTable', dropTableId: 'goblin-drops' }],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [],
      stats: [],
      locations: [{ id: 'road', position: { x: 0, y: 0 }, starting: true, entities: ['goblin'] }],
      entities: [{
        id: 'goblin',
        actionIds: ['fight-goblin'],
        collectionLog: [{ categoryId: 'enemies', actionId: 'fight-goblin', dropTableIds: ['goblin-drops'] }],
      }],
      items: [{ id: 'iron-ore' }],
      flags: [],
      resourceDefinitions: [],
      effects: [],
      interactionTypes: [],
      enemies: [],
      dropTables: [{
        id: 'goblin-drops',
        mode: 'independent',
        drops: [{ weight: 3, reward: { kind: 'item', itemId: 'iron-ore', amount: 1 } }],
      }],
    };
    const started = startAction({
      ...createInitialPlayState('test-universe', 'road'),
      inventory: { 'iron-ore': 2 },
      collectionLog: {
        'entity:goblin:kills': 2,
        'entity:goblin:drops:iron-ore': 2,
      },
    }, action, context, 1_000);

    const resolved = resolveIdleTimers(started, context, { random: () => 0.9 }, 2_000).state;

    expect(resolved.inventory['iron-ore']).toBe(2);
    expect(resolved.collectionLog['entity:goblin:kills']).toBe(3);
    expect(resolved.collectionLog['entity:goblin:drops:iron-ore']).toBe(2);
  });

  it('can preserve collection log and whole inventory through state resets', () => {
    const context: ActionResolutionContext = {
      actions: [],
      skills: [{ id: 'attack', maxLevel: 100 }],
      stats: [],
      locations: [{ id: 'road', position: { x: 0, y: 0 }, starting: true }],
      items: [{ id: 'iron-ore' }],
      flags: [],
      resourceDefinitions: [],
      effects: [],
      interactionTypes: [],
      enemies: [],
      dropTables: [],
    };
    const state = {
      ...createInitialPlayState('test-universe', 'road'),
      inventory: { 'iron-ore': 2 },
      skillXp: { attack: 12 },
      collectionLog: {
        'entity:goblin:kills': 3,
        'entity:goblin:drops:iron-ore': 2,
      },
    };

    const reset = applyStateReset(state, context, {
      kind: 'reset-state',
      preserve: {
        inventory: true,
        skillXp: true,
        collectionLog: true,
      },
    }, 3_000);

    expect(reset.inventory['iron-ore']).toBe(2);
    expect(reset.skillXp.attack).toBe(12);
    expect(reset.collectionLog['entity:goblin:kills']).toBe(3);
    expect(reset.collectionLog['entity:goblin:drops:iron-ore']).toBe(2);
  });
});

describe('instant actions', () => {
  it('completes immediately without creating an active action or looping', () => {
    const action: GameAction = {
      id: 'talk',
      locationId: 'road',
      instant: true,
      rewards: [],
      results: [{ kind: 'dialogue', dialogueId: 'guide' }],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [],
      stats: [],
      locations: [{ id: 'road', position: { x: 0, y: 0 }, starting: true }],
      items: [],
      flags: [],
      resourceDefinitions: [],
      effects: [],
      interactionTypes: [],
      enemies: [],
      dialogues: [{
        id: 'guide',
        startNodeId: 'start',
        nodes: [{ id: 'start', textKey: 'start' }],
      }],
    };

    const started = startAction(createInitialPlayState('test-universe', 'road'), action, context, 1_000);

    expect(started.activeAction).toBeNull();
    expect(started.actionCompletions.talk).toBe(1);
    expect(started.activeDialogue).toEqual({ dialogueId: 'guide', nodeId: 'start' });
    expect(started.actionProgress.talk).toEqual({ elapsedMs: 0, runningSince: null, targetHealth: null });
  });
});

describe('action exhaustion and respawn', () => {
  const groveContext: ActionResolutionContext = {
    actions: [],
    skills: [],
    stats: [],
    locations: [{ id: 'grove', position: { x: 0, y: 0 }, starting: true }],
    items: [],
    flags: [],
    resourceDefinitions: [],
    effects: [],
    interactionTypes: [],
    enemies: [],
  };

  it('permanently exhausts once maxCompletions is reached when no respawnSeconds is set', () => {
    const action: GameAction = { id: 'pick-lock', locationId: 'grove', instant: true, rewards: [], maxCompletions: 1 };
    const context = { ...groveContext, actions: [action] };
    const now = Date.now();

    const afterFirst = startAction(createInitialPlayState('test', 'grove'), action, context, now);
    expect(afterFirst.actionCompletions['pick-lock']).toBe(1);

    const afterSecond = startAction(afterFirst, action, context, now + 1);
    expect(afterSecond.actionCompletions['pick-lock']).toBe(1);
  });

  it('respawns a used-up action after respawnSeconds', () => {
    const action: GameAction = { id: 'chop-tree', locationId: 'grove', instant: true, rewards: [], maxCompletions: 1, respawnSeconds: 30 };
    const context = { ...groveContext, actions: [action] };
    const now = Date.now();

    const afterFirst = startAction(createInitialPlayState('test', 'grove'), action, context, now);
    expect(afterFirst.actionCompletions['chop-tree']).toBe(1);
    expect(afterFirst.actionExhaustions['chop-tree']).toEqual([now + 30_000]);

    const stillBlocked = startAction(afterFirst, action, context, now + 10_000);
    expect(stillBlocked.actionCompletions['chop-tree']).toBe(1);

    const afterRespawn = startAction(afterFirst, action, context, now + 31_000);
    expect(afterRespawn.actionCompletions['chop-tree']).toBe(2);
    expect(afterRespawn.actionExhaustions['chop-tree']).toEqual([now + 30_000, now + 31_000 + 30_000]);
  });

  it('tracks independently-timed respawns per completion when capacity is greater than one', () => {
    const action: GameAction = { id: 'chop-tree', locationId: 'grove', instant: true, rewards: [], maxCompletions: 3, respawnSeconds: 30 };
    const context = { ...groveContext, actions: [action] };
    const now = Date.now();

    let state = startAction(createInitialPlayState('test', 'grove'), action, context, now);
    expect(state.actionCompletions['chop-tree']).toBe(1);

    state = startAction(state, action, context, now + 5_000);
    state = startAction(state, action, context, now + 5_100);
    expect(state.actionCompletions['chop-tree']).toBe(3);
    expect(state.actionExhaustions['chop-tree']).toEqual([now + 30_000, now + 5_000 + 30_000, now + 5_100 + 30_000]);

    const blocked = startAction(state, action, context, now + 6_000);
    expect(blocked.actionCompletions['chop-tree']).toBe(3);

    const afterFirstRespawn = startAction(state, action, context, now + 30_001);
    expect(afterFirstRespawn.actionCompletions['chop-tree']).toBe(4);

    const stillBlocked = startAction(afterFirstRespawn, action, context, now + 30_002);
    expect(stillBlocked.actionCompletions['chop-tree']).toBe(4);
  });
});

describe('ground items', () => {
  const context: ActionResolutionContext = {
    actions: [],
    skills: [],
    stats: [],
    locations: [{ id: 'road', position: { x: 0, y: 0 }, starting: true }],
    items: [{ id: 'log' }],
    flags: [],
    resourceDefinitions: [],
    effects: [],
    interactionTypes: [],
    enemies: [],
  };

  it('drops an inventory item to the ground and lets it be picked back up', () => {
    const now = Date.now();
    const state = { ...createInitialPlayState('test', 'road'), inventory: { log: 3 } };

    const dropped = dropInventoryItem(state, context, 'log', now);
    expect(dropped.inventory.log).toBe(0);
    expect(dropped.groundItems).toEqual([{ id: 'ground-1', itemId: 'log', amount: 3, locationId: 'road', expiresAt: now + 5 * 60 * 1000 }]);

    const pickedUp = pickUpGroundItem(dropped, context, 'ground-1', now + 1_000);
    expect(pickedUp.inventory.log).toBe(3);
    expect(pickedUp.groundItems).toEqual([]);
  });

  it('does not let a full inventory pick up a ground stack, and posts a chat message', () => {
    const now = Date.now();
    const fullContext: ActionResolutionContext = { ...context, manifest: { maxInventorySlots: 1 } as ActionResolutionContext['manifest'] };
    const state = {
      ...createInitialPlayState('test', 'road'),
      inventory: { bones: 1 },
      groundItems: [{ id: 'ground-1', itemId: 'log', amount: 1, locationId: 'road', expiresAt: now + 1_000 }],
    };

    const result = pickUpGroundItem(state, fullContext, 'ground-1', now);

    expect(result.inventory.log).toBeUndefined();
    expect(result.groundItems).toHaveLength(1);
    expect(result.chatMessages[result.chatMessages.length - 1]?.key).toBe('chat.groundItem.inventoryFull');
  });

  it('despawns ground items after 5 minutes via idle resolution', () => {
    const now = Date.now();
    const state = {
      ...createInitialPlayState('test', 'road'),
      groundItems: [{ id: 'ground-1', itemId: 'log', amount: 1, locationId: 'road', expiresAt: now + 1_000 }],
      lastTickAt: now,
    };

    const stillThere = resolveIdleTimers(state, context, {}, now + 500);
    expect(stillThere.state.groundItems).toHaveLength(1);

    const despawned = resolveIdleTimers(state, context, {}, now + 1_500);
    expect(despawned.state.groundItems).toHaveLength(0);
  });
});

describe('dialogue timers', () => {
  it('starts dialogue from an action and applies continue, option, branch, and item effects', () => {
    const action: GameAction = {
      id: 'speak',
      locationId: 'room',
      durationSeconds: 1,
      rewards: [],
      results: [{ kind: 'dialogue', dialogueId: 'guide' }],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [],
      stats: [],
      locations: [{ id: 'room', position: { x: 0, y: 0 }, starting: true }],
      items: [{ id: 'log' }, { id: 'gift' }],
      flags: [{ id: 'question-count', initialValue: 0 }],
      resourceDefinitions: [],
      effects: [],
      interactionTypes: [],
      enemies: [],
      dialogues: [{
        id: 'guide',
        startNodeId: 'start',
        nodes: [
          { id: 'start', textKey: 'start', gotoNodeId: 'menu' },
          {
            id: 'menu',
            options: [
              { id: 'ask', labelKey: 'ask', gotoNodeId: 'asked' },
              {
                id: 'give-log',
                labelKey: 'give',
                conditions: { kind: 'state-variable', variable: 'item:log', comparison: 'greater-than', value: 0 },
                results: [{ kind: 'item', itemId: 'log', amount: -1 }],
                gotoNodeId: 'gift',
              },
            ],
          },
          {
            id: 'asked',
            results: [{ kind: 'state-variable-delta', variable: 'flag:question-count', amount: 1 }],
            branches: [
              { conditions: { kind: 'state-variable', variable: 'flag:question-count', comparison: 'equal', value: 1 }, gotoNodeId: 'first-answer' },
            ],
          },
          { id: 'first-answer', textKey: 'answer', gotoNodeId: 'menu' },
          { id: 'gift', narratorKey: 'gift', results: [{ kind: 'item', itemId: 'gift', amount: 1 }] },
        ],
      }],
    };
    const startedAt = 1_000;
    const state = startAction({
      ...createInitialPlayState('test', 'room'),
      inventory: { log: 1 },
      resources: { log: 1 },
    }, action, context, startedAt);

    const opened = resolveIdleTimers(state, context, {}, startedAt + 1_000).state;

    expect(opened.activeDialogue).toEqual({ dialogueId: 'guide', nodeId: 'start' });

    const menu = chooseDialogueOption(opened, context, undefined, startedAt + 1_001);
    const answer = chooseDialogueOption(menu, context, 'ask', startedAt + 1_002);

    expect(answer.activeDialogue).toEqual({ dialogueId: 'guide', nodeId: 'first-answer' });
    expect(answer.flags['question-count']).toBe(1);

    const returnedMenu = chooseDialogueOption(answer, context, undefined, startedAt + 1_003);
    const gifted = chooseDialogueOption(returnedMenu, context, 'give-log', startedAt + 1_004);

    expect(gifted.activeDialogue).toEqual({ dialogueId: 'guide', nodeId: 'gift' });
    expect(gifted.inventory.log).toBe(0);
    expect(gifted.inventory.gift).toBe(1);
  });
});

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
    const activeState = {
      ...startAction(createInitialPlayState('test-universe', 'test-location'), action, startedAt),
      actionLoopingEnabled: false,
    };
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

  it('applies state-variable completion results', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'move-and-mark',
      locationId: 'test-location',
      durationSeconds: 1,
      rewards: [],
      results: [
        { kind: 'state-variable', variable: 'location', value: 'next-location' },
        { kind: 'state-variable', variable: 'flag:death-count', value: 2 },
      ],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [],
      stats: [],
      locations: [
        { id: 'test-location', position: { x: 0, y: 0 }, starting: true },
        { id: 'next-location', position: { x: 1, y: 0 } },
      ],
      flags: [{ id: 'death-count', initialValue: 0 }],
      interactionTypes: [],
      enemies: [],
    };
    const state = {
      ...startAction(createInitialPlayState('test-universe', 'test-location'), action, context, startedAt),
      actionLoopingEnabled: false,
    };

    const resolved = resolveIdleTimers(state, context, {}, startedAt + 1_000);

    expect(resolved.state.currentLocationId).toBe('next-location');
    expect(resolved.state.discoveredLocationIds).toContain('next-location');
    expect(resolved.state.flags['death-count']).toBe(2);
  });

  it('announces skill level ups from reward experience', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'train-attack',
      locationId: 'test-location',
      durationSeconds: 1,
      rewards: [{ kind: 'skillXp', skillId: 'attack', amount: 1000 }],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [{ id: 'attack', maxLevel: 100 }],
      stats: [],
      locations: [{ id: 'test-location', position: { x: 0, y: 0 }, starting: true }],
      interactionTypes: [],
      enemies: [],
    };
    const state = startAction(createInitialPlayState('test-universe', 'test-location'), action, context, startedAt);

    const resolved = resolveIdleTimers(state, context, {}, startedAt + 1_000);

    expect(resolved.state.skillXp.attack).toBe(1000);
    expect(resolved.state.chatMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'chat.skillLevelUp',
        params: { 'skill-name': 'skill.attack.title', 'new-level': 2 },
      }),
    ]));
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
    const activeState = {
      ...startAction(createInitialPlayState('test-universe', 'test-location'), action, startedAt),
      actionLoopingEnabled: false,
    };
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

  it('uses the universe loop default over stale saved action looping state', () => {
    const startedAt = 1_000;
    const rejoinedAt = startedAt + 11_000;
    const action: GameAction = {
      id: 'loop-default-action',
      locationId: 'test-location',
      durationSeconds: 10,
      rewards: [],
    };
    const activeState = {
      ...startAction(createInitialPlayState('test-universe', 'test-location'), action, startedAt),
      actionLoopingEnabled: false,
    };
    const context: ActionResolutionContext = {
      manifest: {
        schemaVersion: 1,
        id: 'test-universe',
        version: '0.1.0',
        author: 'test',
        locales: ['en'],
        files: [],
        ui: { loopActionsByDefault: true },
      },
      actions: [action],
      skills: [],
      stats: [],
      resourceDefinitions: [],
      effects: [],
      interactionTypes: [],
      enemies: [],
    };

    const resolved = resolveIdleTimers(activeState, context, { showReport: true }, rejoinedAt);

    expect(resolved.state.actionLoopingEnabled).toBe(true);
    expect(resolved.state.activeAction).toMatchObject({ actionId: 'loop-default-action' });
    expect(resolved.report).toMatchObject({ kind: 'actionCompleted', actionId: 'loop-default-action' });
  });

  it('does not apply resource effects when no action is active', () => {
    const context: ActionResolutionContext = {
      actions: [],
      skills: [{ id: 'regeneration', maxLevel: 100 }],
      stats: [{ id: 'health', base: 100 }, { id: 'regeneration', base: 60 }],
      resourceDefinitions: [{ id: 'health', sourceStat: 'health', initialValue: 'full' }],
      effects: [{ id: 'health-regeneration', resourceId: 'health', sourceStat: 'regeneration' }],
      interactionTypes: [],
      enemies: [],
    };
    const state = {
      ...createInitialPlayState('test-universe', 'test-location'),
      equipmentSkillBonuses: { regeneration: { added: 93 } },
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
      stats: [{ id: 'health', base: 100 }, { id: 'regeneration', base: 60 }],
      resourceDefinitions: [{ id: 'health', sourceStat: 'health', initialValue: 'full' }],
      effects: [{ id: 'health-regeneration', resourceId: 'health', sourceStat: 'regeneration' }],
      interactionTypes: [],
      enemies: [],
    };
    const state = {
      ...startAction(createInitialPlayState('test-universe', 'test-location'), action, context, startedAt),
      actionLoopingEnabled: false,
      equipmentSkillBonuses: { regeneration: { added: 93 } },
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

  it('reports continuous action remaining time from a four hour cap', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'long-fight',
      locationId: 'arena',
      durationSeconds: 1,
      enemyId: 'dummy',
      rewards: [],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [],
      stats: [
        { id: 'attack', base: 1 },
        { id: 'defense', base: 1 },
        { id: 'health', base: 100 },
      ],
      locations: [{ id: 'arena', position: { x: 0, y: 0 }, starting: true }],
      resourceDefinitions: [],
      effects: [],
      interactionTypes: [{ id: 'combat', sourceStatId: 'attack', targetStatId: 'defense', targetPlayerHealth: false }],
      enemies: [{ id: 'dummy', interactionTypeId: 'combat', stats: { attack: 1, defense: 1, health: 100 }, rewards: [] }],
    };
    const state = startAction(createInitialPlayState('test-universe', 'arena'), action, context, startedAt);

    const resolved = resolveIdleTimers(state, context, { showReport: true }, startedAt + 60 * 60 * 1000);

    expect(resolved.report).toMatchObject({
      kind: 'inProgress',
      timerKind: 'action',
      actionId: 'long-fight',
      remainingMs: 3 * 60 * 60 * 1000,
    });
  });

  it('stops continuous actions at the four hour cap without resolving a free completion', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'capped-fight',
      locationId: 'arena',
      durationSeconds: 1,
      enemyId: 'dummy',
      rewards: [{ kind: 'resource', resourceId: 'fang', amount: 1 }],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [],
      stats: [
        { id: 'attack', base: 1 },
        { id: 'defense', base: 1 },
        { id: 'health', base: 100 },
      ],
      locations: [{ id: 'arena', position: { x: 0, y: 0 }, starting: true }],
      resourceDefinitions: [],
      effects: [],
      interactionTypes: [{ id: 'combat', sourceStatId: 'attack', targetStatId: 'defense', targetPlayerHealth: false }],
      enemies: [{ id: 'dummy', interactionTypeId: 'combat', stats: { attack: 1, defense: 1, health: 100 }, rewards: [] }],
    };
    const state = startAction(createInitialPlayState('test-universe', 'arena'), action, context, startedAt);

    const resolved = resolveIdleTimers(state, context, { showReport: true }, startedAt + 5 * 60 * 60 * 1000);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.resources.fang).toBeUndefined();
    expect(resolved.report).toMatchObject({
      kind: 'actionFailed',
      actionId: 'capped-fight',
      completedAt: startedAt + 4 * 60 * 60 * 1000,
    });
  });

  it('applies active effects from base player stats when stat definitions only declare ids', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'base-stat-rest-action',
      locationId: 'test-location',
      durationSeconds: 10,
      rewards: [],
    };
    const context: ActionResolutionContext = {
      manifest: {
        schemaVersion: 1,
        id: 'test-universe',
        version: '0.1.0',
        author: 'test',
        locales: ['en'],
        files: [],
      },
      actions: [action],
      skills: [],
      stats: [{ id: 'health', base: 100 }, { id: 'regeneration', base: 60 }],
      resourceDefinitions: [{ id: 'health', sourceStat: 'health', initialValue: 'full' }],
      effects: [{ id: 'health-regeneration', resourceId: 'health', sourceStat: 'regeneration' }],
      interactionTypes: [],
      enemies: [],
    };
    const state = {
      ...startAction(createInitialPlayState('test-universe', 'test-location'), action, context, startedAt),
      resourcePools: {
        health: { current: 50, min: 0, max: 100 },
      },
      playerHealth: 50,
      playerMaxHealth: 100,
    };

    const resolved = resolveIdleTimers(state, context, { showReport: true }, startedAt + 10_000);

    expect(resolved.state.resourcePools.health.current).toBe(60);
    expect(resolved.state.playerHealth).toBe(60);
  });

  it('grants universe health regeneration experience by source stat regardless of the active action', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'wait',
      locationId: 'test-location',
      durationSeconds: 60,
      rewards: [],
    };
    const context: ActionResolutionContext = {
      manifest: {
        schemaVersion: 1,
        id: 'test-universe',
        version: '1',
        author: 'test',
        locales: ['en'],
        files: [],
        experience: [
          { event: 'health-regenerated', skillId: 'regeneration', sourceStat: 'regeneration' },
          { event: 'health-regenerated', skillId: 'troll-blood', sourceStat: 'troll-blood' },
        ],
      },
      actions: [action],
      skills: [
        { id: 'regeneration', maxLevel: 100, statId: 'regeneration', addedPerLevel: 0, increasedPerLevel: 0 },
        { id: 'troll-blood', maxLevel: 100, statId: 'troll-blood', addedPerLevel: 0, increasedPerLevel: 0 },
      ],
      stats: [
        { id: 'health', base: 1000 },
        { id: 'regeneration', base: 10 },
        { id: 'troll-blood', base: 100 },
      ],
      resourceDefinitions: [{ id: 'health', sourceStat: 'health', initialValue: 'full' }],
      effects: [
        { id: 'health-regeneration', resourceId: 'health', sourceStat: 'regeneration' },
        { id: 'health-troll-blood', resourceId: 'health', sourceStat: 'troll-blood' },
      ],
      interactionTypes: [],
      enemies: [],
    };
    const state = {
      ...startAction(createInitialPlayState('test-universe', 'test-location'), action, context, startedAt),
      actionLoopingEnabled: false,
      resourcePools: {
        health: { current: 100, min: 0, max: 1000 },
      },
      playerHealth: 100,
      playerMaxHealth: 1000,
    };

    const resolved = resolveIdleTimers(state, context, {}, startedAt + 60_000);

    expect(resolved.state.resourcePools.health.current).toBe(210);
    expect(resolved.state.skillXp.regeneration).toBe(10);
    expect(resolved.state.skillXp['troll-blood']).toBe(100);
  });

  it('grants interaction damage experience and preserves action experience', () => {
    const startedAt = 1_000;
    const fightGoblin: GameAction = {
      id: 'fight-goblin',
      locationId: 'arena',
      durationSeconds: 1,
      enemyId: 'goblin',
      rewards: [],
      experience: [
        { event: 'damage-dealt', skillId: 'attack', amount: 3 },
      ],
    };
    const chopTree: GameAction = {
      id: 'chop-tree',
      locationId: 'arena',
      durationSeconds: 1,
      enemyId: 'tree',
      rewards: [],
    };
    const context: ActionResolutionContext = {
      actions: [fightGoblin, chopTree],
      skills: [
        { id: 'attack', maxLevel: 100, statId: 'attack' },
        { id: 'woodcutting', maxLevel: 100, statId: 'woodcutting' },
      ],
      stats: [
        { id: 'attack', base: 10 },
        { id: 'woodcutting', base: 10 },
        { id: 'defense', base: 10 },
        { id: 'action-rate', base: 60 },
      ],
      resourceDefinitions: [{
        id: 'action-rate',
        sourceStat: 'action-rate',
        max: 60,
        initialValue: 'empty',
        onFull: [
          { kind: 'complete-action' },
          { kind: 'refill', value: 'min' },
        ],
      }],
      effects: [{
        id: 'action-rate-regeneration',
        resourceId: 'action-rate',
        sourceStat: 'action-rate',
        rateUnit: 'per-second',
      }],
      interactionTypes: [
        { id: 'combat', sourceStatId: 'attack', targetStatId: 'defense', targetPlayerHealth: false, experience: [{ event: 'damage-dealt', skillId: 'attack' }] },
        { id: 'woodcutting', sourceStatId: 'woodcutting', targetStatId: 'defense', targetPlayerHealth: false, experience: [{ event: 'damage-dealt', skillId: 'woodcutting' }] },
      ],
      enemies: [
        { id: 'goblin', interactionTypeId: 'combat', stats: { health: 100, defense: 10 }, rewards: [] },
        { id: 'tree', interactionTypeId: 'woodcutting', stats: { health: 100, defense: 10 }, rewards: [] },
      ],
    };
    const afterGoblin = resolveIdleTimers(
      startAction(createInitialPlayState('test-universe', 'arena'), fightGoblin, context, startedAt),
      context,
      { random: () => 0 },
      startedAt + 1_000,
    ).state;
    const afterTree = resolveIdleTimers(
      startAction({ ...afterGoblin, activeAction: null }, chopTree, context, startedAt + 2_000),
      context,
      { random: () => 0 },
      startedAt + 3_000,
    ).state;

    expect(afterGoblin.skillXp.attack).toBeGreaterThan(3);
    expect(afterGoblin.skillXp.woodcutting).toBeUndefined();
    expect(afterTree.skillXp.attack).toBe(afterGoblin.skillXp.attack);
    expect(afterTree.skillXp.woodcutting).toBeGreaterThan(0);
  });

  it('grants health xp for damage taken and defense xp for incoming misses', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'defend',
      locationId: 'arena',
      durationSeconds: 1,
      enemyId: 'sparring-enemy',
      rewards: [],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [
        { id: 'health', maxLevel: 100, statId: 'health' },
        { id: 'defense', maxLevel: 100, statId: 'defense' },
      ],
      stats: [
        { id: 'attack', base: 1 },
        { id: 'defense', base: 10 },
        { id: 'health', base: 100 },
        { id: 'action-rate', base: 60 },
      ],
      resourceDefinitions: [{
        id: 'enemy-action-rate',
        owner: 'enemy',
        sourceStat: 'action-rate',
        max: 60,
        initialValue: 'empty',
        onFull: [
          { kind: 'enemy-attack' },
          { kind: 'refill', value: 'min' },
        ],
      }, {
        id: 'health',
        sourceStat: 'health',
        initialValue: 'full',
      }],
      effects: [{
        id: 'enemy-action-rate-regeneration',
        resourceId: 'enemy-action-rate',
        sourceStat: 'action-rate',
        sourceEnemyStat: 'rate',
        rateUnit: 'per-second',
      }],
      interactionTypes: [{
        id: 'combat',
        sourceStatId: 'attack',
        targetStatId: 'defense',
        targetPlayerHealth: true,
        experience: [
          { event: 'damage-taken', skillId: 'health' },
          { event: 'incoming-attack-missed', skillId: 'defense', amount: 10 },
        ],
      }],
      enemies: [{
        id: 'sparring-enemy',
        interactionTypeId: 'combat',
        stats: { attack: 10, health: 100, rate: 60, critMultiplier: 1 },
        rewards: [],
      }],
    };
    const hitState = resolveIdleTimers(
      startAction(createInitialPlayState('test-universe', 'arena'), action, context, startedAt),
      context,
      { random: () => 0.49 },
      startedAt + 1_000,
    ).state;
    const missState = resolveIdleTimers(
      startAction(createInitialPlayState('test-universe', 'arena'), action, context, startedAt),
      context,
      { random: () => 1 },
      startedAt + 1_000,
    ).state;

    expect(hitState.skillXp.health).toBeGreaterThan(0);
    expect(hitState.skillXp.defense).toBeUndefined();
    expect(missState.skillXp.health).toBeUndefined();
    expect(missState.skillXp.defense).toBe(10);
  });

  it('carries overflow through repeated reset-on-full resource loops', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'charge-action',
      locationId: 'test-location',
      durationSeconds: 120,
      rewards: [],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [],
      stats: [{ id: 'charge-capacity', base: 100 }, { id: 'charge-rate', base: 1000 }],
      resourceDefinitions: [{
        id: 'charge',
        sourceStat: 'charge-capacity',
        initialValue: 'empty',
        onFull: [
          { kind: 'refill', value: 'min' },
          { kind: 'chat', messageKey: 'resource.charge.full' },
        ],
      }],
      effects: [{ id: 'charge-rate', resourceId: 'charge', sourceStat: 'charge-rate' }],
      interactionTypes: [],
      enemies: [],
    };
    const state = startAction(createInitialPlayState('test-universe', 'test-location'), action, context, startedAt);

    const resolved = resolveIdleTimers(state, context, {}, startedAt + 60_000);

    expect(resolved.state.resourcePools.charge.current).toBe(0);
    expect(resolved.state.chatMessages.find((message) => message.key === 'resource.charge.full')?.count).toBe(10);
  });

  it('fires full-boundary action-rate behavior when the stored pool is already full', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'fight-dummy',
      locationId: 'arena',
      durationSeconds: 60,
      enemyId: 'dummy',
      rewards: [],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [],
      stats: [
        { id: 'attack', base: 100 },
        { id: 'defense', base: 10 },
        { id: 'action-rate', base: 60 },
      ],
      resourceDefinitions: [{
        id: 'action-rate',
        sourceStat: 'action-rate',
        max: 60,
        initialValue: 'empty',
        onFull: [
          { kind: 'complete-action' },
          { kind: 'refill', value: 'min' },
        ],
      }],
      effects: [{
        id: 'action-rate-regeneration',
        resourceId: 'action-rate',
        sourceStat: 'action-rate',
        rateUnit: 'per-second',
      }],
      interactionTypes: [{ id: 'combat', sourceStatId: 'attack', targetStatId: 'defense', targetPlayerHealth: false }],
      enemies: [{ id: 'dummy', interactionTypeId: 'combat', stats: { health: 100, defense: 10 }, rewards: [] }],
    };
    const state = {
      ...startAction(createInitialPlayState('test-universe', 'arena'), action, context, startedAt),
      resourcePools: {
        'action-rate': { current: 60, min: 0, max: 60 },
      },
    };

    const resolved = resolveIdleTimers(state, context, { random: () => 0 }, startedAt + 1_000);

    expect(resolved.state.resourcePools['action-rate'].current).toBe(0);
    expect(resolved.state.activeAction?.targetHealth).toBeLessThan(100);
    expect(resolved.state.chatMessages[0].key).toBe('interaction.combat.player.hit');
  });

  it('resets resources for inactive reset effects after stopping an interaction', () => {
    const context: ActionResolutionContext = {
      actions: [{
        id: 'spar',
        locationId: 'arena',
        durationSeconds: 60,
        interactionTypeId: 'melee-combat',
        rewards: [],
      }],
      skills: [],
      stats: [{ id: 'action-rate', base: 25 }],
      resourceDefinitions: [{ id: 'action-rate', sourceStat: 'action-rate', max: 60, initialValue: 'empty' }],
      effects: [{
        id: 'action-rate-regeneration',
        resourceId: 'action-rate',
        sourceStat: 'action-rate',
        rateUnit: 'per-second',
        activeWhen: { kind: 'state-variable', variable: 'active-interaction', comparison: 'equal', value: true },
        resetResourceWhenInactive: true,
      }],
      interactionTypes: [{ id: 'melee-combat', sourceStatId: 'action-rate', targetStatId: 'action-rate', targetPlayerHealth: false }],
      enemies: [],
    };
    const state = {
      ...createInitialPlayState('test-universe', 'arena'),
      resourcePools: {
        'action-rate': { current: 25, min: 0, max: 60 },
      },
    };

    const resolved = resolveIdleTimers(state, context, {}, 2_000);

    expect(resolved.state.resourcePools['action-rate'].current).toBe(0);
  });

  it('recovers stale zero-capacity health pools from base player stats', () => {
    const context: ActionResolutionContext = {
      manifest: {
        schemaVersion: 1,
        id: 'test-universe',
        version: '0.1.0',
        author: 'test',
        locales: ['en'],
        files: [],
      },
      actions: [],
      skills: [],
      stats: [{ id: 'health', base: 100 }, { id: 'regeneration', base: 10 }],
      resourceDefinitions: [{ id: 'health', sourceStat: 'health', initialValue: 'full' }],
      effects: [{ id: 'health-regeneration', resourceId: 'health', sourceStat: 'regeneration' }],
      interactionTypes: [],
      enemies: [],
    };
    const state = {
      ...createInitialPlayState('test-universe', 'test-location'),
      resourcePools: {
        health: { current: 0, min: 0, max: 0 },
      },
      playerHealth: 0,
      playerMaxHealth: 0,
    };

    const resolved = resolveIdleTimers(state, context, {}, 1_000);

    expect(resolved.state.resourcePools.health).toEqual({ current: 100, min: 0, max: 100 });
    expect(resolved.state.playerHealth).toBe(100);
    expect(resolved.state.playerMaxHealth).toBe(100);
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
      skills: [{ id: 'health-capacity', maxLevel: 100 }],
      stats: [{ id: 'health-capacity', base: 100 }, { id: 'poison', base: -60 }],
      locations: [{ id: 'test-location', position: { x: 0, y: 0 }, starting: true }],
      resourceDefinitions: [{
        id: 'health',
        sourceStat: 'health-capacity',
        initialValue: 'full',
        onEmpty: [
          { kind: 'stop-action' },
          { kind: 'refill', value: 'max' },
          { kind: 'relocate', locationId: 'starting-location' },
          { kind: 'chat', messageKey: 'resource.health.empty' },
        ],
      }],
      effects: [{ id: 'poison', resourceId: 'health', sourceStat: 'poison' }],
      interactionTypes: [],
      enemies: [],
    };
    const state = {
      ...startAction(createInitialPlayState('test-universe', 'test-location'), action, context, startedAt),
      equipmentSkillBonuses: { 'health-capacity': { added: 93 } },
      resourcePools: {
        health: { current: 10, min: 0, max: 100 },
      },
      playerHealth: 10,
    };

    const resolved = resolveIdleTimers(state, context, { showReport: true }, startedAt + 30_000);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.resourcePools.health.current).toBe(100);
    expect(resolved.state.playerHealth).toBe(100);
    expect(resolved.state.actionProgress['danger-action']).toMatchObject({
      elapsedMs: 0,
      runningSince: null,
      targetHealth: null,
    });
    expect(resolved.state.chatMessages[0].key).toBe('resource.health.empty');
  });

  it('cancels an adversarial action when enemy damage empties player health and respawns', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'fight-test-enemy',
      locationId: 'danger-room',
      durationSeconds: 60,
      enemyId: 'test-enemy',
      rewards: [{ kind: 'skillXp', skillId: 'attack', amount: 1 }],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [{ id: 'attack', maxLevel: 100, statId: 'attack' }],
      stats: [
        { id: 'attack', base: 10 },
        { id: 'defense', base: 0 },
        { id: 'action-rate', base: 25 },
        { id: 'health', base: 100 },
      ],
      locations: [
        { id: 'respawn', position: { x: 0, y: 0 }, starting: true },
        { id: 'danger-room', position: { x: 1, y: 0 } },
      ],
      resourceDefinitions: [{
        id: 'enemy-action-rate',
        owner: 'enemy',
        sourceStat: 'action-rate',
        max: 60,
        initialValue: 'empty',
        onFull: [
          { kind: 'enemy-attack' },
          { kind: 'refill', value: 'min' },
        ],
      }, {
        id: 'enemy-health',
        owner: 'enemy',
        sourceStat: 'action-rate',
        sourceEnemyStat: 'health',
        initialValue: 'full',
      }, {
        id: 'health',
        sourceStat: 'health',
        initialValue: 'full',
        onEmpty: [
          { kind: 'reset-state', locationId: 'starting-location', preserve: { skillXp: true } },
          { kind: 'chat', messageKey: 'resource.health.empty' },
        ],
      }],
      effects: [{
        id: 'enemy-action-rate-regeneration',
        resourceId: 'enemy-action-rate',
        sourceStat: 'action-rate',
        sourceEnemyStat: 'rate',
        rateUnit: 'per-second',
        activeWhen: { kind: 'state-variable', variable: 'active-interaction', comparison: 'equal', value: true },
        resetResourceWhenInactive: true,
      }, {
        id: 'enemy-health-regeneration',
        resourceId: 'enemy-health',
        sourceStat: 'action-rate',
        sourceEnemyStat: 'regeneration',
        activeWhen: { kind: 'state-variable', variable: 'active-interaction', comparison: 'equal', value: true },
      }],
      interactionTypes: [{
        id: 'test-combat',
        sourceStatId: 'attack',
        targetStatId: 'defense',
        targetPlayerHealth: true,
      }],
      enemies: [{
        id: 'test-enemy',
        interactionTypeId: 'test-combat',
        stats: {
          attack: 200,
          health: 10,
          rate: 60,
          critMultiplier: 1,
        },
        rewards: [],
      }],
    };
    const state = {
      ...startAction(createInitialPlayState('test-universe', 'danger-room'), action, context, startedAt),
      resourcePools: {
        health: { current: 5, min: 0, max: 100 },
      },
      playerHealth: 5,
      playerMaxHealth: 100,
    };

    const resolved = resolveIdleTimers(state, context, { random: () => 0.5 }, startedAt + 1_000);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.currentLocationId).toBe('respawn');
    expect(resolved.state.resourcePools.health.current).toBe(100);
    expect(resolved.state.playerHealth).toBe(100);
    expect(resolved.state.chatMessages[resolved.state.chatMessages.length - 1]?.key).toBe('resource.health.empty');
  });

  it('timestamps delayed narration and announces when the last optional action is exhausted', () => {
    const startedAt = 1_000;
    const action: GameAction = {
      id: 'look-around',
      locationId: 'room',
      durationSeconds: 1,
      maxCompletions: 1,
      role: 'optional',
      rewards: [],
      results: [{ kind: 'chat', messageKey: 'event.second-beat', delaySeconds: 1 }],
    };
    const context: ActionResolutionContext = {
      actions: [action],
      skills: [],
      locations: [{ id: 'room', position: { x: 0, y: 0 }, starting: true }],
      interactionTypes: [],
      enemies: [],
    };
    const state = startAction(createInitialPlayState('test-universe', 'room'), action, context, startedAt);

    const resolved = resolveIdleTimers(state, context, {}, startedAt + 1_000);
    const messages = resolved.state.chatMessages;

    expect(messages.map((message) => message.key)).toEqual([
      'event.second-beat',
      'action.look-around.success',
      'location.room.exhausted',
    ]);
    expect(messages.find((message) => message.key === 'action.look-around.success')?.createdAt).toBe(2_000);
    expect(messages.find((message) => message.key === 'location.room.exhausted')?.createdAt).toBe(2_001);
    expect(messages.find((message) => message.key === 'event.second-beat')?.createdAt).toBe(3_000);
  });
});
