import { describe, expect, it } from 'vitest';
import { getActionDps, getEnemyAttackDps } from './adversarial';
import { calculateMaxCombatDamage, resolveManifestCombatBalance } from './combatBalance';
import { getCharacterStatValue } from './characterStats';
import { getEnemyStat, normalizeEnemyDefinition } from './enemies';
import type { ActionResolutionContext, EnemyDefinition, GameAction } from './types';
import { createInitialPlayState, resolveIdleTimers, startAction } from './timers';

const enemy = (patch: Partial<EnemyDefinition> & { stats?: Record<string, number> } = {}): EnemyDefinition =>
  normalizeEnemyDefinition({
    id: 'training-dummy',
    interactionTypeId: 'melee-combat',
    stats: {
      attack: 8,
      defense: 7,
      health: 200,
      ...(patch.stats ?? {}),
    },
    showHealthBar: true,
    rewards: [{ kind: 'resource', resourceId: 'trophy', amount: 1 }],
    ...patch,
  });

const context: ActionResolutionContext = {
  manifest: {
    schemaVersion: 1,
    id: 'test',
    version: '1',
    author: 'test',
    locales: ['en'],
    files: [],
    combatBalance: { expectedHitsToKill: 1 / 7, combatSpread: 1 },
    ui: { loopActionsByDefault: false },
  },
  actions: [],
  skills: [
    { id: 'attack', maxLevel: 100, statId: 'attack' },
    { id: 'defense', maxLevel: 100, statId: 'defense' },
  ],
  stats: [
    { id: 'attack', base: 6 },
    { id: 'defense', base: 6 },
    { id: 'action-rate', base: 6 },
    { id: 'health', base: 100 },
  ],
  locations: [{ id: 'arena', position: { x: 0, y: 0 }, starting: true }],
  resourceDefinitions: [{
    id: 'action-rate',
    sourceStat: 'action-rate',
    max: 60,
    initialValue: 'empty',
    onFull: [
      { kind: 'complete-action' },
      { kind: 'refill', value: 'min' },
    ],
  }, {
    id: 'enemy-action-rate',
    sourceStat: 'action-rate',
    owner: 'enemy',
    max: 60,
    initialValue: 'empty',
    onFull: [
      { kind: 'enemy-attack' },
      { kind: 'refill', value: 'min' },
    ],
  }, {
    id: 'enemy-health',
    owner: 'enemy',
    sourceStat: 'action-rate',
    sourceEnemyStat: 'health',
    initialValue: 'full',
  }, {
    id: 'health',
    sourceStat: 'health',
    initialValue: 'full',
    onEmpty: [
      { kind: 'stop-action' },
      { kind: 'refill', value: 'max' },
      { kind: 'relocate', locationId: 'starting-location' },
      { kind: 'chat', messageKey: 'resource.health.empty' },
    ],
  }],
  effects: [{
    id: 'action-rate-regeneration',
    resourceId: 'action-rate',
    sourceStat: 'action-rate',
    rateUnit: 'per-second',
    activeWhen: { kind: 'state-variable', variable: 'active-interaction', comparison: 'equal', value: true },
    resetResourceWhenInactive: true,
  }, {
    id: 'enemy-action-rate-regeneration',
    resourceId: 'enemy-action-rate',
    sourceStat: 'action-rate',
    sourceEnemyStat: 'rate',
    rateUnit: 'per-second',
    activeWhen: { kind: 'state-variable', variable: 'active-interaction', comparison: 'equal', value: true },
    resetResourceWhenInactive: true,
  }, {
    id: 'enemy-health-regeneration',
    resourceId: 'enemy-health',
    sourceStat: 'action-rate',
    sourceEnemyStat: 'regeneration',
    activeWhen: { kind: 'state-variable', variable: 'active-interaction', comparison: 'equal', value: true },
  }],
  interactionTypes: [{
    id: 'melee-combat',
    sourceStatId: 'attack',
    targetStatId: 'defense',
    targetPlayerHealth: true,
  }],
  enemies: [enemy()],
};

const action: GameAction = {
  id: 'test-fight',
  locationId: 'arena',
  durationSeconds: 10,
  enemyId: 'training-dummy',
  rewards: [{ kind: 'resource', resourceId: 'fang', amount: 1 }],
};

