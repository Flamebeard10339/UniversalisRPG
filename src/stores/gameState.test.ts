import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionResolutionContext } from '../game/types';

// The real implementation goes through Capacitor Preferences, which isn't
// available under vitest's node environment. Mocked here so we can control
// exactly when persistence resolves relative to the store's in-memory `set`.
vi.mock('../lib/storage', () => ({
  save: vi.fn(() => Promise.resolve()),
  load: vi.fn(() => Promise.resolve(null)),
  remove: vi.fn(() => Promise.resolve()),
}));

import { useGameState } from './gameState';
import { createInitialPlayState } from '../game/timers';

const universeId = 'test-universe';
const startingLocationId = 'start';
const emptyContext = {} as ActionResolutionContext;

describe('resetUniverse / importUniverseState / replaceUniverseState durability', () => {
  beforeEach(() => {
    useGameState.setState({
      states: {
        [universeId]: createInitialPlayState(universeId, startingLocationId),
      },
    });
  });

  it('does not let a reset clobber a mutation that happens while it is still persisting', async () => {
    const resetPromise = useGameState.getState().resetUniverse(universeId, startingLocationId);
    // Fires synchronously, before resetUniverse's storage write has resolved —
    // this used to race resetUniverse's delayed `set` and get clobbered.
    useGameState.getState().debugGiveItem(universeId, emptyContext, 'cooked-shrimp', 2);

    await resetPromise;
    await Promise.resolve();

    expect(useGameState.getState().states[universeId].inventory['cooked-shrimp']).toBe(2);
  });

  it('does not let replaceUniverseState clobber a mutation that happens while it is still persisting', async () => {
    const replacement = createInitialPlayState(universeId, startingLocationId);
    const replacePromise = useGameState.getState().replaceUniverseState(universeId, replacement);
    useGameState.getState().debugGiveItem(universeId, emptyContext, 'cooked-shrimp', 3);

    await replacePromise;
    await Promise.resolve();

    expect(useGameState.getState().states[universeId].inventory['cooked-shrimp']).toBe(3);
  });

  it('does not let importUniverseState clobber a mutation that happens while it is still persisting', async () => {
    const imported = createInitialPlayState(universeId, startingLocationId);
    const importPromise = useGameState.getState().importUniverseState(imported);
    useGameState.getState().debugGiveItem(universeId, emptyContext, 'cooked-shrimp', 4);

    await importPromise;
    await Promise.resolve();

    expect(useGameState.getState().states[universeId].inventory['cooked-shrimp']).toBe(4);
  });
});
