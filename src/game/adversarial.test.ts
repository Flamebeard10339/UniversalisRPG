import { describe, expect, it } from 'vitest';
import { getActionDps, getEnemyAttackDps } from './adversarial';
import { DAMAGE_SCALE } from './combatBalance';
import type { ActionResolutionContext, EnemyDefinition, GameAction } from './types';
import { createInitialPlayState, resolveIdleTimers, startAction } from './timers';

const enemy = (patch: Partial<EnemyDefinition> = {}): EnemyDefinition => ({
  id: 'training-dummy',
  interactionTypeId: 'melee-combat',
  attack: 8,
  defense: 7,
  health: 200,
  rate: 0,
  regeneration: 0,
  armorPenetration: 0,
  torpidity: 0,
  critChance: 0,
  critMultiplier: 2,
  showHealthBar: true,
  rewards: [{ kind: 'resource', resourceId: 'trophy', amount: 1 }],
  ...patch,
});

const context: ActionResolutionContext = {
  actions: [],
  skills: [
    { id: 'attack', maxLevel: 100 },
    { id: 'defense', maxLevel: 100 },
  ],
  locations: [{ id: 'arena', position: { x: 0, y: 0 }, starting: true }],
  resourceDefinitions: [{
    id: 'health',
    sourceStat: 'defense',
    initialValue: 'full',
    onEmpty: [
      { kind: 'stop-action' },
      { kind: 'refill', value: 'max' },
      { kind: 'relocate', locationId: 'starting-location' },
      { kind: 'chat', messageKey: 'resource.health.empty' },
    ],
  }],
  effects: [],
  interactionTypes: [{
    id: 'melee-combat',
    sourceSkillId: 'attack',
    targetSkillId: 'defense',
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
    const resolved = resolveIdleTimers(state, { ...context, actions: [action] }, {
      random: () => 1,
      showReport: true,
    }, startedAt + 10_000);

    expect(resolved.state.activeAction?.targetHealth).toBeCloseTo(200 - 7 * DAMAGE_SCALE, 5);
    expect(resolved.state.resources.fang).toBe(1);
    expect(resolved.state.chatMessages[0].key).toBe('interaction.melee-combat.player.hit');
  });

  it('logs a miss without rewards', () => {
    const startedAt = 1_000;
    const state = startAction(createInitialPlayState('test', 'arena'), action, context, startedAt);
    const resolved = resolveIdleTimers(state, { ...context, actions: [action] }, {
      random: () => 0.5,
    }, startedAt + 10_000);

    expect(resolved.state.activeAction?.targetHealth).toBe(200);
    expect(resolved.state.resources.fang).toBeUndefined();
    expect(resolved.state.chatMessages[0].key).toBe('interaction.melee-combat.player.miss');
  });

  it('grants player and enemy rewards once on kill', () => {
    const startedAt = 1_000;
    const killContext = { ...context, enemies: [enemy({ health: 50 })], actions: [action] };
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), action, killContext, startedAt),
      skillXp: { attack: 10 },
    };
    const resolved = resolveIdleTimers(state, killContext, { random: () => 1 }, startedAt + 10_000);
    const repeated = resolveIdleTimers(resolved.state, killContext, { random: () => 1 }, startedAt + 10_001);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.resources).toMatchObject({ fang: 1, trophy: 1 });
    expect(resolved.state.chatMessages[0].key).toBe('interaction.melee-combat.player.kill');
    expect(repeated.state.resources).toMatchObject({ fang: 1, trophy: 1 });
  });

  it('reports player and entity DPS from the same analytical model', () => {
    const state = createInitialPlayState('test', 'arena');
    const hostileContext = { ...context, enemies: [enemy({ rate: 60 })] };

    expect(getActionDps(state, action, context)).toBeGreaterThan(0);
    expect(getEnemyAttackDps(state, action, hostileContext)).toBeGreaterThan(0);
  });

  it('applies armor penetration, torpidity, and critical expectation to entity DPS', () => {
    const state = createInitialPlayState('test', 'arena');
    const modifiedContext = {
      ...context,
      enemies: [enemy({ rate: 60, armorPenetration: 2, torpidity: 1, critChance: 50, critMultiplier: 2 })],
    };
    const plain = getEnemyAttackDps(state, action, { ...context, enemies: [enemy({ rate: 60 })] }) ?? 0;
    const modified = getEnemyAttackDps(state, action, modifiedContext) ?? 0;

    expect(modified).not.toBeCloseTo(plain, 5);
  });

  it('regenerates enemy health only while its action is active', () => {
    const startedAt = 1_000;
    const regenContext = { ...context, enemies: [enemy({ regeneration: 60 })], actions: [action] };
    const started = startAction(createInitialPlayState('test', 'arena'), action, regenContext, startedAt);
    const injured = {
      ...started,
      activeAction: started.activeAction ? { ...started.activeAction, targetHealth: 50 } : null,
    };
    const resolved = resolveIdleTimers(injured, regenContext, {}, startedAt + 5_000);

    expect(resolved.state.activeAction?.targetHealth).toBeCloseTo(55, 5);
    const idle = resolveIdleTimers({ ...resolved.state, activeAction: null }, regenContext, {}, startedAt + 10_000);
    expect(idle.state.actionProgress[action.id]?.targetHealth).not.toBeGreaterThan(55);
  });

  it('stops and resets the action when a lethal entity attack empties health', () => {
    const startedAt = 1_000;
    const lethalContext = { ...context, enemies: [enemy({ attack: 20, rate: 60 })], actions: [action] };
    const state = {
      ...startAction(createInitialPlayState('test', 'arena'), action, lethalContext, startedAt),
      playerHealth: 10,
    };
    const resolved = resolveIdleTimers(state, lethalContext, { random: () => 1 }, startedAt + 1_000);

    expect(resolved.state.activeAction).toBeNull();
    expect(resolved.state.playerHealth).toBe(7);
    expect(resolved.state.chatMessages.map((message) => message.key)).toEqual([
      'interaction.melee-combat.entity.kill',
      'resource.health.empty',
    ]);
    expect(resolved.state.actionProgress[action.id]).toMatchObject({ elapsedMs: 0, targetHealth: null });
  });
});
