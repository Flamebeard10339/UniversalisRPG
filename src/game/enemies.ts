import type { EnemyDefinition } from './types';

type LegacyEnemyDefinition = Partial<EnemyDefinition> & {
  id: string;
  interactionTypeId: string;
  skills?: Record<string, { base?: number }>;
};

export const normalizeEnemyDefinition = (enemy: LegacyEnemyDefinition): EnemyDefinition => ({
  id: enemy.id,
  interactionTypeId: enemy.interactionTypeId,
  attack: enemy.attack ?? enemy.skills?.attack?.base ?? 1,
  defense: enemy.defense ?? enemy.skills?.defense?.base ?? 1,
  health: enemy.health ?? 100,
  rate: enemy.rate ?? 0,
  regeneration: enemy.regeneration ?? 0,
  armorPenetration: enemy.armorPenetration ?? 0,
  torpidity: enemy.torpidity ?? 0,
  critChance: enemy.critChance ?? 0,
  critMultiplier: enemy.critMultiplier ?? 2,
  showHealthBar: enemy.showHealthBar ?? true,
  rewards: enemy.rewards ?? [],
});
