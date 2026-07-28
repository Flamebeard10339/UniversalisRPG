import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { point } from './range';
import { createGameState, resolve, useAction } from './runtime';
import { loadModule } from './registry';
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
  it('starts full, drains as the rat bites back, then regenerates from a meal as time passes', () => {
    const { state } = startSession(registry);
    expect(state.resources['health']).toBe(30); // full = statValue(max-health) at start

    // A real fight now rather than the Pass-2 `-120 regeneration` drain tag: one
    // `use:` is one swing at 25/min, and the rat answers on its own 16/min clock.
    useAction('entity', 'giant-rat', 'fight', registry, state);
    expect(state.time).toBeCloseTo(2.4, 6);

    resolve(state, registry, 120); // far longer than the ~6s the rat lasts
    const afterFighting = state.resources['health'];
    expect(state.flags['tutorial.rats-killed']).toBe(1);
    expect(afterFighting).toBeLessThan(30); // it got its bites in
    expect(state.log.some((line) => line.startsWith('The Giant Rat hits you for '))).toBe(true);
    expect(state.log.some((line) => line.startsWith('You hit the Giant Rat for '))).toBe(true);

    // A meal grants +3 regeneration/min for 60s (exactly what grantFoodBuff does
    // when a food item is eaten); health then rises as time passes — a standing
    // buff needs no active action to tick.
    state.activeBuffs['cooked-shrimp:regeneration'] = { statId: 'regeneration', amount: point(3), kind: 'added', expiresAt: state.time + 60 };
    resolve(state, registry, state.time + 60);
    expect(state.resources['health']).toBeCloseTo(Math.min(30, afterFighting + 3), 6);
  });
});
