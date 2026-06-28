import { getCharacterStatValue } from './characterStats';
import { diagnosticCombatDamage, expectedCombatDamage, type DiagnosticHitCase, resolveManifestCombatBalance } from './combatBalance';
import { skillTitleKey, statTitleKey } from './contentIds';
import type { ContentBundle, EnemyDefinition, SkillEquipmentBonuses, UniversePlayState } from './types';
import { createInitialPlayState } from './timers';
import { ACTION_RATE_STAT_ID } from './adversarial';
import { getEnemyStat } from './enemies';

export type PlayerProfileDefinition = {
  id: string;
  skillLevels: Record<string, number>;
  equipmentSkillBonuses?: Record<string, SkillEquipmentBonuses>;
};

export type BalanceCase = 'worst' | 'average' | 'best';

export type PlayerProfileEnemyDiagnostic = {
  actionsToKill: Record<BalanceCase, number>;
  dps: number;
  dpsTaken: number;
  fightsPerDeath: Record<BalanceCase, number>;
  levelPair: string;
  maxHit: number;
  profile: PlayerProfileDefinition;
  statSummary: string;
};

const EPSILON = 1e-9;
const DEFAULT_ACTIONS_PER_MINUTE = 25;

export const DEBUG_PLAYER_PROFILES: PlayerProfileDefinition[] = [
  {
    id: 'just-spawned',
    skillLevels: {},
  },
  {
    id: 'trained-10',
    skillLevels: { attack: 10, defense: 10 },
  },
  {
    id: 'trained-10-sword',
    skillLevels: { attack: 10, defense: 10 },
    equipmentSkillBonuses: {
      attack: { added: 5, increased: 0.15 },
    },
  },
  {
    id: 'trained-10-shield',
    skillLevels: { attack: 10, defense: 10 },
    equipmentSkillBonuses: {
      defense: { added: 5, increased: 0.15 },
    },
  },
];

const xpForLevel = (level: number) => Math.max(0, Math.pow(Math.max(1, level) - 1, 2) * 10);

export const createProfileState = (
  bundle: Pick<ContentBundle, 'manifest' | 'locations' | 'skills'>,
  profile: PlayerProfileDefinition,
): UniversePlayState => {
  const startingLocationId = bundle.locations.find((location) => location.starting)?.id ?? bundle.locations[0]?.id ?? '';
  const allSkillXp = Object.fromEntries(bundle.skills.map((skill) => [
    skill.id,
    xpForLevel(profile.skillLevels[skill.id] ?? 1),
  ]));

  return {
    ...createInitialPlayState(bundle.manifest.id, startingLocationId),
    equipmentSkillBonuses: profile.equipmentSkillBonuses ?? {},
    skillXp: allSkillXp,
  };
};

export const getProfileStatValue = (
  bundle: Pick<ContentBundle, 'manifest' | 'locations' | 'skills' | 'stats'>,
  profile: PlayerProfileDefinition,
  statId: string,
) => getCharacterStatValue(createProfileState(bundle, profile), bundle.stats, statId, bundle.manifest.basePlayer);

const titleCaseId = (id: string) =>
  id.split('-').filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');

const formatStatValue = (value: number) =>
  Math.abs(value - Math.round(value)) < 0.005 ? String(Math.round(value)) : value.toFixed(1);