describe('adversarial actions', () => {
  it('applies globally scaled player damage and continues while the target survives', () => {
    const startedAt = 1_000;
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), action, context, startedAt),
      skillXp: { attack: 10 },
    };
    const source = getCharacterStatValue(state, context.stats ?? [], 'attack', context.skills);
    const expectedDamage = calculateMaxCombatDamage(source, getEnemyStat(enemy(), 'defense'), resolveManifestCombatBalance(context.manifest));
    const resolved = resolveIdleTimers(state, { ...context, actions: [action] }, {
      random: () => 1,
      showReport: true,
    }, startedAt + 10_000);

    expect(resolved.state.activeAction?.targetHealth).toBeCloseTo(200 - expectedDamage, 5);
    expect(resolved.state.resources.fang).toBe(1);
    expect(resolved.state.chatMessages[0].key).toBe('interaction.melee-combat.player.hit');
  });

  it('logs a zero-damage hit without rewards', () => {
    const startedAt = 1_000;
    const state = startAction(createInitialPlayState('test', 'arena'), action, context, startedAt);
    const resolved = resolveIdleTimers(state, { ...context, actions: [action] }, {
      random: () => 0,
    }, startedAt + 10_000);

    expect(resolved.state.activeAction?.targetHealth).toBe(200);
    expect(resolved.state.resources.fang).toBeUndefined();
    expect(resolved.state.chatMessages[0].key).toBe('interaction.melee-combat.player.miss');
  });

  it('grants player and enemy rewards once on kill', () => {
    const startedAt = 1_000;
    const killContext = { ...context, enemies: [enemy({ stats: { health: 2 } })], actions: [action] };
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), action, killContext, startedAt),
      actionLoopingEnabled: false,
      skillXp: { attack: 10 },
    };
    const resolved = resolveIdleTimers(state, killContext, { random: () => 1 }, startedAt + 10_000);
    const repeated = resolveIdleTimers(resolved.state, killContext, { random: () => 1 }, startedAt + 10_001);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.resources).toMatchObject({ fang: 1, trophy: 1 });
    expect(resolved.state.chatMessages[0].key).toBe('interaction.melee-combat.player.kill');
    expect(repeated.state.resources).toMatchObject({ fang: 1, trophy: 1 });
  });

  it('starts a looped replacement enemy with fresh enemy-owned resources after a kill', () => {
    const startedAt = 1_000;
    const killContext = { ...context, manifest: { ...context.manifest!, ui: { loopActionsByDefault: true } }, enemies: [enemy({ stats: { health: 2, rate: 60 } })], actions: [action] };
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), action, killContext, startedAt),
      actionLoopingEnabled: true,
      skillXp: { attack: 10 },
      resourcePools: {
        'enemy-action-rate': { current: 55, min: 0, max: 60 },
      },
    };
    const resolved = resolveIdleTimers(state, killContext, { random: () => 1 }, startedAt + 10_000);

    expect(resolved.state.activeAction?.actionId).toBe(action.id);
    expect(resolved.state.activeAction?.targetHealth).toBe(2);
    expect(resolved.state.resourcePools['enemy-action-rate']).toEqual({ current: 0, min: 0, max: 60 });
    expect(resolved.state.resourcePools['enemy-health']).toEqual({ current: 2, min: 0, max: 2 });
  });

  it('reports player and entity DPS from the same analytical model', () => {
    const state = createInitialPlayState('test', 'arena');
    const hostileContext = { ...context, enemies: [enemy({ stats: { rate: 60 } })] };

    expect(getActionDps(state, action, context)).toBeGreaterThan(0);
    expect(getEnemyAttackDps(state, action, hostileContext)).toBeGreaterThan(0);
  });

  it('applies armor penetration, torpidity, and critical expectation to entity DPS', () => {
    const state = createInitialPlayState('test', 'arena');
    const modifiedContext = {
      ...context,
      enemies: [enemy({ stats: { rate: 60, armorPenetration: 2, torpidity: 1, critChance: 50 } })],
    };
    const plain = getEnemyAttackDps(state, action, { ...context, enemies: [enemy({ stats: { rate: 60 } })] }) ?? 0;
    const modified = getEnemyAttackDps(state, action, modifiedContext) ?? 0;

    expect(modified).not.toBeCloseTo(plain, 5);
  });

  it('regenerates enemy health only while its action is active', () => {
    const startedAt = 1_000;
    const regenContext = { ...context, enemies: [enemy({ stats: { regeneration: 60 } })], actions: [action] };
    const started = startAction(createInitialPlayState('test', 'arena'), action, regenContext, startedAt);
    const injured = {
      ...started,
      activeAction: started.activeAction ? { ...started.activeAction, targetHealth: 50 } : null,
    };
    const resolved = resolveIdleTimers(injured, regenContext, {}, startedAt + 2_000);

    expect(resolved.state.activeAction?.targetHealth).toBeCloseTo(52, 5);
    const idle = resolveIdleTimers({ ...resolved.state, activeAction: null }, regenContext, {}, startedAt + 10_000);
    expect(idle.state.actionProgress[action.id]?.targetHealth).not.toBeGreaterThan(52);
  });

  it('stops and resets the action when a lethal entity attack empties health', () => {
    const startedAt = 1_000;
    const lethalContext = { ...context, enemies: [enemy({ stats: { attack: 20, rate: 60 } })], actions: [action] };
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), action, lethalContext, startedAt),
      playerHealth: 10,
      resourcePools: { health: { current: 10, min: 0, max: 100 } },
    };
    const resolved = resolveIdleTimers(state, lethalContext, { random: () => 1 }, startedAt + 1_000);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.playerHealth).toBe(100);
    expect(resolved.state.chatMessages.map((message) => message.key)).toEqual([
      'interaction.melee-combat.entity.kill',
      'resource.health.empty',
    ]);
    expect(resolved.state.actionProgress[action.id]).toMatchObject({ elapsedMs: 0, targetHealth: null });
  });
});
