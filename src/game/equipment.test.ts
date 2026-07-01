import { describe, expect, it } from 'vitest';
import { getCharacterStatValue } from './characterStats';
import { canEquipItemInSlot, equipItem, formatItemTag, getItemTags } from './equipment';
import { createInitialPlayState } from './timers';
import type { ItemDefinition } from './types';

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
    const skills = [{ id: 'attack', maxLevel: 100 }, { id: 'mining', maxLevel: 100 }];
    const stats = [{ id: 'mining', base: 6 }, { id: 'health', base: 100 }];

    expect(canEquipItemInSlot(state, pickaxe, 'mainhand', skills)).toBe(true);

    const equipped = equipItem(state, pickaxe, 'mainhand', skills);

    expect(equipped.equipment.mainhand).toBe('bronze-pickaxe');
    expect(getCharacterStatValue(equipped, stats, 'mining', skills, [pickaxe])).toBeCloseTo(14);
    expect(getCharacterStatValue(equipped, stats, 'health', skills, [pickaxe])).toBeCloseTo(105);
  });
});