export const getProfileStatSummary = (
  bundle: Pick<ContentBundle, 'manifest' | 'locations' | 'skills' | 'stats'>,
  profile: PlayerProfileDefinition,
  t?: (key: string, fallback?: string) => string,
) => {
  const state = createProfileState(bundle, profile);
  return bundle.stats
    .map((stat) => ({
      id: stat.id,
      label: t ? t(statTitleKey(stat.id), titleCaseId(stat.id)) : titleCaseId(stat.id),
      value: getCharacterStatValue(state, bundle.stats, stat.id, bundle.manifest.basePlayer),
    }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .map((stat) => `${stat.label} ${formatStatValue(stat.value)}`)
    .join(', ');
};

const durationOrInfinity = (health: number, netDps: number) =>
  netDps <= EPSILON ? Number.POSITIVE_INFINITY : health / netDps;

export const calculateProfileEnemyDiagnostic = (
  bundle: ContentBundle,
  enemy: EnemyDefinition,
  profile: PlayerProfileDefinition,
): PlayerProfileEnemyDiagnostic => {
  const interactionType = bundle.interactionTypes.find((candidate) => candidate.id === enemy.interactionTypeId);
  const sourceStatId = interactionType?.sourceStatId ?? 'attack';
  const targetStatId = interactionType?.targetStatId ?? 'defense';
  const playerAttack = getProfileStatValue(bundle, profile, sourceStatId);
  const playerDefense = getProfileStatValue(bundle, profile, targetStatId);
  const playerHealth = Math.max(1, getProfileStatValue(bundle, profile, 'health') || 100);
  const playerRegeneration = Math.max(0, getProfileStatValue(bundle, profile, 'regeneration')) / 60;
  const playerActionsPerMinute = getProfileStatValue(bundle, profile, ACTION_RATE_STAT_ID) || DEFAULT_ACTIONS_PER_MINUTE;
  const playerActionSeconds = 60 / Math.max(EPSILON, playerActionsPerMinute);
  const enemyDefense = getEnemyStat(enemy, 'defense');
  const enemyActionSeconds = getEnemyStat(enemy, 'rate') > 0 ? 60 / getEnemyStat(enemy, 'rate') : Number.POSITIVE_INFINITY;
  const enemyRegeneration = Math.max(0, getEnemyStat(enemy, 'regeneration')) / 60;
  const balance = resolveManifestCombatBalance(bundle.manifest);
  const outgoingExpectation = expectedCombatDamage(playerAttack, enemyDefense, balance);
  const incomingExpectation = interactionType?.targetPlayerHealth && Number.isFinite(enemyActionSeconds)
    ? expectedCombatDamage(getEnemyStat(enemy, 'attack'), playerDefense, balance, {
        armorPenetration: getEnemyStat(enemy, 'armorPenetration'),
        torpidity: getEnemyStat(enemy, 'torpidity'),
        critChance: getEnemyStat(enemy, 'critChance'),
        critMultiplier: getEnemyStat(enemy, 'critMultiplier'),
      })
    : null;

  const cases: BalanceCase[] = ['worst', 'average', 'best'];
  const actionsToKill = Object.fromEntries(cases.map((balanceCase) => {
    const outgoingDamage = diagnosticCombatDamage(playerAttack, enemyDefense, balance, balanceCase as DiagnosticHitCase);
    const timeToKill = durationOrInfinity(getEnemyStat(enemy, 'health'), outgoingDamage / playerActionSeconds - enemyRegeneration);
    return [
      balanceCase,
      Number.isFinite(timeToKill) ? Math.ceil(timeToKill / playerActionSeconds) : Number.POSITIVE_INFINITY,
    ];
  })) as Record<BalanceCase, number>;

  const fightsPerDeath = Object.fromEntries(cases.map((balanceCase) => {
    const outgoingDamage = diagnosticCombatDamage(playerAttack, enemyDefense, balance, balanceCase as DiagnosticHitCase);
    const incomingDamage = interactionType?.targetPlayerHealth && Number.isFinite(enemyActionSeconds)
      ? diagnosticCombatDamage(getEnemyStat(enemy, 'attack'), playerDefense, balance, balanceCase as DiagnosticHitCase, {
          armorPenetration: getEnemyStat(enemy, 'armorPenetration'),
          torpidity: getEnemyStat(enemy, 'torpidity'),
          critChance: getEnemyStat(enemy, 'critChance'),
          critMultiplier: getEnemyStat(enemy, 'critMultiplier'),
        })
      : 0;
    const timeToKill = durationOrInfinity(getEnemyStat(enemy, 'health'), outgoingDamage / playerActionSeconds - enemyRegeneration);
    const timeToDie = durationOrInfinity(playerHealth, incomingDamage / enemyActionSeconds - playerRegeneration);
    const value = !Number.isFinite(timeToKill)
      ? 0
      : !Number.isFinite(timeToDie)
        ? Number.POSITIVE_INFINITY
        : timeToDie / timeToKill;

    return [balanceCase, value];
  })) as Record<BalanceCase, number>;

  return {
    actionsToKill,
    dps: outgoingExpectation.damage / playerActionSeconds,
    dpsTaken: incomingExpectation ? incomingExpectation.damage / enemyActionSeconds : 0,
    fightsPerDeath,
    levelPair: `${titleCaseId(sourceStatId)}/${titleCaseId(targetStatId)}: ${formatStatValue(playerAttack)}/${formatStatValue(enemyDefense)} (${formatStatValue(playerAttack - enemyDefense)})`,
    maxHit: outgoingExpectation.maxDamage,
    profile,
    statSummary: getProfileStatSummary(bundle, profile),
  };
};

export const profileTitle = (profile: PlayerProfileDefinition, t: (key: string, fallback?: string) => string) =>
  t(`contribution.playerProfile.${profile.id}.title`, titleCaseId(profile.id));

export const profileDescription = (profile: PlayerProfileDefinition, t: (key: string, fallback?: string) => string) => {
  const equipment = Object.keys(profile.equipmentSkillBonuses ?? {});
  const skillText = Object.entries(profile.skillLevels)
    .map(([skillId, level]) => `${t(skillTitleKey(skillId), titleCaseId(skillId))} ${level}`)
    .join(', ');
  const equipmentText = equipment.length > 0
    ? equipment.map((skillId) => titleCaseId(`training-${skillId}`)).join(', ')
    : '';

  return t(`contribution.playerProfile.${profile.id}.description`, [skillText, equipmentText].filter(Boolean).join('; ') || profile.id);
};
