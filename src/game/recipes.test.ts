import { describe, expect, it } from 'vitest';
import type { ActionResolutionContext, GameAction } from './types';
import { createInitialPlayState, resolveIdleTimers, startAction } from './timers';
import { availableRecipesForStation, resolveStationAction } from './recipes';

const cookStation: GameAction = { id: 'cook', locationId: 'start', stationId: 'campfire', rewards: [] };

const context: ActionResolutionContext = {
  actions: [cookStation],
  skills: [{ id: 'cooking', maxLevel: 100 }],
  stats: [],
  locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true }],
  items: [{ id: 'raw-shrimp' }, { id: 'cooked-shrimp' }, { id: 'draught' }, { id: 'raw-draught' }],
  flags: [{ id: 'well-fed' }],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dropTables: [],
  recipes: [
    { id: 'cook-shrimp', stationId: 'campfire', skillId: 'cooking', xpAmount: 4, durationSeconds: 2, inputs: [{ itemId: 'raw-shrimp', amount: 1 }], outputs: [{ itemId: 'cooked-shrimp', amount: 1 }] },
    { id: 'cook-draught', stationId: 'campfire', inputs: [{ itemId: 'raw-draught', amount: 1 }], outputs: [{ itemId: 'draught', amount: 1 }], extraResults: [{ kind: 'flag', flagId: 'well-fed', value: true }] },
  ],
};

describe('availableRecipesForStation', () => {
  it('only lists recipes whose ingredients are currently held', () => {
    let state = createInitialPlayState('test-universe', 'start');
    expect(availableRecipesForStation(state, 'campfire', context)).toEqual([]);

    state = { ...state, inventory: { ...state.inventory, 'raw-shrimp': 1 } };
    const available = availableRecipesForStation(state, 'campfire', context);
    expect(available.map((recipe) => recipe.id)).toEqual(['cook-shrimp']);
  });
});

describe('resolveStationAction', () => {
  it('turns a station action into a concrete action for the chosen recipe', () => {
    const resolved = resolveStationAction(cookStation, 'cook-shrimp', context);
    expect(resolved.requirements).toEqual({ kind: 'all', conditions: [{ kind: 'state-variable', variable: 'item:raw-shrimp', comparison: 'greater-than', value: 0 }] });
    expect(resolved.results).toEqual([
      { kind: 'item', itemId: 'raw-shrimp', amount: -1 },
      { kind: 'item', itemId: 'cooked-shrimp', amount: 1 },
    ]);
    expect(resolved.rewards).toEqual([{ kind: 'skillXp', skillId: 'cooking', amount: 4 }]);
  });

  it('blocks starting when no matching recipe is selected', () => {
    const resolved = resolveStationAction(cookStation, 'not-a-real-recipe', context);
    expect(resolved.requirements).toBeDefined();
    expect(resolved.rewards).toEqual([]);
    expect(resolved.results).toEqual([]);
  });
});

describe('crafting stations end to end', () => {
  it('consumes inputs and produces outputs once the recipe finishes', () => {
    let state = createInitialPlayState('test-universe', 'start');
    state = { ...state, inventory: { ...state.inventory, 'raw-shrimp': 1 } };
    state = startAction(state, cookStation, context, 1_000, { recipeId: 'cook-shrimp' });
    expect(state.activeAction?.recipeId).toBe('cook-shrimp');

    const settled = resolveIdleTimers(state, context, {}, 3_001).state;
    expect(settled.inventory['raw-shrimp'] ?? 0).toBe(0);
    expect(settled.inventory['cooked-shrimp']).toBe(1);
    expect(settled.skillXp.cooking).toBe(4);
    expect(settled.activeAction).toBeNull();
  });

  it('applies a recipe extraResults side effect on completion', () => {
    let state = createInitialPlayState('test-universe', 'start');
    state = { ...state, inventory: { ...state.inventory, 'raw-draught': 1 } };
    state = startAction(state, cookStation, context, 1_000, { recipeId: 'cook-draught' });

    const settled = resolveIdleTimers(state, context, {}, 3_001).state;
    expect(settled.inventory.draught).toBe(1);
    expect(settled.flags['well-fed']).toBe(true);
  });

  it('rejects starting a recipe the player cannot currently craft', () => {
    const state = createInitialPlayState('test-universe', 'start');
    const rejected = startAction(state, cookStation, context, 1_000, { recipeId: 'cook-shrimp' });
    expect(rejected.activeAction).toBeNull();
    expect(rejected.inventory['cooked-shrimp'] ?? 0).toBe(0);
  });

  it('starting a different recipe at the same station resets progress instead of resuming stale elapsed time', () => {
    let state = createInitialPlayState('test-universe', 'start');
    state = { ...state, inventory: { ...state.inventory, 'raw-shrimp': 1, 'raw-draught': 1 } };
    state = startAction(state, cookStation, context, 1_000, { recipeId: 'cook-shrimp' });
    // Pause partway through by starting the same recipe again.
    state = startAction(state, cookStation, context, 2_000, { recipeId: 'cook-shrimp' });
    expect(state.activeAction).toBeNull();
    expect(state.actionProgress.cook.elapsedMs).toBe(1_000);

    // Switching to a different recipe should not inherit the paused shrimp progress.
    state = startAction(state, cookStation, context, 2_000, { recipeId: 'cook-draught' });
    expect(state.actionProgress.cook.elapsedMs).toBe(0);

    const settled = resolveIdleTimers(state, context, {}, 5_000).state;
    expect(settled.inventory.draught).toBe(1);
    expect(settled.inventory['cooked-shrimp'] ?? 0).toBe(0);
  });
});
