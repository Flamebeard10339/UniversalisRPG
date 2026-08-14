import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { loadModule, Registry } from '../content/registry';
import { buffsOf, clearBuffs, expireBuffs, grantBuff, nextBuffExpiry, pruneBuffs, stackCount } from './buffs';
import { Item } from '../content/item';
import { createGameState, endAction, GameState, initResources, PLAYER, resolve, statRange, statValue, useFight } from './runtime';
import { diffState, initialState, loadSave, SAVE_VERSION } from './save';
import { secondsToMs, toMilliUnits } from './units';

// `accelerated-vigor` stacks and `steady-draught` does not, so the two ways a
// second application can land are both authored somewhere.
const MODULE = `
# stat attack
base: 10

# stat dr

# stat max-health
base: 30

# resource health
max: max-health

# event death
resource: health
trigger: on empty

# item accelerated-vigor
food, stacks, +6 attack, 60s

# item steady-draught
food, +6 attack, 60s

# item mire-toxin
food, -4 attack, 30s

# item keen-blade
slot: mainhand
+10% attack per stack of accelerated-vigor

# action strike
title: strike
continuous
time: 1
damage: my attack vs their dr
depletes: their health

# entity player
stats: max-health 30, attack 10
uses: strike

# entity giant-rat
stats: max-health 12, attack 5
`;

function loaded(): Registry {
  return loadModule(MODULE);
}

function started(registry: Registry): GameState {
  const state = createGameState('nowhere');
  initResources(state, registry);
  return state;
}

function itemOf(registry: Registry, id: string): Item {
  return registry.items.get(id)!;
}

describe('a buff is held by an actor', () => {
  it('moves the stats of whoever holds it, player or not, and reaches nobody else', () => {
    const registry = loaded();
    const state = started(registry);

    grantBuff(state, 'giant-rat', itemOf(registry, 'accelerated-vigor'), secondsToMs(60));

    expect(statRange('attack', state, registry, 'giant-rat')).toEqual(point(11));
    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(10));

    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(16));
    expect(statRange('attack', state, registry, 'giant-rat')).toEqual(point(11));
  });

  it('holds one actor instances apart from another, counting each separately', () => {
    const registry = loaded();
    const state = started(registry);
    const vigor = itemOf(registry, 'accelerated-vigor');

    grantBuff(state, PLAYER, vigor, secondsToMs(60));
    grantBuff(state, PLAYER, vigor, secondsToMs(60));
    grantBuff(state, 'giant-rat', vigor, secondsToMs(60));

    expect(stackCount(state, PLAYER, 'accelerated-vigor')).toBe(2);
    expect(stackCount(state, 'giant-rat', 'accelerated-vigor')).toBe(1);
    expect(stackCount(state, 'straw-man', 'accelerated-vigor')).toBe(0);
  });
});

describe('stacking is authored, and is repetition of one payload', () => {
  it('adds an instance for a source that stacks and replaces one for a source that does not', () => {
    const registry = loaded();
    const state = started(registry);

    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(90));
    expect(buffsOf(state, PLAYER).map((buff) => buff.expiresAt)).toEqual([secondsToMs(60), secondsToMs(90)]);

    grantBuff(state, PLAYER, itemOf(registry, 'steady-draught'), secondsToMs(60));
    grantBuff(state, PLAYER, itemOf(registry, 'steady-draught'), secondsToMs(90));
    expect(buffsOf(state, PLAYER).filter((buff) => buff.source === 'steady-draught').map((buff) => buff.expiresAt)).toEqual([secondsToMs(90)]);
  });

  it('pays five stacks of +6 attack out as +30, through the fold and not through arithmetic of its own', () => {
    const registry = loaded();
    const state = started(registry);

    for (let i = 0; i < 5; i++) grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));

    expect(stackCount(state, PLAYER, 'accelerated-vigor')).toBe(5);
    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(40));
  });

  it('makes a debuff the same mechanism with a sign, summing against a buff rather than beside it', () => {
    const registry = loaded();
    const state = started(registry);

    grantBuff(state, PLAYER, itemOf(registry, 'mire-toxin'), secondsToMs(30));
    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(6));

    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(12));
  });
});

describe('a stack count is a counter other modifiers read', () => {
  it('raises what a worn item is worth per stack held, without the buff describing itself', () => {
    const registry = loaded();
    const state = started(registry);
    state.equipped.mainhand = 'keen-blade';

    expect(statValue('attack', state, registry, PLAYER)).toBe(10);

    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    // 10 + 6, then +10% of it for the one stack held.
    expect(statValue('attack', state, registry, PLAYER)).toBeCloseTo(17.6, 10);

    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    // 10 + 12, then +20% for two.
    expect(statValue('attack', state, registry, PLAYER)).toBeCloseTo(26.4, 10);
  });
});

