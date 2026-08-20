import { endAction, endJourney } from './actionEnd';
import { clearBuffs } from './buffs';
import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { buffsOf, expireBuffs, grantBuff, nextBuffExpiry, pruneBuffs, stackCount } from './buffs';
import { Item } from '../content/item';
import { createGameState, equip, GameState, initResources, PLAYER, resolve, statRange, statValue, useFight } from './runtime';
import { diffState, initialState, loadSave, SAVE_VERSION } from './save';
import { secondsToMs, toMilliUnits } from './units';

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

# item mint-tonic
food, +7 attack, 60s

# item keen-blade
slot: mainhand
+10% attack per stack of accelerated-vigor

# item venom
-4 attack, 20s

# item envenomed-blade
slot: mainhand
on hit: inflict: venom on them

# item rousing-blade
slot: mainhand
on hit: inflict: accelerated-vigor on me

# item plain-blade
slot: mainhand
on hit: inflict: accelerated-vigor

# item flash-tonic
+2 attack, 40s

# item flashing-blade
slot: mainhand
on hit: inflict: flash-tonic

# item war-cry
food, +3 attack per stack of accelerated-vigor, 60s

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
allies: 1 rat-whelp

// Minted for the fight rather than standing anywhere, so its id carries the
// copy number and it is gone when the fight is.
# entity rat-whelp
stats: max-health 4, attack 1
`;

function loaded(): Registry {
  return loadInEnglish(MODULE);
}

function wider(): Registry {
  return loadInEnglish(
    `${MODULE}
# stat panache

