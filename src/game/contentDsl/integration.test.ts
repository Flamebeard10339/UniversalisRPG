import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { createGameState, loadModule, resolve, useAction } from './runtime';
import { runTest, startSession } from './session';

// End-to-end: authored content (content/tutorial-island.dsl) loaded and its
// # test scripts executed through the runtime — parser, hydration, and runtime
// meeting real hand-authored content for the first time.
const source = readFileSync('content/tutorial-island.dsl', 'utf8');
const registry = loadModule(source);

describe('tutorial-island content', () => {
  it('loads the expected kinds', () => {
    expect(registry.entities.size).toBeGreaterThan(0);
    expect(registry.dialogues.size).toBeGreaterThan(0);
    expect(registry.tests.size).toBeGreaterThan(0);
  });

  for (const id of registry.tests.keys()) {
    it(`test "${id}" passes`, () => {
      expect(runTest(id, registry, createGameState())).toEqual({ passed: true });
    });
  }
});

describe('tutorial-island health resource (Pass 2 end-to-end)', () => {
  it('starts full, drains while fighting the rats, then regenerates from a meal as time passes', () => {
    const { state } = startSession(registry);
    expect(state.resources['health']).toBe(30); // full = statValue(max-health) at start

    // The rats' `fight` carries a `-120 regeneration` tag, so net regeneration is
    // -120/min (-2/s) for the 3s fight => health drops by 6.
    useAction('entity', 'giant-rats', 'fight', registry, state);
    expect(state.time).toBe(3);
    expect(state.resources['health']).toBeCloseTo(24, 6);

    // A meal grants +3 regeneration/min for 60s (exactly what grantFoodBuff does
    // when a food item is eaten); health then rises as time passes — a standing
    // buff needs no active action to tick.
    state.activeBuffs['cooked-shrimp:regeneration'] = { statId: 'regeneration', amount: 3, kind: 'added', expiresAt: state.time + 60 };
    resolve(state, registry, state.time + 60);
    expect(state.resources['health']).toBeCloseTo(27, 6); // +3 over the minute, still under the 30 cap
  });
});
