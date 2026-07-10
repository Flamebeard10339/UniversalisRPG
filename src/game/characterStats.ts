import { skillLevelFromXp } from './skills';
import { equippedItemIds, equippedStatBonuses, itemStatBonuses } from './equipment';
import { getActiveStatModifiers } from './statModifiers';
import { evaluateCondition } from './conditions';
import type { ExperienceCurveDefinition, ItemDefinition, SkillEquipmentBonuses, SkillDefinition, SkillTotals, StatDefinition, StatModifierDefinition, StatSource, StatTotals, UniversePlayState } from './types';

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
  statModifiers: StatModifierDefinition[] = [],
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
  const modifierContext = { actions: [], enemies: [], interactionTypes: [], items, skills, stats, statModifiers };
  const modifierBonuses = getActiveStatModifiers(state, modifierContext, statId)
    .reduce((total, modifier) => ({
      added: total.added + (modifier.kind === 'added' ? modifier.amount : 0),
      increased: total.increased + (modifier.kind === 'increased' ? modifier.amount : 0),
    }), { added: 0, increased: 0 });
  const added = skillTotals.added + equipmentBonuses.added + modifierBonuses.added;
  const increased = skillTotals.increased + equipmentBonuses.increased + modifierBonuses.increased;
  const rawTotal = base + added;
  const effectiveTotal = increased < 0
    ? rawTotal / (1 - increased)
    : rawTotal * (1 + increased);

  return { base, added, increased, effectiveTotal };
};

// Per-source breakdown backing the stat detail modal's "List of Bonuses" —
// getCharacterStatTotals above sums these same three raw pieces (skills,
// equipment, active modifiers/buffs) without preserving which entity
// contributed what, so this walks the same data with the per-source
// attribution (and, for buffs, the duration/expiry) kept intact.
export const getCharacterStatSources = (
  state: UniversePlayState,
  stats: StatDefinition[],
  statId: string,
  skills: SkillDefinition[] = [],
  items: ItemDefinition[] = [],
  experienceCurve?: ExperienceCurveDefinition,
  statModifiers: StatModifierDefinition[] = [],
): StatSource[] => {
  const skillSources: StatSource[] = skills
    .filter((skill) => skill.statId === statId)
    .map((skill) => {
      const bonus = skillStatBonus(state, skill, experienceCurve);
      return { added: bonus.added, increased: bonus.increased, kind: 'skill' as const, skillId: skill.id };
    })
    .filter((source) => source.added !== 0 || source.increased !== 0);

  const equipmentTotals = new Map<string, { added: number; increased: number }>();
  for (const itemId of equippedItemIds(state)) {
    const item = items.find((candidate) => candidate.id === itemId);
    for (const bonus of itemStatBonuses(item)) {
      if (bonus.statId !== statId) continue;
      const existing = equipmentTotals.get(itemId) ?? { added: 0, increased: 0 };
      equipmentTotals.set(itemId, {
        added: existing.added + (bonus.kind === 'added' ? bonus.amount : 0),
        increased: existing.increased + (bonus.kind === 'increased' ? bonus.amount : 0),
      });
    }
  }
  const equipmentSources: StatSource[] = Array.from(equipmentTotals.entries())
    .map(([itemId, totals]) => ({ ...totals, itemId, kind: 'equipment' as const }));

  const buffSources: StatSource[] = Object.values(state.activeBuffs ?? {})
    .filter((buff) => buff.statId === statId)
    .map((buff) => ({
      added: buff.kind === 'added' ? buff.amount : 0,
      increased: buff.kind === 'increased' ? buff.amount : 0,
      durationSeconds: buff.durationSeconds,
      expiresAt: buff.expiresAt,
      itemId: buff.itemId,
      kind: 'buff' as const,
    }));

  const modifierContext = { actions: [], enemies: [], interactionTypes: [], items, skills, stats, statModifiers };
  const modifierSources: StatSource[] = statModifiers
    .filter((modifier) => modifier.statId === statId && evaluateCondition(modifier.activeWhen, state, modifierContext))
    .map((modifier) => ({
      added: modifier.kind === 'added' ? modifier.amount : 0,
      increased: modifier.kind === 'increased' ? modifier.amount : 0,
      kind: 'modifier' as const,
      modifierId: modifier.id,
    }));

  return [...skillSources, ...equipmentSources, ...buffSources, ...modifierSources];
};

export const getCharacterStatValue = (
  state: UniversePlayState,
  stats: StatDefinition[],
  statId: string,
  skills: SkillDefinition[] = [],
  items: ItemDefinition[] = [],
  experienceCurve?: ExperienceCurveDefinition,
  statModifiers: StatModifierDefinition[] = [],
) => getCharacterStatTotals(state, stats, statId, skills, items, experienceCurve, statModifiers).effectiveTotal;
