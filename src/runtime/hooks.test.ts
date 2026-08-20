import { describe, expect, it } from 'vitest';
import { armAction, armFightAction, createGameState, GameState, initResources, PLAYER, resolve, statValue } from './runtime';
import { characterHooks } from './hooks';
import { equip, unequip } from './equipment';
import { IMPLICIT_TARGET_FULL } from './encounter';
import { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { fromMilliUnits, secondsToMs, toMilliUnits } from './units';

const MODULE = `
# stat attack
base: 0

# stat dr

# stat attack-rate
base: 60

# stat aim

# stat dodge

# stat max-health

# stat max-fury

# stat max-spirit

# stat nick
base: 0.4

# resource health
max: max-health

# resource fury
max: max-fury
start: 0

# resource spirit
max: max-spirit

# event death
resource: health
trigger: on empty

# flag night

# flag coins

# item ear

# item serpent-blade
slot: mainhand
on hit: drain: 3 health from them

# item bell-charm
slot: mainhand
on hit:
  say: charm
  drain: 1 fury

# item night-blade
slot: mainhand
on hit:
  if night:
    drain: 4 health from them

# item ring-of-echoes
slot: neck
on hit: say: ring

# item lucky-coin
slot: neck
on hit:
  1 in 2:
    say: coin
    add: coins

# item briar-mail
slot: body
when hit: drain: 5 health from them

// One declaration, carried rather than written into whoever carries it.
# passive spined
+1 dr
when hit: drain: 5 health from them

# action swing
title: swing
rate: my attack-rate
damage: my attack vs their dr
depletes: their health

# action sap
title: sap
rate: my attack-rate
damage: my attack vs their dr
depletes: their spirit

# action feint
title: feint
rate: my attack-rate
accuracy: my aim vs their dodge
damage: my attack vs their dr
depletes: their health

# entity player
title: You
stats: max-health 100, max-fury 10, max-spirit 30, attack 1, attack-rate 60, aim 0, dodge 0
uses: swing, feint
on hit: restore: 2 fury

# entity dummy
title: Dummy
stats: max-health 20, max-fury 0, dodge 1000
when hit: say: dummy

// Swings nothing and declares no action at all: what it answers with is the
// passive it carries, which is the whole point of reading a moment off the
// character rather than off a verb.
# entity urchin
title: Urchin
stats: max-health 20, max-fury 0, dodge 0
passives: spined

# entity biter
title: Biter
stats: max-health 20, max-fury 10, attack 1, attack-rate 60, aim 1000, dodge 0
uses: swing
when hit: drain: 2 health from them
on death:
  credit:
    give: 1 ear
    restore: 3 fury

# entity boss
title: Boss
stats: max-health 40, max-fury 0, attack 1, attack-rate 60, aim 1000, dodge 0
uses: swing
allies: minion

# entity minion
title: Minion
stats: max-health 5, max-fury 0, attack 1, attack-rate 60, aim 1000, dodge 0
uses: swing

// Sapped for a pool the wisp itself has no ceiling for, which is the shape
// that tells the two branches of the reached-character verdict apart.
# entity wisp
title: Wisp
stats: max-health 20, max-fury 0, max-spirit 0, attack 1, attack-rate 60, aim 1000, dodge 0
uses: sap

# entity anvil
title: Anvil
stats: max-health 100, max-fury 0, attack-rate 60, aim 1000, dodge 0
pry:
  rate: attack-rate
  accuracy: aim vs dodge
  damage: nick

# location arena
x: 0, y: 0
starting
entities: dummy, biter, boss, minion, wisp, anvil, urchin
`;

const loaded = (): Registry => loadInEnglish(MODULE);

function arena(registry: Registry): GameState {
  const state = createGameState('arena');
  initResources(state, registry);
  return state;
}

function wearing(registry: Registry, state: GameState, ...itemIds: string[]): void {
  for (const itemId of itemIds) {
    state.inventory[itemId] = 1;
    equip(state, registry, itemId);
  }
}

const foeHealth = (state: GameState, actorId: string): number => fromMilliUnits(state.activeAction!.actors![actorId].resources['health']);
const own = (state: GameState, resourceId: string): number => fromMilliUnits(state.resources[resourceId] ?? 0);
const setFoeHealth = (state: GameState, actorId: string, health: number): void => {
  state.activeAction!.actors![actorId].resources['health'] = toMilliUnits(health);
};

describe('a passive an entity declares is carried by it', () => {
  it('answers the moment for a character that swings nothing and declares no action', () => {
    const registry = loaded();
    const state = arena(registry);
    expect(characterHooks(state, registry, 'urchin', 'whenHit')).toEqual([[{ kind: 'pool', resource: 'health', delta: { min: -5, max: -5 }, party: 'them' }]]);

    armFightAction('swing', 'urchin', registry, state);
    resolve(state, registry, secondsToMs(1));
    expect(own(state, 'health')).toBe(95);
  });

  it('pays its stat bonus onto the character carrying it, out of the one walk that gathered the hook', () => {
    const registry = loaded();
    const state = arena(registry);
    expect(statValue('dr', state, registry, 'urchin')).toBe(1);
    expect(statValue('dr', state, registry, 'dummy')).toBe(0);
  });
});

describe('a hook is gathered the way a stat bonus is (c2)', () => {
  it('reaches its wearer while the item is equipped and stops when it comes off', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'serpent-blade');
    armFightAction('swing', 'dummy', registry, state);

    resolve(state, registry, secondsToMs(1));
    expect(foeHealth(state, 'dummy')).toBe(16);

    unequip(state, 'mainhand');
    resolve(state, registry, secondsToMs(2));
    expect(foeHealth(state, 'dummy')).toBe(15);
  });

  it('returns the carriers in the order the modifier walk folds them, sheet first', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'bell-charm', 'ring-of-echoes');

    expect(characterHooks(state, registry, PLAYER, 'onHit')).toEqual([
      [{ kind: 'pool', resource: 'fury', delta: { min: 2, max: 2 } }],
      [
        { kind: 'say', text: 'charm', key: 'item.bell-charm.say.0' },
        { kind: 'pool', resource: 'fury', delta: { min: -1, max: -1 } },
      ],
      [{ kind: 'say', text: 'ring', key: 'item.ring-of-echoes.say.0' }],
    ]);
    expect(characterHooks(state, registry, PLAYER, 'whenHit')).toEqual([]);
    expect(characterHooks(state, registry, 'dummy', 'whenHit')).toEqual([[{ kind: 'say', text: 'dummy', key: 'entity.dummy.say.0' }]]);
  });

  it('reads the entity block off whoever is being evaluated, whatever the player wears', () => {
    const registry = loaded();
    const state = arena(registry);
    expect(characterHooks(state, registry, 'biter', 'whenHit')).toEqual([[{ kind: 'pool', resource: 'health', delta: { min: -2, max: -2 }, party: 'them' }]]);
    expect(characterHooks(state, registry, 'biter', 'onHit')).toEqual([]);
  });
});

