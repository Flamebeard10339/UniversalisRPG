import type {
  ActionResolutionContext,
  EnemyDefinition,
  GameAction,
  InteractionTypeDefinition,
  SkillEquipmentBonuses,
  SkillDefinition,
  SkillTotals,
  UniversePlayState,
} from './types';
import { skillLevelFromXp } from './skills';

const DEFAULT_RATE = 1;
const DEFAULT_IMPRECISION = 70;
const MIN_IMPRECISION = 0.000001;

const normalPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

const erf = (value: number) => {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
};

const normalCdf = (x: number) => 0.5 * (1 + erf(x / Math.sqrt(2)));

export const expectedDamage = (sourceTotal: number, sourceImprecision: number, targetTotal: number) => {
  const sigma = Math.max(MIN_IMPRECISION, sourceImprecision);
  const delta = sourceTotal - targetTotal;
  const z = delta / sigma;

  return delta * normalCdf(z) + sigma * normalPdf(z);
};

export const actionDps = (sourceTotal: number, sourceImprecision: number, targetTotal: number, actionTimeSeconds: number) =>
  expectedDamage(sourceTotal, sourceImprecision, targetTotal) / Math.max(MIN_IMPRECISION, actionTimeSeconds);

export const getSkillTotals = (
  state: UniversePlayState,
  skill: SkillDefinition | undefined,
  override?: SkillEquipmentBonuses,
): SkillTotals => {
  const skillId = skill?.id ?? '';
  const bonuses = override ?? state.equipmentSkillBonuses[skillId] ?? {};
  const learnedBase = skill ? skillLevelFromXp(state.skillXp[skill.id] ?? 0) : 1;
  const base = Math.max(1, override?.base ?? learnedBase) + (override ? 0 : bonuses.base ?? 0);
  const added = bonuses.added ?? 0;
  const increased = bonuses.increased ?? 0;
  const rawTotal = 7 * base + added;
  const effectiveTotal = increased < 0
    ? rawTotal / (1 - increased)
    : rawTotal * (1 + increased);

  return {
    base,
    added,
    increased,
    effectiveTotal,
    rate: Math.max(0, (skill?.rate ?? DEFAULT_RATE) + (bonuses.rate ?? 0)),
    imprecision: Math.max(MIN_IMPRECISION, (skill?.imprecision ?? DEFAULT_IMPRECISION) + (bonuses.imprecision ?? 0)),
  };
};

export const getEnemy = (
  action: GameAction,
  context: ActionResolutionContext,
): EnemyDefinition | null =>
  action.enemyId ? context.enemies.find((enemy) => enemy.id === action.enemyId) ?? null : null;

export const getInteractionType = (
  action: GameAction,
  context: ActionResolutionContext,
): InteractionTypeDefinition | null =>
  (getEnemy(action, context)?.interactionTypeId ?? action.interactionTypeId)
    ? context.interactionTypes.find((interactionType) => interactionType.id === (getEnemy(action, context)?.interactionTypeId ?? action.interactionTypeId)) ?? null
    : null;

export const getActionSkills = (
  action: GameAction,
  context: ActionResolutionContext,
) => {
  const interactionType = getInteractionType(action, context);
  const sourceSkillId = action.sourceSkillId ?? interactionType?.sourceSkillId;
  const targetSkillId = action.targetSkillId ?? interactionType?.targetSkillId;

  return {
    interactionType,
    sourceSkill: context.skills.find((skill) => skill.id === sourceSkillId),
    targetSkill: context.skills.find((skill) => skill.id === targetSkillId),
  };
};

export const getEnemySkillTotals = (
  state: UniversePlayState,
  enemy: EnemyDefinition,
  skill: SkillDefinition | undefined,
) => getSkillTotals(state, skill, enemy.skills[skill?.id ?? ''] ?? {});

export const getActionDurationMs = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  const { sourceSkill } = getActionSkills(action, context);
  const rate = sourceSkill ? getSkillTotals(state, sourceSkill).rate : DEFAULT_RATE;

  return (action.durationSeconds * 1000) / Math.max(MIN_IMPRECISION, rate);
};

export const getActionDps = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  const enemy = getEnemy(action, context);
  const { sourceSkill, targetSkill } = getActionSkills(action, context);

  if (!sourceSkill || !targetSkill || !enemy) {
    return null;
  }

  const source = getSkillTotals(state, sourceSkill);
  const target = getEnemySkillTotals(state, enemy, targetSkill);

  return actionDps(source.effectiveTotal, source.imprecision, target.effectiveTotal, getActionDurationMs(state, action, context) / 1000);
};

export const sampleNormal = (mean: number, standardDeviation: number, random = Math.random) => {
  const u1 = Math.max(Number.EPSILON, random());
  const u2 = random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  return mean + z0 * standardDeviation;
};

export const sampleAdversarialDamage = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  random = Math.random,
) => {
  const enemy = getEnemy(action, context);
  const { sourceSkill, targetSkill } = getActionSkills(action, context);

  if (!sourceSkill || !targetSkill || !enemy) {
    return null;
  }

  const source = getSkillTotals(state, sourceSkill);
  const target = getEnemySkillTotals(state, enemy, targetSkill);
  const sample = sampleNormal(source.effectiveTotal, source.imprecision, random);

  return {
    sample,
    damage: sample >= target.effectiveTotal ? sample - target.effectiveTotal : 0,
    source,
    target,
  };
};

export const getEnemyAttackDurationMs = (
  enemy: EnemyDefinition | null,
) => enemy && enemy.rate > 0 ? 1000 / enemy.rate : null;

export const sampleEnemyAttackDamage = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  random = Math.random,
) => {
  const enemy = getEnemy(action, context);
  const interactionType = getInteractionType(action, context);
  const sourceSkill = context.skills.find((skill) => skill.id === interactionType?.sourceSkillId);
  const targetSkill = context.skills.find((skill) => skill.id === interactionType?.targetSkillId);

  if (!enemy || !interactionType?.targetPlayerHealth || enemy.rate <= 0 || !sourceSkill || !targetSkill) {
    return null;
  }

  const source = getEnemySkillTotals(state, enemy, sourceSkill);
  const target = getSkillTotals(state, targetSkill);
  const sample = sampleNormal(source.effectiveTotal, source.imprecision, random);

  return {
    sample,
    damage: sample >= target.effectiveTotal ? sample - target.effectiveTotal : 0,
    source,
    target,
  };
};
