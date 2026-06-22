import { describe, expect, it } from 'vitest';
import { evaluateCondition } from './conditions';
import { createInitialPlayState } from './timers';

const context = { actions: [], skills: [], interactionTypes: [], enemies: [] };

describe('death-count conditions', () => {
  it('supports exact loop requirements', () => {
    const state = { ...createInitialPlayState('test', 'start'), deathCount: 4 };

    expect(evaluateCondition({ kind: 'death-count', comparison: 'equal', value: 4 }, state, context)).toBe(true);
    expect(evaluateCondition({ kind: 'death-count', comparison: 'equal', value: 3 }, state, context)).toBe(false);
  });
});
