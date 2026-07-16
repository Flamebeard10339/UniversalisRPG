import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { createGameState, loadModule, runTest } from './runtime';

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