describe('a hook body is an ordinary result list (c5)', () => {
  it('takes a state gate, which decides the whole body', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'night-blade');
    armFightAction('swing', 'dummy', registry, state);

    resolve(state, registry, secondsToMs(1));
    expect(foeHealth(state, 'dummy')).toBe(19);

    state.flags['night'] = true;
    resolve(state, registry, secondsToMs(2));
    expect(foeHealth(state, 'dummy')).toBe(14);
  });

  it('draws once for the body rather than once per result inside it', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'lucky-coin');
    armFightAction('swing', 'dummy', registry, state);
    setFoeHealth(state, 'dummy', 1000);

    const swings = 40;
    resolve(state, registry, secondsToMs(swings));

    const spoken = state.log.filter((line) => line === 'coin').length;
    expect(state.flags['coins']).toBe(spoken);
    expect(spoken).toBeGreaterThan(0);
    expect(spoken).toBeLessThan(swings);
  });
});

describe('only a landed two-sided swing fires one (c6)', () => {
  it('fires neither block on a miss', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'serpent-blade');
    armFightAction('feint', 'dummy', registry, state);

    resolve(state, registry, secondsToMs(1));
    expect(state.log).toContain('You miss the Dummy.');
    expect(foeHealth(state, 'dummy')).toBe(20);
    expect(state.log).not.toContain('dummy');
    expect(own(state, 'fury')).toBe(0);
  });

  it('fires nothing for an attempt that lands on an implicit target', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'serpent-blade');
    armAction('entity', 'anvil', 'pry', registry, state);

    resolve(state, registry, secondsToMs(1));
    expect(state.activeAction!.implicitTarget).toBeLessThan(IMPLICIT_TARGET_FULL);
    expect(own(state, 'fury')).toBe(0);
  });
});

