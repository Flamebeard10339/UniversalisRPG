import { skillLevelFromXp } from './skills';
import { equippedStatBonuses } from './equipment';
import type { ExperienceCurveDefinition, ItemDefinition, SkillEquipmentBonuses, SkillDefinition, SkillTotals, StatDefinition, StatTotals, UniversePlayState } from './types';

const DEFAULT_RATE = 1;

export const getSkillTotals = (
  state: UniversePlayState,
  skill: SkillDefinition | undefined,
  override?: SkillEquipmentBonuses,
  experienceCurve?: ExperienceCurveDefinition,
): SkillTotals => {
  const skillId = skill?.id ?? '';
  const learnedBase = skill ? skillLevelFromXp(state.skillXp[skill.id] ?? 0, experienceCurve) : 1;
  const bonuses = override ?? state.equipmentSkillBonuses[skillId] ?? {};
  const base = Math.max(1, override?.base ?? learnedBase) + (override ? 0 : (bonuses.base ?? 0));
  const added = bonuses.added ?? 0;
  const increased = bonuses.increased ?? 0;
  const rawTotal = 7 * base + added;
  const effectiveTotal = increased < 0 ? rawTotal / (1 - increased) : rawTotal * (1 + increased);
  return { base, added, increased, effectiveTotal, rate: Math.max(0, bonuses.rate ?? DEFAULT_RATE) };
};

const skillStatBonus = (
  state: UniversePlayState,
  skill: SkillDefinition,
  experienceCurve?: ExperienceCurveDefinition,
) => {
  const equipmentBonus = state.equipmentSkillBonuses[skill.id] ?? {};
  const level = Math.max(1, skillLevelFromXp(state.skillXp[skill.id] ?? 0, experienceCurve) + (equipmentBonus.base ?? 0));
  const usesDefaultBonus = skill.addedPerLevel === undefined && skill.increasedPerLevel === undefined;

  return {
    added: level * (skill.addedPerLevel ?? (usesDefaultBonus ? 1 : 0)) + (equipmentBonus.added ?? 0),
    increased: level * (skill.increasedPerLevel ?? (usesDefaultBonus ? 0.01 : 0)) + (equipmentBonus.increased ?? 0),
  };
};

export const getCharacterStatTotals = (
  state: UniversePlayState,
  stats: StatDefinition[],
  statId: string,
  skills: SkillDefinition[] = [],
  items: ItemDefinition[] = [],
  experienceCurve?: ExperienceCurveDefinition,
): StatTotals => {
  if (state.statOverrides?.[statId] !== undefined) {
    const effectiveTotal = state.statOverrides[statId];
    return { base: effectiveTotal, added: 0, increased: 0, effectiveTotal };
  }
  const stat = stats.find((candidate) => candidate.id === statId);
  if (!stat) return { base: 0, added: 0, increased: 0, effectiveTotal: 0 };

  const skillTotals = skills
    .filter((skill) => skill.statId === statId)
    .map((skill) => skillStatBonus(state, skill, experienceCurve))
    .reduce(
      (total, bonus) => ({
        added: total.added + bonus.added,
        increased: total.increased + bonus.increased,
      }),
      { added: 0, increased: 0 },
    );
  const base = stat.base ?? 0;
  const equipmentBonuses = equippedStatBonuses(state, items)
    .filter((bonus) => bonus.statId === statId)
    .reduce((total, bonus) => ({
      added: total.added + (bonus.kind === 'added' ? bonus.amount : 0),
      increased: total.increased + (bonus.kind === 'increased' ? bonus.amount : 0),
    }), { added: 0, increased: 0 });
  const added = skillTotals.added + equipmentBonuses.added;
  const increased = skillTotals.increased + equipmentBonuses.increased;
  const rawTotal = base + added;
  const effectiveTotal = increased < 0
    ? rawTotal / (1 - increased)
    : rawTotal * (1 + increased);

  return { base, added, increased, effectiveTotal };
};

export const getCharacterStatValue = (
  state: UniversePlayState,
  stats: StatDefinition[],
  statId: string,
  skills: SkillDefinition[] = [],
  items: ItemDefinition[] = [],
  experienceCurve?: ExperienceCurveDefinition,
) => getCharacterStatTotals(state, stats, statId, skills, items, experienceCurve).effectiveTotal;
