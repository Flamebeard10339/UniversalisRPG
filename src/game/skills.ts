import type { ExperienceCurveDefinition, UniverseManifest } from './types';

export const DEFAULT_EXPERIENCE_CURVE = {
  'starting-experience': 1000,
  'level-factor': 10,
  exponential: 2,
} satisfies Required<ExperienceCurveDefinition>;

export const resolveExperienceCurve = (
  manifest?: Pick<UniverseManifest, 'experienceCurve'>,
): Required<ExperienceCurveDefinition> => ({
  'starting-experience': manifest?.experienceCurve?.['starting-experience'] ?? DEFAULT_EXPERIENCE_CURVE['starting-experience'],
  'level-factor': manifest?.experienceCurve?.['level-factor'] ?? DEFAULT_EXPERIENCE_CURVE['level-factor'],
  exponential: manifest?.experienceCurve?.exponential ?? DEFAULT_EXPERIENCE_CURVE.exponential,
});

const levelStepCost = (level: number, curve: Required<ExperienceCurveDefinition>) =>
  curve['starting-experience'] * curve.exponential ** ((Math.max(1, level) - 1) / curve['level-factor']);

export const xpRequiredForLevel = (
  level: number,
  curveDefinition?: ExperienceCurveDefinition,
) => {
  const targetLevel = Math.max(1, Math.floor(level));
  let total = 0;
  for (let currentLevel = 1; currentLevel < targetLevel; currentLevel += 1) {
    total += xpRequiredForNextLevel(currentLevel, curveDefinition);
  }
  return total;
};

export const xpRequiredForNextLevel = (
  level: number,
  curveDefinition?: ExperienceCurveDefinition,
) => Math.ceil(levelStepCost(level, resolveExperienceCurve({ experienceCurve: curveDefinition })));

export const skillLevelFromXp = (
  xp: number,
  curveDefinition?: ExperienceCurveDefinition,
) => {
  const safeXp = Math.max(0, xp);
  let level = 1;
  let required = 0;
  while (required + xpRequiredForNextLevel(level, curveDefinition) <= safeXp) {
    required += xpRequiredForNextLevel(level, curveDefinition);
    level += 1;
  }
  return level;
};

export const skillLevelProgressFromXp = (
  xp: number,
  curveDefinition?: ExperienceCurveDefinition,
) => {
  const level = skillLevelFromXp(xp, curveDefinition);
  const levelStart = xpRequiredForLevel(level, curveDefinition);
  const nextLevelCost = xpRequiredForNextLevel(level, curveDefinition);
  return {
    level,
    levelStart,
    nextLevelCost,
    current: Math.max(0, xp - levelStart),
    percent: nextLevelCost > 0 ? Math.min(100, Math.max(0, ((xp - levelStart) / nextLevelCost) * 100)) : 100,
  };
};