describe('durations tick on the existing cadence', () => {
  it('expires each instance on its own clock, for whoever holds it, through resolve alone', () => {
    const registry = loaded();
    const state = started(registry);

    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(10));
    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(20));
    grantBuff(state, 'giant-rat', itemOf(registry, 'accelerated-vigor'), secondsToMs(30));

    resolve(state, registry, secondsToMs(9));
    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(22));

    resolve(state, registry, secondsToMs(10));
    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(16));

    resolve(state, registry, secondsToMs(20));
    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(10));
    expect(statRange('attack', state, registry, 'giant-rat')).toEqual(point(11));

    resolve(state, registry, secondsToMs(30));
    expect(state.buffs).toEqual({});
  });

  it('reports the earliest expiry any actor holds, which is the boundary resolve stops at', () => {
    const registry = loaded();
    const state = started(registry);

    expect(nextBuffExpiry(state)).toBeUndefined();

    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(20));
    grantBuff(state, 'giant-rat', itemOf(registry, 'accelerated-vigor'), secondsToMs(5));

    expect(nextBuffExpiry(state)).toEqual({ at: secondsToMs(5), actorId: 'giant-rat', source: 'accelerated-vigor' });
  });

  it('reports whether a pass ended anything, so the boundary loop can stop', () => {
    const registry = loaded();
    const state = started(registry);
    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(10));

    expect(expireBuffs(state, secondsToMs(10) - 1)).toBe(false);
    expect(expireBuffs(state, secondsToMs(10))).toBe(true);
    expect(expireBuffs(state, secondsToMs(10))).toBe(false);
  });
});

describe('a buff on a fight-scoped copy dies with the copy', () => {
  it('leaves nothing behind for the copy that stands up in its place', () => {
    const registry = loaded();
    const state = started(registry);
    useFight('strike', 'giant-rat', registry, state);

    grantBuff(state, 'giant-rat', itemOf(registry, 'accelerated-vigor'), secondsToMs(1e9));
    expect(statRange('attack', state, registry, 'giant-rat')).toEqual(point(11));

    resolve(state, registry, secondsToMs(2)); // 10 a hit against 12 health

    expect(state.activeAction!.actors!['giant-rat'].resources.health).toBe(toMilliUnits(12)); // a fresh one
    expect(buffsOf(state, 'giant-rat')).toEqual([]);
    expect(statRange('attack', state, registry, 'giant-rat')).toEqual(point(5));
  });

  it('clears every actor the encounter minted when the action ends, and no other holder', () => {
    const registry = loaded();
    const state = started(registry);
    useFight('strike', 'giant-rat', registry, state);
    grantBuff(state, 'giant-rat', itemOf(registry, 'accelerated-vigor'), secondsToMs(1e9));
    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(1e9));

    endAction(state);

    expect(Object.keys(state.buffs)).toEqual([PLAYER]);
  });

  it('clears an actor named directly, and leaves every other holder alone', () => {
    const registry = loaded();
    const state = started(registry);
    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    grantBuff(state, 'giant-rat', itemOf(registry, 'accelerated-vigor'), secondsToMs(60));

    clearBuffs(state, ['giant-rat']);

    expect(Object.keys(state.buffs)).toEqual([PLAYER]);
  });
});

describe('a buff survives a save, or is pruned with a warning', () => {
  it('round-trips every instance an actor holds, stack count and expiry alike', () => {
    const registry = loaded();
    const state = initialState(registry);
    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(90));
    grantBuff(state, 'giant-rat', itemOf(registry, 'mire-toxin'), secondsToMs(30));

    const saved = { version: SAVE_VERSION, diff: diffState(state, initialState(registry)) };
    const reloaded = initialState(registry);
    expect(loadSave(reloaded, saved, registry)).toEqual([]);

    expect(reloaded.buffs).toEqual(state.buffs);
    expect(stackCount(reloaded, PLAYER, 'accelerated-vigor')).toBe(2);
    expect(statRange('attack', reloaded, registry, PLAYER)).toEqual(point(22));
  });

  it('refuses a body that is not a list of instances rather than reading it as some number of stacks', () => {
    const registry = loaded();
    const load = (held: unknown) => () => loadSave(initialState(registry), { version: SAVE_VERSION, diff: { buffs: { player: held } } as never }, registry);

    expect(load({ 'accelerated-vigor:attack': { statId: 'attack', kind: 'added', amount: point(6), expiresAt: 60 } })).toThrow(/save field buffs/);
    expect(load([{ source: 'accelerated-vigor', expiresAt: 60 }])).toThrow(/save field buffs/);
    expect(load([{ source: 'accelerated-vigor', tags: [{ kind: 'nonsense' }], expiresAt: 60 }])).toThrow(/save field buffs/);
    expect(load([])).not.toThrow();
  });

  it('drops what the registry no longer has - the whole holder, or the one instance - and says so', () => {
    const registry = loaded();
    const state = initialState(registry);
    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    grantBuff(state, PLAYER, { id: 'mystery-flask', tags: [{ kind: 'stat-bonus', statId: 'attack', percent: false, amount: point(1) }] }, secondsToMs(60));
    grantBuff(state, 'wyvern', itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    grantBuff(state, PLAYER, { id: 'steady-draught', tags: [{ kind: 'stat-bonus', statId: 'panache', percent: false, amount: point(1) }] }, secondsToMs(60));

    const warnings = pruneBuffs(state, registry, (actorId) => actorId === PLAYER || registry.entities.has(actorId));

    expect(Object.keys(state.buffs)).toEqual([PLAYER]);
    expect(buffsOf(state, PLAYER).map((buff) => buff.source)).toEqual(['accelerated-vigor']);
    expect(warnings.map((warning) => warning.path)).toEqual(['buffs.player.mystery-flask', 'buffs.player.steady-draught', 'buffs.wyvern']);
    expect(warnings.map((warning) => warning.message)).toEqual([
      'Removed buff mystery-flask on player because its item mystery-flask is not loaded.',
      'Removed buff steady-draught on player because its stat panache is not loaded.',
      'Removed every buff on wyvern because it is not a character this world has.',
    ]);
  });
});
