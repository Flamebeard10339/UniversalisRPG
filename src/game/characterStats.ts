import { skillLevelFromXp } from './skills';
import type { SkillEquipmentBonuses, SkillDefinition, SkillTotals, StatDefinition, UniversePlayState } from './types';

const DEFAULT_RATE = 1;

export const getSkillTotals = (
  state: UniversePlayState,
  skill: SkillDefinition | undefined,
  override?: SkillEquipmentBonuses,
): SkillTotals => {
  const skillId = skill?.id ?? '';
  const learnedBase = skill ? skillLevelFromXp(state.skillXp[skill.id] ?? 0) : 1;
  const bonuses = override ?? state.equipmentSkillBonuses[skillId] ?? {};
  const base = Math.max(1, override?.base ?? learnedBase) + (override ? 0 : (bonuses.base ?? 0));
  const added = bonuses.added ?? 0;
  const increased = bonuses.increased ?? 0;
  const rawTotal = 7 * base + added;
  const effectiveTotal = increased < 0 ? rawTotal / (1 - increased) : rawTotal * (1 + increased);
  return { base, added, increased, effectiveTotal, rate: Math.max(0, bonuses.rate ?? DEFAULT_RATE) };
};

export const getCharacterStatValue = (
  state: UniversePlayState,
  stats: StatDefinition[],
  statId: string,
) => {
  if (state.statOverrides?.[statId] !== undefined) return state.statOverrides[statId];
  const stat = stats.find((candidate) => candidate.id === statId);
  if (!stat) return 0;
  const skillBonus = stat.skillId ? state.equipmentSkillBonuses[stat.skillId] ?? {} : {};
  const skillLevel = stat.skillId
    ? Math.max(1, skillLevelFromXp(state.skillXp[stat.skillId] ?? 0) + (skillBonus.base ?? 0))
    : 0;
  const rawTotal = (stat.base ?? 0) + (stat.added ?? 0) + skillLevel + (skillBonus.added ?? 0);
  const increased = (stat.increased ?? 0) + (skillBonus.increased ?? 0);
  return increased < 0 ? rawTotal / (1 - increased) : rawTotal * (1 + increased);
};
