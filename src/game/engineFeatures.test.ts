import { describe, expect, it } from 'vitest';
import type { ActionResolutionContext, GameAction } from './types';
import {
  applyStateReset,
  completeAction,
  createInitialPlayState,
  depositToBank,
  resolveIdleTimers,
  startAction,
  withdrawFromBank,
} from './timers';

const baseContext: ActionResolutionContext = {
  actions: [],
  skills: [],
  stats: [],
  locations: [
    { id: 'start', position: { x: 0, y: 0 }, starting: true },
    { id: 'mainland', position: { x: 1, y: 0 } },
  ],
  items: [{ id: 'gold' }, { id: 'shrimp' }, { id: 'herb' }],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dropTables: [],
};

describe('bank storage', () => {
  it('moves items between inventory and bank without creating or destroying them', () => {
    let state = createInitialPlayState('test-universe', 'start');
    state = { ...state, inventory: { ...state.inventory, gold: 10 } };

    const deposited = depositToBank(state, baseContext, 'gold', 6);
    expect(deposited.inventory.gold).toBe(4);
    expect(deposited.bank.gold).toBe(6);

    const withdrawn = withdrawFromBank(deposited, baseContext, 'gold', 6);
    expect(withdrawn.bank.gold ?? 0).toBe(0);
    expect(withdrawn.inventory.gold).toBe(10);
  });

  it('clamps deposits and withdrawals to what is actually available', () => {
    let state = createInitialPlayState('test-universe', 'start');
    state = { ...state, inventory: { ...state.inventory, gold: 3 } };

    const overDeposited = depositToBank(state, baseContext, 'gold', 100);
    expect(overDeposited.inventory.gold).toBe(0);
    expect(overDeposited.bank.gold).toBe(3);

    const overWithdrawn = withdrawFromBank(overDeposited, baseContext, 'gold', 100);
    expect(overWithdrawn.bank.gold ?? 0).toBe(0);
    expect(overWithdrawn.inventory.gold).toBe(3);
  });

  it('seeds starting bank contents from basePlayer.bank', () => {
    const context: ActionResolutionContext = { ...baseContext, manifest: { schemaVersion: 1, id: 'test', version: '1.0.0', author: 'test', locales: ['en'], files: [], basePlayer: { bank: { gold: 25 } } } };
    const state = resolveIdleTimers(createInitialPlayState('test-universe', 'start', context), context, {}, Date.now()).state;
    expect(state.bank.gold).toBe(25);
  });
});

describe('inventory slot cap', () => {
  const cappedContext: ActionResolutionContext = { ...baseContext, manifest: { schemaVersion: 1, id: 'test', version: '1.0.0', author: 'test', locales: ['en'], files: [], maxInventorySlots: 2 } };

  it('rejects a new item type once the slot cap is reached but allows growing an existing stack', () => {
    const give = (itemId: string): GameAction => ({ id: `give-${itemId}`, instant: true, rewards: [], results: [{ kind: 'item', itemId, amount: 1 }] });

    let state = createInitialPlayState('test-universe', 'start');
    state = completeAction(state, give('gold'), cappedContext, {}, 1_000);
    state = completeAction(state, give('shrimp'), cappedContext, {}, 1_000);
    expect(state.inventory.gold).toBe(1);
    expect(state.inventory.shrimp).toBe(1);

    state = completeAction(state, give('herb'), cappedContext, {}, 1_000);
    expect(state.inventory.herb ?? 0).toBe(0);

    state = completeAction(state, give('gold'), cappedContext, {}, 1_000);
    expect(state.inventory.gold).toBe(2);
  });
});

describe('expiring flags', () => {
  it('clears a flag once its duration has elapsed', () => {
    const eat: GameAction = { id: 'eat', instant: true, rewards: [], results: [{ kind: 'flag', flagId: 'well-fed', value: true, expiresAfterSeconds: 60 }] };
    let state = createInitialPlayState('test-universe', 'start');
    state = completeAction(state, eat, baseContext, {}, 1_000);
    expect(state.flags['well-fed']).toBe(true);

    const stillFed = resolveIdleTimers(state, baseContext, {}, 1_000 + 30_000).state;
    expect(stillFed.flags['well-fed']).toBe(true);

    const expired = resolveIdleTimers(state, baseContext, {}, 1_000 + 60_000).state;
    expect(expired.flags['well-fed']).toBe(false);
    expect(expired.flagExpirations['well-fed']).toBeUndefined();
  });

  it('treats a flag set without a duration as permanent', () => {
    const flip: GameAction = { id: 'flip', instant: true, rewards: [], results: [{ kind: 'flag', flagId: 'switched', value: true }] };
    let state = createInitialPlayState('test-universe', 'start');
    state = completeAction(state, flip, baseContext, {}, 1_000);

    const later = resolveIdleTimers(state, baseContext, {}, 1_000 + 10 * 60_000).state;
    expect(later.flags.switched).toBe(true);
  });
});

describe('chance-based actions', () => {
  const pick: GameAction = {
    id: 'pick-lock',
    instant: true,
    rewards: [],
    chance: 50,
    results: [{ kind: 'item', itemId: 'gold', amount: 5 }],
    failureResults: [{ kind: 'resource', resourceId: 'health', amount: -2 }],
  };

  it('applies results on success and skips failureResults', () => {
    const state = createInitialPlayState('test-universe', 'start');
    const next = completeAction(state, pick, baseContext, { random: () => 0 }, 1_000);
    expect(next.inventory.gold).toBe(5);
  });

  it('applies failureResults and skips results on failure, while still counting the completion', () => {
    const state = createInitialPlayState('test-universe', 'start');
    const next = completeAction(state, pick, baseContext, { random: () => 0.99 }, 1_000);
    expect(next.inventory.gold ?? 0).toBe(0);
    expect(next.actionCompletions['pick-lock']).toBe(1);
  });

  it('lets startAction override the RNG for an instant chance-based action', () => {
    const locatedPick: GameAction = { ...pick, locationId: 'start' };
    const state = createInitialPlayState('test-universe', 'start');
    const succeeded = startAction(state, locatedPick, baseContext, 1_000, { random: () => 0 });
    expect(succeeded.inventory.gold).toBe(5);

    const failed = startAction(state, locatedPick, baseContext, 1_000, { random: () => 0.99 });
    expect(failed.inventory.gold ?? 0).toBe(0);
  });
});

describe('spawn point', () => {
  it('defaults to the manifest starting location when no portal has been used', () => {
    const state = createInitialPlayState('test-universe', 'mainland');
    const reset = applyStateReset(state, baseContext, { kind: 'reset-state', locationId: 'starting-location' }, 2_000);
    expect(reset.currentLocationId).toBe('start');
  });

  it('respawns at the location set by a portal instead of the manifest starting location', () => {
    const usePortal: GameAction = { id: 'use-portal', instant: true, rewards: [], results: [{ kind: 'set-spawn', locationId: 'mainland' }] };
    let state = createInitialPlayState('test-universe', 'start');
    state = completeAction(state, usePortal, baseContext, {}, 1_000);
    expect(state.spawnLocationId).toBe('mainland');

    const reset = applyStateReset(state, baseContext, { kind: 'reset-state', locationId: 'starting-location' }, 2_000);
    expect(reset.currentLocationId).toBe('mainland');
  });
});
