import { describe, expect, it } from 'vitest';
import { getCharacterStatValue } from './characterStats';
import { canEquipItemInSlot, formatItemTag, getItemTags } from './equipment';
import { createInitialPlayState, equipItem, unequipSlot } from './timers';
import type { ActionResolutionContext, ItemDefinition } from './types';

const t = (key: string, fallbackOrParams?: string | Record<string, string | number>) => {
  const params = typeof fallbackOrParams === 'object' ? fallbackOrParams : {};
  const labels: Record<string, string> = {
    'equipment.slot.mainhand': 'Mainhand',
    'equipment.tag.slotRequirement': `${params.slot} (${params.requirements})`,
    'equipment.tag.statBonus': `${params.amount} ${params.stat}`,
    'skill.attack.title': 'Attack',
    'skill.mining.title': 'Mining',
    'stat.attack.title': 'Attack',
    'stat.defense.title': 'Defense',
    'stat.mining.title': 'Mining',
    'stat.health.title': 'Health',
  };
  return labels[key] ?? (typeof fallbackOrParams === 'string' ? fallbackOrParams : key);
};

describe('equipment', () => {
  const pickaxe: ItemDefinition = {
    id: 'bronze-pickaxe',
    tags: 'pickaxe, mainhand (1 attack 1 mining), +8 mining, +3 attack, +5% health, -1 defense',
  };
  const dagger: ItemDefinition = { id: 'iron-dagger', tags: 'mainhand' };
  const legendarySword: ItemDefinition = { id: 'legendary-sword', tags: 'mainhand (50 attack)' };
  const skills = [{ id: 'attack', maxLevel: 100 }, { id: 'mining', maxLevel: 100 }];
  const context: ActionResolutionContext = {
    actions: [],
    skills,
    interactionTypes: [],
    enemies: [],
    items: [pickaxe, dagger, legendarySword],
  };

  it('parses and localizes item tags', () => {
    expect(getItemTags(pickaxe).map((tag) => formatItemTag(tag, t))).toEqual([
      'pickaxe',
      'Mainhand (1 Attack, 1 Mining)',
      '+8 Mining',
      '+3 Attack',
      '+5% Health',
      '-1 Defense',
    ]);
  });

  it('checks slot requirements and applies equipped stat bonuses', () => {
    const state = { ...createInitialPlayState('test', 'start'), inventory: { 'bronze-pickaxe': 1 } };
    const stats = [{ id: 'mining', base: 6 }, { id: 'health', base: 100 }];

    expect(canEquipItemInSlot(state, pickaxe, 'mainhand', skills)).toBe(true);

    const equipped = equipItem(state, pickaxe, 'mainhand', context);

    expect(equipped.equipment.mainhand).toBe('bronze-pickaxe');
    expect(getCharacterStatValue(equipped, stats, 'mining', skills, [pickaxe])).toBeCloseTo(14);
    expect(getCharacterStatValue(equipped, stats, 'health', skills, [pickaxe])).toBeCloseTo(105);
  });

  it('removes the item from inventory when equipped and returns it when unequipped', () => {
    const state = { ...createInitialPlayState('test', 'start'), inventory: { 'bronze-pickaxe': 1 } };

    const equipped = equipItem(state, pickaxe, 'mainhand', context);
    expect(equipped.inventory['bronze-pickaxe']).toBe(0);

    const unequipped = unequipSlot(equipped, 'mainhand', context);
    expect(unequipped.equipment.mainhand).toBeUndefined();
    expect(unequipped.inventory['bronze-pickaxe']).toBe(1);
  });

  it('swaps items when equipping into an already-filled slot', () => {
    const state = { ...createInitialPlayState('test', 'start'), inventory: { 'bronze-pickaxe': 1, 'iron-dagger': 1 } };

    const withPickaxe = equipItem(state, pickaxe, 'mainhand', context);
    const withDagger = equipItem(withPickaxe, dagger, 'mainhand', context);

    expect(withDagger.equipment.mainhand).toBe('iron-dagger');
    expect(withDagger.inventory['iron-dagger']).toBe(0);
    expect(withDagger.inventory['bronze-pickaxe']).toBe(1);
  });

  it('fails to equip without meeting level requirements and posts a chat message', () => {
    const state = { ...createInitialPlayState('test', 'start'), inventory: { 'legendary-sword': 1 } };

    const result = equipItem(state, legendarySword, 'mainhand', context);

    expect(result.equipment.mainhand).toBeUndefined();
    expect(result.inventory['legendary-sword']).toBe(1);
    expect(result.chatMessages[result.chatMessages.length - 1]?.key).toBe('chat.equipment.requirementsNotMet');
  });

  it('fails to unequip with a full inventory and posts a chat message', () => {
    const manifest = { maxInventorySlots: 1 } as ActionResolutionContext['manifest'];
    const fullContext: ActionResolutionContext = { ...context, manifest };
    const state = { ...createInitialPlayState('test', 'start'), inventory: { 'bronze-pickaxe': 1 } };

    const equipped = equipItem(state, pickaxe, 'mainhand', fullContext);
    const withOtherItem = { ...equipped, inventory: { ...equipped.inventory, 'iron-dagger': 1 } };

    const result = unequipSlot(withOtherItem, 'mainhand', fullContext);

    expect(result.equipment.mainhand).toBe('bronze-pickaxe');
    expect(result.chatMessages[result.chatMessages.length - 1]?.key).toBe('chat.equipment.inventoryFull');
  });
});
