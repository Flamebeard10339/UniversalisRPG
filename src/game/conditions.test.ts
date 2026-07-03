import { describe, expect, it } from 'vitest';
import { evaluateCondition } from './conditions';
import { createInitialPlayState } from './timers';
import { xpRequiredForLevel } from './skills';

const context = { actions: [], skills: [], items: [], interactionTypes: [], enemies: [] };

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
      skillXp: { focus: xpRequiredForLevel(4) },
    };
    const skillContext = { ...context, skills: [{ id: 'focus', maxLevel: 10 }] };

    expect(evaluateCondition({ kind: 'not', condition: { kind: 'state-variable', variable: 'item:key', comparison: 'less-than', value: 2 } }, state, skillContext)).toBe(true);
    expect(evaluateCondition({ kind: 'state-variable', variable: 'resource:air', comparison: 'equal', value: 7 }, state, skillContext)).toBe(true);
    expect(evaluateCondition({ kind: 'not', condition: { kind: 'state-variable', variable: 'skill-level:focus', comparison: 'less-than', value: 4 } }, state, skillContext)).toBe(true);
  });

  it('distinguishes inventory item tags from equipped item tags', () => {
    const items = [{ id: 'bronze-pickaxe', tags: 'pickaxe, mainhand' }];
    const state = {
      ...createInitialPlayState('test', 'start'),
      inventory: { 'bronze-pickaxe': 1 },
    };
    const equipped = { ...state, equipment: { mainhand: 'bronze-pickaxe' as const } };
    const itemTag = { kind: 'item-tag' as const, tag: 'pickaxe' };
    const equippedTag = { kind: 'equipped-item-tag' as const, tag: 'pickaxe' };

    expect(evaluateCondition(itemTag, state, { ...context, items })).toBe(true);
    expect(evaluateCondition(equippedTag, state, { ...context, items })).toBe(false);
    expect(evaluateCondition(equippedTag, equipped, { ...context, items })).toBe(true);
  });
});
