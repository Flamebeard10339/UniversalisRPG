import { describe, expect, it } from 'vitest';
import { evaluateCondition, isActionVisible } from './conditions';
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

describe('isActionVisible entity discoverability gate', () => {
  const examineAction = { id: 'entity.crate.examine', entityId: 'crate', rewards: [] };
  const takeAction = { id: 'entity.crate.take', entityId: 'crate', rewards: [] };
  const crate = { id: 'crate', actionIds: ['entity.crate.examine', 'entity.crate.take'] };
  const gateContext = { ...context, entities: [crate] };

  it('hides a non-examine entity action until the entity has been examined, but keeps examine itself visible', () => {
    const state = createInitialPlayState('test', 'start');

    expect(isActionVisible(state, takeAction, gateContext)).toBe(false);
    expect(isActionVisible(state, examineAction, gateContext)).toBe(true);
  });

  it('reveals the rest of the entity\'s actions once examine has completed once', () => {
    const state = { ...createInitialPlayState('test', 'start'), actionCompletions: { 'entity.crate.examine': 1 } };

    expect(isActionVisible(state, takeAction, gateContext)).toBe(true);
  });

  it('leaves an action ungated if its entity has no examine action declared', () => {
    const bareEntity = { id: 'sign', actionIds: ['entity.sign.read'] };
    const readAction = { id: 'entity.sign.read', entityId: 'sign', rewards: [] };
    const state = createInitialPlayState('test', 'start');

    expect(isActionVisible(state, readAction, { ...context, entities: [bareEntity] })).toBe(true);
  });

  it('does not gate item actions', () => {
    const itemAction = { id: 'item.potion.drink', itemId: 'potion', rewards: [] };
    const state = createInitialPlayState('test', 'start');

    expect(isActionVisible(state, itemAction, context)).toBe(true);
  });
});
