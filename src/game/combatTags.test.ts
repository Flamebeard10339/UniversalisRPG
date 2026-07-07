import { describe, expect, it } from 'vitest';
import { applyCombatTags, getEnemyCombatTags, getPlayerCombatTags } from './combatTags';
import { parseTagString } from './equipment';
import { normalizeEnemyDefinition } from './enemies';
import { createInitialPlayState } from './timers';
import type { ItemDefinition } from './types';

describe('applyCombatTags', () => {
  it('matches the spec example: player (stab, +15% undead) attacking a vampire (undead, -10 stab, +30 slash)', () => {
    const playerOffensive = parseTagString('stab, +15% undead');
    const vampireDefensive = parseTagString('undead, -10 stab, +30 slash');

    // attack stat: 10 added, 10% increased
    const result = applyCombatTags(10, 0.10, playerOffensive, vampireDefensive);

    expect(result).toBeCloseTo(25, 5);
  });

  it('matches the spec example: vampire (slash, crush) attacking a player (+10 stab, +3 slash, +10% crush)', () => {
    const vampireOffensive = parseTagString('slash, crush');
    const playerDefensive = parseTagString('+10 stab, +3 slash, +10% crush');

    // attack stat: 10 added, no increased
    const result = applyCombatTags(10, 0, vampireOffensive, playerDefensive);

    expect(result).toBeCloseTo(6.3, 5);
  });

  it('leaves added/increased untouched when no tags match (backward compatible with untagged content)', () => {
    const result = applyCombatTags(10, 0.10, parseTagString('stab'), parseTagString('rat'));
    expect(result).toBeCloseTo(11, 5);
  });

  it('never produces a negative effective attack when defensive resistance exceeds the raw added total', () => {
    const result = applyCombatTags(5, 0, parseTagString('stab'), parseTagString('+50 stab'));
    expect(result).toBe(0);
  });
});

describe('getPlayerCombatTags / getEnemyCombatTags', () => {
  const sword: ItemDefinition = { id: 'undead-slayer-sword', tags: 'mainhand', offensiveTags: 'stab, +15% undead' };
  const shield: ItemDefinition = { id: 'stalwart-shield', tags: 'offhand', defensiveTags: '+10 stab, +3 slash, +10% crush' };
  const items = [sword, shield];

  it('aggregates offensive/defensive tags across all equipped items', () => {
    const state = { ...createInitialPlayState('test', 'start'), equipment: { mainhand: 'undead-slayer-sword', offhand: 'stalwart-shield' } };

    expect(getPlayerCombatTags(state, items, 'offensiveTags')).toEqual(parseTagString('stab, +15% undead'));
    expect(getPlayerCombatTags(state, items, 'defensiveTags')).toEqual(parseTagString('+10 stab, +3 slash, +10% crush'));
  });

  it('ignores unequipped items even if held in inventory', () => {
    const state = { ...createInitialPlayState('test', 'start'), inventory: { 'undead-slayer-sword': 1 }, equipment: {} };
    expect(getPlayerCombatTags(state, items, 'offensiveTags')).toEqual([]);
  });

  it('reads enemy combat tags from the enemy definition', () => {
    const vampire = normalizeEnemyDefinition({
      id: 'vampire',
      interactionTypeId: 'melee-combat',
      offensiveTags: 'slash, crush',
      defensiveTags: 'undead, -10 stab, +30 slash',
      rewards: [],
    });

    expect(getEnemyCombatTags(vampire, 'offensiveTags')).toEqual(parseTagString('slash, crush'));
    expect(getEnemyCombatTags(vampire, 'defensiveTags')).toEqual(parseTagString('undead, -10 stab, +30 slash'));
  });
});