# item mystery-flask
food, +1 attack, 60s
`.replace('food, +7 attack, 60s', 'food, +1 panache, 60s'),
  );
}

const COPY = 'rat-whelp#1';

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
    expect(statValue('attack', state, registry, PLAYER)).toBeCloseTo(17.6, 10);

    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    expect(statValue('attack', state, registry, PLAYER)).toBeCloseTo(26.4, 10);
  });

  it('reads the count off whoever is being evaluated rather than off the player', () => {
    const registry = loaded();
    const state = started(registry);
    const vigor = itemOf(registry, 'accelerated-vigor');

    grantBuff(state, PLAYER, itemOf(registry, 'war-cry'), secondsToMs(60));
    grantBuff(state, 'giant-rat', itemOf(registry, 'war-cry'), secondsToMs(60));
    for (let i = 0; i < 5; i++) grantBuff(state, PLAYER, vigor, secondsToMs(60));
    for (let i = 0; i < 2; i++) grantBuff(state, 'giant-rat', vigor, secondsToMs(60));

    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(55));
    expect(statRange('attack', state, registry, 'giant-rat')).toEqual(point(23));
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

describe('an inflicted buff is granted by the declaration it names', () => {
  const swinging = (registry: Registry, blade: string): GameState => {
    const state = started(registry);
    state.inventory[blade] = 1;
    equip(state, registry, blade);
    useFight('strike', 'giant-rat', registry, state);
    resolve(state, registry, secondsToMs(1));
    return state;
  };

  it('lands on the other party when the phrase names one', () => {
    const registry = loaded();
    const state = swinging(registry, 'envenomed-blade');

    expect(buffsOf(state, 'giant-rat')).toEqual([{ source: 'venom', tags: itemOf(registry, 'venom').tags, expiresAt: secondsToMs(21) }]);
    expect(buffsOf(state, PLAYER)).toEqual([]);
    expect(statValue('attack', state, registry, 'giant-rat')).toBe(1);
  });

  it('lands on the carrier when the phrase names it, and when there is no phrase at all', () => {
    for (const blade of ['rousing-blade', 'plain-blade']) {
      const registry = loaded();
      const state = swinging(registry, blade);
      expect(stackCount(state, PLAYER, 'accelerated-vigor')).toBe(1);
      expect(buffsOf(state, 'giant-rat')).toEqual([]);
    }
  });

  it('expires on the clock its own declaration set, without a second one being named', () => {
    const registry = loaded();
    const state = swinging(registry, 'flashing-blade');
    endAction(state);

    resolve(state, registry, secondsToMs(40));
    expect(buffsOf(state, PLAYER).length).toBe(1);
    resolve(state, registry, secondsToMs(42));
    expect(buffsOf(state, PLAYER)).toEqual([]);
  });

  it('asks the source whether a second application stacks, rather than deciding for it', () => {
    const stacking = loaded();
    const stacked = swinging(stacking, 'rousing-blade');
    resolve(stacked, stacking, secondsToMs(3));
    expect(stackCount(stacked, PLAYER, 'accelerated-vigor')).toBe(3);

    const single = loaded();
    const refreshed = swinging(single, 'flashing-blade');
    resolve(refreshed, single, secondsToMs(3));
    expect(stackCount(refreshed, PLAYER, 'flash-tonic')).toBe(1);
  });
});

describe('a buff on a fight-scoped copy dies with the copy', () => {
  it('leaves nothing behind for the copy that stands up in its place', () => {
    const registry = loaded();
    const state = started(registry);
    useFight('strike', 'giant-rat', registry, state);

    grantBuff(state, 'giant-rat', itemOf(registry, 'accelerated-vigor'), secondsToMs(1e9));
    expect(statRange('attack', state, registry, 'giant-rat')).toEqual(point(11));

    resolve(state, registry, secondsToMs(2));

    expect(state.activeAction!.actors!['giant-rat'].resources.health).toBe(toMilliUnits(12));
    expect(buffsOf(state, 'giant-rat')).toEqual([]);
    expect(statRange('attack', state, registry, 'giant-rat')).toEqual(point(5));
  });

  it('clears the copies the encounter minted when the action ends, and no other holder', () => {
    const registry = loaded();
    const state = started(registry);
    useFight('strike', 'giant-rat', registry, state);
    grantBuff(state, COPY, itemOf(registry, 'accelerated-vigor'), secondsToMs(1e9));
    grantBuff(state, 'giant-rat', itemOf(registry, 'accelerated-vigor'), secondsToMs(1e9));
    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(1e9));

    endAction(state);

    expect(Object.keys(state.buffs).sort()).toEqual(['giant-rat', PLAYER]);
  });

  it('goes when a walk tears the fight down, which never reaches endAction directly', () => {
    const registry = loaded();
    const state = started(registry);
    useFight('strike', 'giant-rat', registry, state);
    grantBuff(state, COPY, itemOf(registry, 'accelerated-vigor'), secondsToMs(1e9));

    endJourney(state);

    expect(state.activeAction).toBeNull();
    expect(state.buffs).toEqual({});
  });

  it('goes when a load stops an action the registry no longer offers', () => {
    const registry = loaded();
    const state = initialState(registry);
    useFight('strike', 'giant-rat', registry, state);
    grantBuff(state, COPY, itemOf(registry, 'accelerated-vigor'), secondsToMs(1e9));

    const saved = { version: SAVE_VERSION, diff: diffState(state, initialState(registry)) };
    const renamed = loadInEnglish(MODULE.replace('# action strike', '# action swing').replace('uses: strike', 'uses: swing'));
    const reloaded = initialState(renamed);
    const warnings = loadSave(reloaded, saved, renamed);

    expect(warnings.map((warning) => warning.path)).toContain('activeAction');
    expect(reloaded.activeAction).toBeNull();
    expect(reloaded.buffs).toEqual({});
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

  it('refuses a tag whose kind is known and whose payload is not what that kind holds', () => {
    const registry = loaded();
    const load = (tag: unknown) => () =>
      loadSave(initialState(registry), { version: SAVE_VERSION, diff: { buffs: { player: [{ source: 'accelerated-vigor', tags: [tag], expiresAt: 60 }] } } as never }, registry);

    expect(load({ kind: 'stat-bonus', statId: 'attack' })).toThrow(/save field buffs/);
    expect(load({ kind: 'stat-bonus', statId: 'attack', percent: false, amount: 6 })).toThrow(/save field buffs/);
    expect(load({ kind: 'stat-bonus', statId: 'attack', percent: false, amount: { min: 9, max: 6 } })).toThrow(/save field buffs/);
    expect(load({ kind: 'stat-bonus', statId: 'attack', percent: true, amount: point(6) })).toThrow(/save field buffs/);
    expect(load({ kind: 'stat-bonus', statId: 'attack', percent: false, amount: point(6), per: 'accelerated-vigor' })).toThrow(/save field buffs/);
    expect(load({ kind: 'keyword' })).toThrow(/save field buffs/);
    expect(load({ kind: 'duration', seconds: 'sixty' })).toThrow(/save field buffs/);

    expect(load({ kind: 'stat-bonus', statId: 'attack', percent: false, amount: point(6) })).not.toThrow();
    expect(load({ kind: 'stat-bonus', statId: 'attack', percent: true, amount: 10, per: { kind: 'stack', id: 'accelerated-vigor' } })).not.toThrow();
    expect(load({ kind: 'keyword', value: 'stacks' })).not.toThrow();
    expect(load({ kind: 'duration', seconds: 60 })).not.toThrow();
  });

  it('drops an instance whose counter names a resource or a source the registry no longer has', () => {
    const registry = loaded();
    const load = (per: unknown) => {
      const state = initialState(registry);
      const tag = { kind: 'stat-bonus', statId: 'attack', percent: false, amount: point(5), per };
      const saved = { version: SAVE_VERSION, diff: { buffs: { player: [{ source: 'accelerated-vigor', tags: [tag], expiresAt: 60_000 }] } } as never };
      return { warnings: loadSave(state, saved, registry), state };
    };

    const gone = load({ kind: 'resource', id: 'no-such-resource' });
    expect(gone.warnings.map((warning) => warning.message)).toEqual(['Removed buff accelerated-vigor on player because its resource no-such-resource is not loaded.']);
    expect(gone.state.buffs).toEqual({});

    const noSource = load({ kind: 'stack', id: 'no-such-item' });
    expect(noSource.warnings.map((warning) => warning.message)).toEqual(['Removed buff accelerated-vigor on player because its item no-such-item is not loaded.']);
    expect(noSource.state.buffs).toEqual({});

    const kept = load({ kind: 'stack', id: 'accelerated-vigor' });
    expect(kept.warnings).toEqual([]);
    expect(statRange('attack', kept.state, registry, PLAYER)).toEqual(point(15));
  });

  it('normalises a holder a save left empty, so a load and a grant spell nothing the same way', () => {
    const registry = loaded();
    const state = initialState(registry);

    expect(loadSave(state, { version: SAVE_VERSION, diff: { buffs: { player: [], 'giant-rat': [] } } as never, }, registry)).toEqual([]);

    expect(state.buffs).toEqual({});
    expect(diffState(state, initialState(registry)).buffs).toBeUndefined();
  });

  it('drops what the registry no longer has - the whole holder, or the one instance - and says so', () => {
    const registry = loaded();
    const state = initialState(registry);
    grantBuff(state, PLAYER, itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    grantBuff(state, PLAYER, itemOf(wider(), 'mystery-flask'), secondsToMs(60));
    grantBuff(state, 'wyvern', itemOf(registry, 'accelerated-vigor'), secondsToMs(60));
    grantBuff(state, PLAYER, itemOf(wider(), 'mint-tonic'), secondsToMs(60));

    const warnings = pruneBuffs(state, registry, (actorId) => actorId === PLAYER || registry.entities.has(actorId));

    expect(Object.keys(state.buffs)).toEqual([PLAYER]);
    expect(buffsOf(state, PLAYER).map((buff) => buff.source)).toEqual(['accelerated-vigor']);
    expect(warnings.map((warning) => warning.path)).toEqual(['buffs.player.mystery-flask', 'buffs.player.mint-tonic', 'buffs.wyvern']);
    expect(warnings.map((warning) => warning.message)).toEqual([
      'Removed buff mystery-flask on player because its item mystery-flask is not loaded.',
      'Removed buff mint-tonic on player because its stat panache is not loaded.',
      'Removed every buff on wyvern because it is not a character this world has.',
    ]);
  });
});