describe('firing never recurses (c7)', () => {
  it('terminates where both characters answer being hit by draining the other', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'briar-mail');
    armFightAction('swing', 'biter', registry, state);

    resolve(state, registry, secondsToMs(1));
    expect(foeHealth(state, 'biter')).toBe(14);
    expect(own(state, 'health')).toBe(97);
  });
});

describe('firing order within one swing is fixed (c8)', () => {
  it('logs the swing, then the swinger carrier by carrier, then the struck one', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'bell-charm', 'ring-of-echoes');
    armFightAction('swing', 'dummy', registry, state);

    resolve(state, registry, secondsToMs(1));
    expect(state.log).toEqual(['You hit the Dummy for 1.', 'charm', 'ring', 'dummy']);
  });

  it('composes two hooks writing one pool', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'bell-charm');
    armFightAction('swing', 'dummy', registry, state);

    resolve(state, registry, secondsToMs(3));
    expect(own(state, 'fury')).toBe(3);
  });
});

describe('depletion is decided after the hooks, over everyone they reached (c9)', () => {
  it('ends the fight on a target a hook finished off', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'serpent-blade');
    armFightAction('swing', 'biter', registry, state);
    setFoeHealth(state, 'biter', 4);

    resolve(state, registry, secondsToMs(1));
    expect(state.activeAction).toBeNull();
    expect(state.inventory['ear']).toBe(1);
    expect(state.populations['arena']['biter']).toEqual({ down: 1, due: [] });
  });

  it('leaves the fight standing where the same swing does not finish it off', () => {
    const registry = loaded();
    const state = arena(registry);
    armFightAction('swing', 'biter', registry, state);
    setFoeHealth(state, 'biter', 4);

    resolve(state, registry, secondsToMs(1));
    expect(state.activeAction).not.toBeNull();
    expect(foeHealth(state, 'biter')).toBe(3);
    expect(state.inventory['ear']).toBeUndefined();
  });

  it('takes a character a hook felled out of the fight it was not the target of', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'briar-mail');
    armFightAction('swing', 'boss', registry, state);
    expect(Object.keys(state.activeAction!.actors!).sort()).toEqual(['boss', 'minion']);

    resolve(state, registry, secondsToMs(3));
    expect(state.activeAction).not.toBeNull();
    expect(Object.keys(state.activeAction!.roster!).sort()).toEqual([PLAYER, 'boss'].sort());
    expect(Object.keys(state.activeAction!.actors!)).toEqual(['boss']);
    expect(state.activeAction!.cadences['minion']).toBeUndefined();
    expect(state.log.filter((line) => line.startsWith('The Minion hits you'))).toHaveLength(1);
    expect(state.log.filter((line) => line.startsWith('The Boss hits you'))).toHaveLength(3);
  });

  it('does not fell a character a hook reached through a pool that character has no ceiling for', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'briar-mail');
    armFightAction('swing', 'wisp', registry, state);

    resolve(state, registry, secondsToMs(1));
    expect(state.activeAction).not.toBeNull();
    expect(Object.keys(state.activeAction!.actors!)).toEqual(['wisp']);
    expect(own(state, 'spirit')).toBe(29);
    expect(foeHealth(state, 'wisp')).toBe(14);
  });

  it('fells a swinger with what it struck, and ends the fight because it was the target', () => {
    const registry = loaded();
    const state = arena(registry);
    wearing(registry, state, 'briar-mail');
    armFightAction('swing', 'biter', registry, state);
    setFoeHealth(state, 'biter', 6);

    resolve(state, registry, secondsToMs(1));
    expect(state.activeAction).toBeNull();
    expect(state.inventory['ear']).toBe(1);
    expect(state.populations['arena']['biter']).toEqual({ down: 1, due: [] });
    expect(own(state, 'health')).toBe(97);
    expect(own(state, 'fury')).toBe(5);
  });
});
