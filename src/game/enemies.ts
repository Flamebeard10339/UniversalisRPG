import type { EnemyDefinition, EnemyStatKey } from './types';

export const ENEMY_STAT_DEFAULTS: Record<EnemyStatKey, number> = {
  attack: 1,
  defense: 1,
  health: 100,
  rate: 0,
  regeneration: 0,
  armorPenetration: 0,
  torpidity: 0,
  critChance: 0,
  critMultiplier: 2,
};

export const ENEMY_STAT_KEYS = Object.keys(ENEMY_STAT_DEFAULTS) as EnemyStatKey[];

type LegacyEnemyDefinition = Omit<Partial<EnemyDefinition>, 'stats'> & {
  id: string;
  interactionTypeId: string;
  stats?: Record<string, unknown>;
  skills?: Record<string, { base?: number }>;
  attack?: number;
  defense?: number;
  health?: number;
  rate?: number;
  regeneration?: number;
  armorPenetration?: number;
  torpidity?: number;
  critChance?: number;
  critMultiplier?: number;
};

const isEnemyStatKey = (key: string): key is EnemyStatKey =>
  (ENEMY_STAT_KEYS as string[]).includes(key);

const normalizeStatValue = (key: EnemyStatKey, value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ENEMY_STAT_DEFAULTS[key];
  }
  if (key === 'attack' || key === 'health') return value > 0 ? value : ENEMY_STAT_DEFAULTS[key];
  if (key === 'critChance') return Math.min(100, Math.max(0, value));
  if (key === 'critMultiplier') return value >= 1 ? value : ENEMY_STAT_DEFAULTS[key];
  return Math.max(0, value);
};

export const getEnemyStat = (
  enemy: EnemyDefinition,
  key: EnemyStatKey,
) => normalizeStatValue(key, enemy.stats?.[key]);

export const normalizeEnemyStats = (
  stats: Record<string, unknown> | undefined,
) => {
  const normalized: Partial<Record<EnemyStatKey, number>> = {};

  for (const [key, value] of Object.entries(stats ?? {})) {
    if (!isEnemyStatKey(key)) {
      continue;
    }

    const normalizedValue = normalizeStatValue(key, value);
    if (normalizedValue !== ENEMY_STAT_DEFAULTS[key]) {
      normalized[key] = normalizedValue;
    }
  }

  return normalized;
};

export const normalizeEnemyDefinition = (enemy: LegacyEnemyDefinition): EnemyDefinition => {
  const legacyStats = Object.fromEntries(ENEMY_STAT_KEYS.map((key) => {
    if (key === 'attack') return [key, enemy.attack ?? enemy.skills?.attack?.base];
    if (key === 'defense') return [key, enemy.defense ?? enemy.skills?.defense?.base];
    return [key, enemy[key]];
  }));
  const stats = normalizeEnemyStats({ ...legacyStats, ...(enemy.stats ?? {}) });

  return {
    id: enemy.id,
    interactionTypeId: enemy.interactionTypeId,
    ...(Object.keys(stats).length > 0 ? { stats } : {}),
    showHealthBar: enemy.showHealthBar ?? true,
    rewards: enemy.rewards ?? [],
  };
};
