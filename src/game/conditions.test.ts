import { describe, expect, it } from 'vitest';
import { evaluateCondition } from './conditions';
import { createInitialPlayState } from './timers';

const context = { actions: [], skills: [], interactionTypes: [], enemies: [] };

describe('state-variable conditions', () => {
  it('supports numeric flags without special-casing their ids', () => {
    const state = { ...createInitialPlayState('test', 'start'), flags: { loops: 4 } };

    expect(evaluateCondition({ kind: 'state-variable', variable: 'flag:loops', comparison: 'equal', value: 4 }, state, context)).toBe(true);
    expect(evaluateCondition({ kind: 'state-variable', variable: 'flag:loops', comparison: 'equal', value: 3 }, state, context)).toBe(false);
  });

  it('uses the same condition shape for inventory, resources, and skills', () => {
    const state = {
      ...createInitialPlayState('test', 'start'),
      inventory: { key: 2 },
      resourcePools: { air: { current: 7, min: 0, max: 10 } },
      skillXp: { focus: 90 },
    };
    const skillContext = { ...context, skills: [{ id: 'focus', maxLevel: 10 }] };

    expect(evaluateCondition({ kind: 'not', condition: { kind: 'state-variable', variable: 'item:key', comparison: 'less-than', value: 2 } }, state, skillContext)).toBe(true);
    expect(evaluateCondition({ kind: 'state-variable', variable: 'resource:air', comparison: 'equal', value: 7 }, state, skillContext)).toBe(true);
    expect(evaluateCondition({ kind: 'not', condition: { kind: 'state-variable', variable: 'skill-level:focus', comparison: 'less-than', value: 4 } }, state, skillContext)).toBe(true);
  });
});
