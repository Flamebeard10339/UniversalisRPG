import { RuntimeError } from './error';
import { describe, expect, it } from 'vitest';
import { ActiveAction, armAction, buffsOf, craft, createGameState, GameState, grantBuff, initResources, PLAYER, resolve, statValue, useAction } from './runtime';
import { actionAddress } from '../content/sections/action';
import { Boundary, BoundarySource, boundarySourceName, requireBoundaryNotPast, requireForwardProgress, STALL_BOUND } from './forwardProgress';
import { IMPLICIT_TARGET_FULL, newCadence } from './encounter';
import { Registry } from '../content/registry';
import { loadModule } from '../content/load';
import { secondsToMs, toMilliUnits } from './units';

const MODULE = `
// Completions per minute: 60/min is one a second, and a +100% buff halves that
// to 0.5s without the action naming a number at all.
# stat cooking-rate
base: 60

# item quickroot
examine: A root that quickens the hands at the stove.
food, +100% cooking-rate, 500s
eat: take: 1 quickroot, say: You chew the root. Your hands feel quick.

// A payload that folds to nothing, so twenty of it can mark twenty boundaries
// without moving a single number the segment produces.
# item marker
food, stacks, +0% cooking-rate, 1s

// Quickroot is eaten instantly; stew takes 3s to eat. That difference is the
// whole point: it is what routes stew to the ARMED path in a live driver, which
// is where the buff used to be dropped on the floor.
# item stew
examine: Thick, hot, and slow to get through.
food, +100% cooking-rate, 60s
eat:
  time: 3
  take: 1 stew
  say: You work through the bowl.

# item raw-shrimp
examine: Fresh-caught shrimp, raw.

# item cooked-shrimp
examine: Hot and pink.

# item blessing
examine: A warm certainty.

# item wood
examine: A split log.

# item edge
examine: A keen edge, ground in.

# item brick
examine: Fired clay.

# skill smithing

# skill cooking

# recipe campfire-cook
rate: cooking-rate
out: 1 cooked-shrimp
skill: cooking 3

# recipe smokehouse-cook
time: 1
in: 1 raw-shrimp
out: 1 cooked-shrimp

# entity torch
light:
  time: 5
  say: The torch flares to life.

// Declared, so the load-time reference pass is satisfied, but with no base: —
// which the stat schema defaults to 0. A typo'd stat id is a load error now;
// this is the case that survives it, and the tutorial ships two such stats.
# stat rusty-rate

# entity shrine
// A rate of 0 makes this action's attempt duration 60000/0 = Infinity, which
// every "non-positive duration" guard passes happily.
chant:
  continuous
  rate: rusty-rate
  give: 1 blessing

// A skill and a difficulty, never an authored probability: the pair is
// contested through hitChance, and a gap of 40 over a spread of 100 lands at
// 1/(1+10^-0.4) = 0.7153 — lopsided enough that both outcomes show up.
# stat cooking
base: 100

# stat shrimp-complexity
base: 60

# item burnt-shrimp
examine: A blackened, inedible husk of what used to be shrimp.

# recipe grill-cook
accuracy: cooking
evasion: shrimp-complexity
time: 1
in: 1 raw-shrimp
out: 1 cooked-shrimp
burnt: 1 burnt-shrimp

# stat chop-power
base: 0.34

# entity tree
// Deterministic multi-hit fight through an implicit target (3 attempts to
// complete, not 1) is combat-shaped, not a craft: it wears down completion
// through repeated low-damage swings rather than converting an input stack
// into an output stack, so it stays a plain repeating entity action instead
// of becoming a recipe (recipes always compile to completion in one attempt).
chop:
  continuous
  damage: chop-power
  time: 1
  give: 1 wood

// A repeating action that is BOTH multi-attempt (ability, so 3 attempts a
// completion) and input-limited (take:, so a finite completion count). That pair
// is the only shape whose boundary can land on the current instant with a
// completion still owed: the segment is zero-length and still does work.
# entity mill
press:
  continuous
  damage: chop-power
  time: 1
  take: 1 raw-shrimp
  give: 1 wood

# stat max-vigor
base: 100

# stat vigor-regen
base: 60

# resource vigor
rate: vigor-regen
max: max-vigor
start: 30

# entity grindstone
// A repeating action that DRAINS a pool per completion while that same pool
// regenerates on its own. Two directions inside one segment is exactly what a
// per-write clamp gets wrong (drain to 0, then regen, versus letting the two
// net out), so this is the associativity gate for the direct pool write.
sharpen:
  continuous
  time: 1
  drain: 2 vigor
  give: 1 edge

# entity whetstone
// The same drain on the stochastic path, where completions land at random
// attempt counts instead of a closed-form cadence.
grind:
  continuous
  time: 1
  accuracy: cooking
  drain: 2 vigor
  give: 1 edge

# entity kiln
flags: bricks-fired
// A repeating ENTITY action that carries an on-success block — the one action
// shape a recipe can't express (recipe results are a fixed take/give/xp/say
// list, no onSuccess block). Kept as a standing regression guard for the
// Pass-1 bug where onSuccess fired once per SEGMENT instead of once per
// completion (non-associative: live driver over-fires vs the REPL). The
// cooking gates above moved to recipes, which would otherwise have left that
// exact bug class untested even though onSuccess is still live content.
fire:
  continuous
  time: 1
  give: 1 brick
  on success:
    add: bricks-fired 1
    xp: smithing 2
`;

function loaded(): Registry {
  return loadModule(MODULE);
}

function recipeActive(registry: Registry, recipeId: string): ActiveAction {
  const action = registry.recipeActions.get(recipeId)!;
  const slug = actionAddress(action);
  return { ownerRef: `recipe.${recipeId}`, actionSlug: slug, repeating: action.kind === 'continuous', implicitTarget: IMPLICIT_TARGET_FULL, cadences: { [PLAYER]: newCadence() }, roster: { [PLAYER]: { ownerRef: `recipe.${recipeId}`, actionSlug: slug, target: recipeId } } };
}

function withCampfireCooking(registry: Registry, buffed: boolean): GameState {
  const state = createGameState('nowhere');
  if (buffed) {
    grantBuff(state, PLAYER, registry.items.get('quickroot')!, secondsToMs(500));
  }
  state.activeAction = recipeActive(registry, 'campfire-cook');
  return state;
}

describe('resolve: associativity (the core invariant)', () => {
  it('resolve(resolve(s, t1), t2) === resolve(s, t2) for random split points, including the buff-expiry instant and mid-completion splits', () => {
    const registry = loaded();

    const oneShot = withCampfireCooking(registry, true);
    resolve(oneShot, registry, secondsToMs(1000));

    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 25; trial++) {
      const waypoints = new Set<number>([500]);
      const splitCount = 3 + Math.floor(rand() * 5);
      for (let i = 0; i < splitCount; i++) waypoints.add(rand() * 1000);
      const sorted = [...waypoints].filter((t) => t > 0 && t < 1000).sort((a, b) => a - b);
      sorted.push(1000);

      const folded = withCampfireCooking(registry, true);
      for (const t of sorted) resolve(folded, registry, secondsToMs(t));

      expect(folded.time).toBe(oneShot.time);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
      expect(folded.buffs).toEqual(oneShot.buffs);
      expect(folded.flags).toEqual(oneShot.flags);
      expect(folded.xp).toEqual(oneShot.xp);
      expect(folded.resources).toEqual(oneShot.resources);
    }
  });

  it('also holds when the action is input-limited partway through (an early split can land exactly on the exhaustion instant)', () => {
    const registry = loaded();

    function withSmokehouse(rawShrimp: number): GameState {
      const state = createGameState('nowhere');
      state.inventory['raw-shrimp'] = rawShrimp;
      state.activeAction = recipeActive(registry, 'smokehouse-cook');
      return state;
    }

    const oneShot = withSmokehouse(28);
    resolve(oneShot, registry, secondsToMs(1000));

    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 15; trial++) {
      const waypoints = new Set<number>([28]);
      for (let i = 0; i < 4; i++) waypoints.add(rand() * 1000);
      const sorted = [...waypoints].filter((t) => t > 0 && t < 1000).sort((a, b) => a - b);
      sorted.push(1000);

      const folded = withSmokehouse(28);
      for (const t of sorted) resolve(folded, registry, secondsToMs(t));

      expect(folded.time).toBe(oneShot.time);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
      expect(folded.resources).toEqual(oneShot.resources);
    }
  });
});

describe('resolve: direct pool writes stay associative alongside a rate', () => {
  function draining(registry: Registry, entityId: string, label: string): GameState {
    const state = createGameState('nowhere');
    initResources(state, registry);
    state.activeAction = { ownerRef: `entity.${entityId}`, actionSlug: label, repeating: true, implicitTarget: IMPLICIT_TARGET_FULL, cadences: { [PLAYER]: newCadence() }, roster: { [PLAYER]: { ownerRef: `entity.${entityId}`, actionSlug: label, target: entityId } } };
    return state;
  }

  const HORIZON = 25;

  it('holds for a deterministic repeating drain across random split points', () => {
    const registry = loaded();
    const oneShot = draining(registry, 'grindstone', 'sharpen');
    resolve(oneShot, registry, secondsToMs(HORIZON));
    expect(oneShot.resources['vigor']).toBe(toMilliUnits(5));
    expect(oneShot.inventory['edge']).toBe(25);

    let seed = 11;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 25; trial++) {
      const waypoints = new Set<number>();
      for (let i = 0; i < 3 + Math.floor(rand() * 5); i++) waypoints.add(rand() * HORIZON);
      const sorted = [...waypoints].filter((t) => t > 0 && t < HORIZON).sort((a, b) => a - b);
      sorted.push(HORIZON);

      const folded = draining(registry, 'grindstone', 'sharpen');
      for (const t of sorted) resolve(folded, registry, secondsToMs(t));

      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.resources['vigor']).toBe(oneShot.resources['vigor']);
    }
  });

  it('holds for a stochastic drain, where completions land at random attempt counts', () => {
    const registry = loaded();
    const oneShot = draining(registry, 'whetstone', 'grind');
    resolve(oneShot, registry, secondsToMs(HORIZON));
    expect(oneShot.inventory['edge']).toBeGreaterThan(0);

    let seed = 13;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 25; trial++) {
      const waypoints = new Set<number>();
      for (let i = 0; i < 3 + Math.floor(rand() * 5); i++) waypoints.add(rand() * HORIZON);
      const sorted = [...waypoints].filter((t) => t > 0 && t < HORIZON).sort((a, b) => a - b);
      sorted.push(HORIZON);

      const folded = draining(registry, 'whetstone', 'grind');
      for (const t of sorted) resolve(folded, registry, secondsToMs(t));

      expect(folded.rng).toBe(oneShot.rng);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.resources['vigor']).toBe(oneShot.resources['vigor']);
    }
  });
});

describe('resolve: repeating action, speed stat, and timed buff (test 1 from the design brief)', () => {
  it('produces exactly 1500 cooked-shrimp over 1000s: 1000 while a x2-speed buff is active (500s @ 0.5s/completion), then 500 more after it expires (500s @ 1s/completion)', () => {
    const registry = loaded();
    const state = withCampfireCooking(registry, true);

    resolve(state, registry, secondsToMs(1000));

    expect(state.inventory['cooked-shrimp']).toBe(1500);
    expect(state.time).toBe(secondsToMs(1000));
    expect(state.activeAction).toEqual(recipeActive(registry, 'campfire-cook'));
    expect(state.buffs).toEqual({});
  });

  it('produces only 500 over the same 1000s with no buff (speed stays 1 throughout)', () => {
    const registry = loaded();
    const state = withCampfireCooking(registry, false);

    resolve(state, registry, secondsToMs(1000));

    expect(state.inventory['cooked-shrimp']).toBe(1000);
  });
});

describe('resolve: input-limited repeating action ends in O(1) segments (test 4)', () => {
  it('wait(1_000_000) with only 28 raw-shrimp yields exactly 28 cooked, 0 raw, and a cleared activeAction — quickly', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    state.inventory['raw-shrimp'] = 28;
    state.activeAction = recipeActive(registry, 'smokehouse-cook');

    const started = performance.now();
    resolve(state, registry, secondsToMs(1_000_000));
    const elapsedMs = performance.now() - started;

    expect(state.inventory['cooked-shrimp']).toBe(28);
    expect(state.inventory['raw-shrimp']).toBe(0);
    expect(state.activeAction).toBeNull();
    expect(elapsedMs).toBeLessThan(50);
  });

  it('resolves the same in a single call when input runs out before the first segment boundary would otherwise land', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    state.inventory['raw-shrimp'] = 0;
    state.activeAction = recipeActive(registry, 'smokehouse-cook');

    resolve(state, registry, secondsToMs(100));

    expect(state.inventory['cooked-shrimp'] ?? 0).toBe(0);
    expect(state.activeAction).toBeNull();
    expect(state.time).toBe(secondsToMs(100));
  });
});

describe('resolve: buff expiry', () => {
  it('the buff is present and boosts the stat right up until expiresAt, then is gone', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    grantBuff(state, PLAYER, registry.items.get('quickroot')!, secondsToMs(500));

    resolve(state, registry, secondsToMs(499));
    expect(statValue('cooking-rate', state, registry)).toBe(120);
    expect(buffsOf(state, PLAYER)).toHaveLength(1);

    resolve(state, registry, secondsToMs(500));
    expect(buffsOf(state, PLAYER)).toEqual([]);
    expect(statValue('cooking-rate', state, registry)).toBe(60);
  });
});

describe('useAction/craft integration: repeating actions, eating grants a live buff, and existing semantics are preserved', () => {
  it('craft() on a repeating recipe produces exactly one completion, then stays active for a later resolve()/wait to continue', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    expect(() => craft('smokehouse-cook', registry, state)).toThrow(RuntimeError);
    expect(state.activeAction).toBeNull();

    state.inventory['raw-shrimp'] = 10;
    craft('smokehouse-cook', registry, state);
    expect(state.activeAction).toEqual(recipeActive(registry, 'smokehouse-cook'));
    expect(state.inventory['cooked-shrimp']).toBe(1);
    expect(state.inventory['raw-shrimp']).toBe(9);
    expect(state.time).toBe(secondsToMs(1));
  });

  it('eating a food item grants its tags as a live timed buff via the ordinary self-consuming eat action', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    state.inventory['quickroot'] = 1;

    useAction('item', 'quickroot', 'eat', registry, state);

    expect(state.inventory['quickroot']).toBe(0);
    expect(state.log).toContain('You chew the root. Your hands feel quick.');
    expect(buffsOf(state, PLAYER)).toEqual([{ source: 'quickroot', tags: registry.items.get('quickroot')!.tags, expiresAt: secondsToMs(500) }]);
    expect(statValue('cooking-rate', state, registry)).toBe(120);
  });

  it('grants a slow meal’s buff on the armed path as well as the instant one, with the clock starting when the bowl is empty', () => {
    const registry = loaded();

    const instant = createGameState('nowhere');
    instant.inventory['stew'] = 1;
    useAction('item', 'stew', 'eat', registry, instant);

    const armed = createGameState('nowhere');
    armed.inventory['stew'] = 1;
    armAction('item', 'stew', 'eat', registry, armed);
    resolve(armed, registry, secondsToMs(10));

    for (const state of [instant, armed]) {
      expect(state.inventory['stew']).toBe(0);
      expect(statValue('cooking-rate', state, registry)).toBe(120);
      expect(buffsOf(state, PLAYER)[0].expiresAt).toBe(secondsToMs(63));
    }
  });

  it('a plain non-repeating action with a real time: cost still advances state.time by exactly that much in one call, as before', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    useAction('entity', 'torch', 'light', registry, state);
    expect(state.time).toBe(secondsToMs(5));
    expect(state.activeAction).toBeNull();
    expect(state.log).toEqual(['The torch flares to life.']);
  });

  it('a continuous action with no cadence is a load error, not a runtime one', () => {
    const module = ['# item ash', 'examine: Grey.', '# entity broken-oven', 'cook:', '  continuous', '  give: 1 ash'].join('\n');
    expect(() => loadModule(module)).toThrow(/continuous action needs a time: or rate:/);
  });

  it('an action whose rate stat reads 0 refuses to start rather than resolving an infinite attempt duration', () => {
    const registry = loaded();
    const state = createGameState('nowhere');

    expect(() => useAction('entity', 'shrine', 'chant', registry, state)).toThrow(/impossible attempt duration/);
    expect(state.time).toBe(0);
    expect(state.activeAction).toBeNull();
  });
});

function withGrillCooking(registry: Registry, rawShrimp: number): GameState {
  const state = createGameState('nowhere');
  state.inventory['raw-shrimp'] = rawShrimp;
  state.activeAction = recipeActive(registry, 'grill-cook');
  return state;
}

function withTreeChopping(): GameState {
  const state = createGameState('nowhere');
  state.activeAction = { ownerRef: 'entity.tree', actionSlug: 'chop', repeating: true, implicitTarget: IMPLICIT_TARGET_FULL, cadences: { [PLAYER]: newCadence() }, roster: { [PLAYER]: { ownerRef: 'entity.tree', actionSlug: 'chop', target: 'tree' } } };
  return state;
}

describe('resolve: stochastic associativity — the accuracy/RNG core gate', () => {
  it('resolve(resolve(s,t1),t2) === resolve(s,t2) for random split points, including mid-fight splits, matching time/inventory/flags/xp/log/activeAction/buffs AND rng', () => {
    const registry = loaded();

    const oneShot = withGrillCooking(registry, 100_000);
    resolve(oneShot, registry, secondsToMs(200));

    let seed = 99;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 25; trial++) {
      const waypoints = new Set<number>();
      const splitCount = 3 + Math.floor(rand() * 6);
      for (let i = 0; i < splitCount; i++) waypoints.add(rand() * 200);
      const sorted = [...waypoints].filter((t) => t > 0 && t < 200).sort((a, b) => a - b);
      sorted.push(200);

      const folded = withGrillCooking(registry, 100_000);
      for (const t of sorted) resolve(folded, registry, secondsToMs(t));

      expect(folded.time).toBe(oneShot.time);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.flags).toEqual(oneShot.flags);
      expect(folded.xp).toEqual(oneShot.xp);
      expect(folded.log.length).toBe(oneShot.log.length);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
      expect(folded.buffs).toEqual(oneShot.buffs);
      expect(folded.rng).toBe(oneShot.rng);
    }
  });
});

describe('resolve: raw-to-burnt outcome distribution (accuracy < 1, attempts: 1)', () => {
  it('produces both cooked and burnt outcomes over many fights, each consuming exactly one raw input, cooked + burnt totaling the fight count', () => {
    const registry = loaded();
    const fights = 500;
    const state = withGrillCooking(registry, fights);

    resolve(state, registry, secondsToMs(fights * 10));

    const cooked = state.inventory['cooked-shrimp'] ?? 0;
    const burnt = state.inventory['burnt-shrimp'] ?? 0;
    expect(state.inventory['raw-shrimp']).toBe(0);
    expect(cooked).toBeGreaterThan(0);
    expect(burnt).toBeGreaterThan(0);
    expect(cooked + burnt).toBe(fights);
    expect(state.activeAction).toBeNull();
  });
});

describe('resolve: deterministic multi-hit fights (implicit target, no accuracy)', () => {
  it('a ceil(1000/abilityAmount)=3 implicit target takes exactly 3 attempts; a mid-fight split carries implicitTarget/attemptsMade and reproduces the one-shot result', () => {
    const registry = loaded();

    const oneShot = withTreeChopping();
    resolve(oneShot, registry, secondsToMs(3));
    expect(oneShot.inventory['wood']).toBe(1);
    expect(oneShot.activeAction).toEqual({ ownerRef: 'entity.tree', actionSlug: 'chop', repeating: true, implicitTarget: toMilliUnits(1), cadences: { [PLAYER]: newCadence() }, roster: { [PLAYER]: { ownerRef: 'entity.tree', actionSlug: 'chop', target: 'tree' } } });

    const midFight = withTreeChopping();
    resolve(midFight, registry, secondsToMs(1));
    expect(midFight.activeAction).toEqual({ ownerRef: 'entity.tree', actionSlug: 'chop', repeating: true, implicitTarget: toMilliUnits(1) - toMilliUnits(0.34), cadences: { player: { progress: 0, attemptsMade: 1 } }, roster: { [PLAYER]: { ownerRef: 'entity.tree', actionSlug: 'chop', target: 'tree' } } });
    expect(midFight.inventory['wood'] ?? 0).toBe(0);

    resolve(midFight, registry, secondsToMs(2));
    expect(midFight.activeAction).toEqual({ ownerRef: 'entity.tree', actionSlug: 'chop', repeating: true, implicitTarget: toMilliUnits(1) - 2 * toMilliUnits(0.34), cadences: { player: { progress: 0, attemptsMade: 2 } }, roster: { [PLAYER]: { ownerRef: 'entity.tree', actionSlug: 'chop', target: 'tree' } } });

    resolve(midFight, registry, secondsToMs(3));
    expect(midFight.inventory['wood']).toBe(1);
    expect(midFight.activeAction).toEqual(oneShot.activeAction);
    expect(midFight.time).toBe(oneShot.time);
  });
});

describe('resolve: onSuccess batches per completion, not per segment (Pass-1 regression guard on entity actions)', () => {
  it('a repeating entity action with on success: matches one-shot vs random splits on flags AND xp — the exact non-associative onSuccess bug', () => {
    const registry = loaded();

    function withKilnFiring(): GameState {
      const state = createGameState('nowhere');
      state.activeAction = { ownerRef: 'entity.kiln', actionSlug: 'fire', repeating: true, implicitTarget: IMPLICIT_TARGET_FULL, cadences: { [PLAYER]: newCadence() }, roster: { [PLAYER]: { ownerRef: 'entity.kiln', actionSlug: 'fire', target: 'kiln' } } };
      return state;
    }

    const oneShot = withKilnFiring();
    resolve(oneShot, registry, secondsToMs(1000));

    let seed = 123;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 20; trial++) {
      const waypoints = new Set<number>();
      const splitCount = 3 + Math.floor(rand() * 5);
      for (let i = 0; i < splitCount; i++) waypoints.add(rand() * 1000);
      const sorted = [...waypoints].filter((t) => t > 0 && t < 1000).sort((a, b) => a - b);
      sorted.push(1000);

      const folded = withKilnFiring();
      for (const t of sorted) resolve(folded, registry, secondsToMs(t));

      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.flags).toEqual(oneShot.flags);
      expect(folded.xp).toEqual(oneShot.xp);
    }
    expect(oneShot.flags['kiln.bricks-fired']).toBe(1000);
    expect(oneShot.xp['smithing']).toBe(2000);
  });
});

const RESOURCE_MODULE = `
# stat regen-rate
base: 0

# stat max-hp
base: 100

# item ember

# item cog

# flag fainted

# resource hp
rate: regen-rate
max: max-hp

# event fainting
resource: hp
trigger: on empty

# stat spark-rate
base: 0

# stat spark-cap
base: 3

# resource spark
rate: spark-rate
max: spark-cap
start: 0

# event sparked
resource: spark
trigger: on full

# entity player
on fainting:
  set: fainted
on sparked:
  give: 1 ember

# entity engine
run:
  continuous
  time: 1
  -120 regen-rate
  +240 spark-rate
  give: 1 cog
`;

describe('resolve: rollover meter (test 2 — pure onFull = empty, batched)', () => {
  it('a +2.5/min pool with max 1, starting empty, rolls over exactly floor(2.5)=2 times in one minute and ends at 0.5', () => {
    const registry = loadModule(`
# stat charge-rate
base: 2.5
# stat charge-cap
base: 1
# item spark
# resource charge
rate: charge-rate
max: charge-cap
start: 0
# event charged
resource: charge
trigger: on full
# entity player
on charged:
  give: 1 spark
`);
    const state = createGameState();
    initResources(state, registry);

    resolve(state, registry, secondsToMs(60));

    expect(state.inventory['spark']).toBe(2);
    expect(state.resources['charge']).toBe(toMilliUnits(0.5));
    expect(state.time).toBe(secondsToMs(60));
  });
});

describe('resolve: net-zero / idle drain falls out (test 3 — O(1) over a huge span)', () => {
  it('a pool whose rate stat nets to zero never moves and resolve() crosses a billion seconds in O(1)', () => {
    const registry = loadModule(`
# stat still-rate
base: 0
# stat still-cap
base: 5
# flag dry
# resource pond
rate: still-rate
max: still-cap
# event dried
resource: pond
trigger: on empty
# entity player
on dried:
  set: dry
`);
    const state = createGameState();
    initResources(state, registry);

    const started = performance.now();
    resolve(state, registry, secondsToMs(1_000_000_000));
    const elapsedMs = performance.now() - started;

    expect(state.resources['pond']).toBe(toMilliUnits(5));
    expect(state.flags['dry']).toBeUndefined();
    expect(state.time).toBe(secondsToMs(1_000_000_000));
    expect(elapsedMs).toBeLessThan(50);
  });
});

describe('resolve: resource associativity (the invariant, extended to pools)', () => {
  it('resource levels, on-empty, and rollover fires all match one-shot vs arbitrary splits, including the exact empty instant', () => {
    const registry = loadModule(RESOURCE_MODULE);

    function fresh(): GameState {
      const state = createGameState();
      initResources(state, registry);
      state.activeAction = { ownerRef: 'entity.engine', actionSlug: 'run', repeating: true, implicitTarget: IMPLICIT_TARGET_FULL, cadences: { [PLAYER]: newCadence() }, roster: { [PLAYER]: { ownerRef: 'entity.engine', actionSlug: 'run', target: 'engine' } } };
      return state;
    }

    const oneShot = fresh();
    resolve(oneShot, registry, secondsToMs(55));
    expect(oneShot.flags['fainted']).toBe(true);
    expect(oneShot.resources['hp']).toBe(0);
    expect(oneShot.inventory['cog']).toBe(55);
    expect(oneShot.inventory['ember']).toBeGreaterThan(0);

    let seed = 2026;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 25; trial++) {
      const waypoints = new Set<number>([50]);
      const splitCount = 3 + Math.floor(rand() * 5);
      for (let i = 0; i < splitCount; i++) waypoints.add(rand() * 55);
      const sorted = [...waypoints].filter((t) => t > 0 && t < 55).sort((a, b) => a - b);
      sorted.push(55);

      const folded = fresh();
      for (const t of sorted) resolve(folded, registry, secondsToMs(t));

      expect(folded.time).toBe(oneShot.time);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.flags).toEqual(oneShot.flags);
      expect(folded.xp).toEqual(oneShot.xp);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
      expect(folded.resourceRateRemainders).toEqual(oneShot.resourceRateRemainders);
      for (const id of Object.keys(oneShot.resources)) {
        expect(folded.resources[id]).toBe(oneShot.resources[id]);
      }
    }
  });
});

describe('resolve: the carried rate remainder', () => {
  function poolModule(rate: number, cap: number, start: number): string {
    return `
# stat seep-rate
base: ${rate}
# stat seep-cap
base: ${cap}
# resource seep
rate: seep-rate
max: seep-cap
start: ${start}

# item tide-charm
food, stacks, +50 seep-rate, 7s
`;
  }

  it('integrates a rate too small to move the pool in one segment, so a split cannot make it vanish', () => {
    const registry = loadModule(poolModule(5, 100, 0));

    const oneShot = createGameState();
    initResources(oneShot, registry);
    resolve(oneShot, registry, secondsToMs(1));
    expect(oneShot.resources['seep']).toBe(83);

    const perMillisecond = createGameState();
    initResources(perMillisecond, registry);
    for (let ms = 1; ms <= secondsToMs(1); ms++) resolve(perMillisecond, registry, ms);
    expect(perMillisecond.resources['seep']).toBe(83);
  });

  it('stays associative across a rate that changes sign mid-span', () => {
    const registry = loadModule(poolModule(-30, 10, 5));
    const FLIP = secondsToMs(7);
    const HORIZON = secondsToMs(20);

    function fresh(): GameState {
      const state = createGameState();
      initResources(state, registry);
      grantBuff(state, PLAYER, registry.items.get('tide-charm')!, FLIP);
      return state;
    }

    const oneShot = fresh();
    resolve(oneShot, registry, HORIZON);
    expect(oneShot.resources['seep']).toBeGreaterThan(0);
    expect(oneShot.resources['seep']).toBeLessThan(toMilliUnits(5));

    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 25; trial++) {
      const waypoints = new Set<number>([FLIP, FLIP - 1, FLIP + 1]);
      for (let i = 0; i < 6; i++) waypoints.add(Math.floor(rand() * HORIZON));
      const sorted = [...waypoints].filter((t) => t > 0 && t < HORIZON).sort((a, b) => a - b);
      sorted.push(HORIZON);

      const folded = fresh();
      for (const t of sorted) resolve(folded, registry, t);

      expect(folded.resources['seep']).toBe(oneShot.resources['seep']);
      expect(folded.resourceRateRemainders).toEqual(oneShot.resourceRateRemainders);
    }
  });

  it('discards the remainder of a segment that clamped, so time spent at the ceiling earns no credit', () => {
    const registry = loadModule(poolModule(7, 4, 4));
    const state = createGameState();
    initResources(state, registry);

    resolve(state, registry, secondsToMs(60));
    expect(state.resources['seep']).toBe(toMilliUnits(4));
    expect(state.resourceRateRemainders['seep']).toBe(0);
  });

  it('accumulates exactly across the four-hour offline cap, an order of magnitude inside the safe-integer range', () => {
    const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000;
    const registry = loadModule(poolModule(1000, 1000000, 0));
    const state = createGameState();
    initResources(state, registry);

    resolve(state, registry, OFFLINE_CAP_MS);

    expect(state.resources['seep']).toBe(toMilliUnits(4 * 60 * 1000));
    expect(toMilliUnits(1000) * OFFLINE_CAP_MS).toBeLessThan(Number.MAX_SAFE_INTEGER / 100);
  });
});

describe('resolve: forward progress', () => {
  const stalled: Boundary = { at: secondsToMs(4), source: { kind: 'resource', resourceId: 'pool' } };

  it('names every source a report can carry', () => {
    expect(boundarySourceName({ kind: 'requested' })).toBe('the requested time');
    expect(boundarySourceName({ kind: 'buff', actorId: PLAYER, source: 'tide' })).toBe('buff tide on player');
    expect(boundarySourceName({ kind: 'action', ownerRef: 'entity.mill', actionSlug: 'press' })).toBe('action entity.mill.press');
    expect(boundarySourceName({ kind: 'resource', resourceId: 'pool' })).toBe('resource pool');
  });

  it('counts a segment that leaves time where it was, and clears the count when time moves', () => {
    expect(requireForwardProgress(stalled, secondsToMs(4), secondsToMs(4), 0)).toBe(1);
    expect(requireForwardProgress(stalled, secondsToMs(4), secondsToMs(4), 1)).toBe(2);
    expect(requireForwardProgress(stalled, secondsToMs(4), secondsToMs(4) + 1, STALL_BOUND - 1)).toBe(0);
  });

  it('throws past the bound, naming the boundary that held time, and not before it', () => {
    expect(() => requireForwardProgress(stalled, secondsToMs(4), secondsToMs(4), STALL_BOUND - 1)).not.toThrow();
    expect(() => requireForwardProgress(stalled, secondsToMs(4), secondsToMs(4), STALL_BOUND)).toThrow(RuntimeError);
    expect(() => requireForwardProgress(stalled, secondsToMs(4), secondsToMs(4), STALL_BOUND)).toThrow(/resource pool/);
  });

  it('rejects a boundary before the current instant', () => {
    const tide: BoundarySource = { kind: 'buff', actorId: PLAYER, source: 'tide' };
    expect(() => requireBoundaryNotPast({ at: secondsToMs(4) - 1, source: tide }, secondsToMs(4))).toThrow(RuntimeError);
    expect(() => requireBoundaryNotPast({ at: secondsToMs(4) - 1, source: tide }, secondsToMs(4))).toThrow(/buff tide on player/);
    expect(() => requireBoundaryNotPast({ at: secondsToMs(4), source: tide }, secondsToMs(4))).not.toThrow();
  });

  it('rejects a boundary before the current instant through resolve, not only as a rule', () => {
    const registry = loadModule(`
# stat seep-rate
base: -0.001
# stat seep-cap
base: 10
# flag dry
# resource pool
rate: seep-rate
max: seep-cap
start: 10
# event dried
resource: pool
trigger: on empty
# entity player
on dried:
  set: dry
`);
    const state = createGameState();
    initResources(state, registry);
    // A carried remainder no run reaches — the engine keeps one under a minute's worth — which is
    // what it takes to make a resource ask for a boundary in the past at all.
    (state.resources as Record<string, number>)['pool'] = toMilliUnits(1);
    state.resourceRateRemainders['pool'] = -30000;

    expect(() => resolve(state, registry, secondsToMs(5))).toThrow(RuntimeError);
    expect(() => resolve(state, registry, secondsToMs(5))).toThrow('resource pool put a boundary at -29999, before the current instant 0');
    expect(state.time).toBe(0);
  });

  it('reports a boundary that never advances instead of spinning on it', () => {
    const registry = loadModule(`
# stat leak-rate
base: -60
# stat leak-cap
base: 10
# flag dry
# resource pool
rate: leak-rate
max: leak-cap
start: 10
# event dried
resource: pool
trigger: on empty
# entity player
on dried:
  set: dry
`);
    const state = createGameState();
    initResources(state, registry);
    (state.resources as Record<string, number>)['pool'] = toMilliUnits(1);
    state.resourceRateRemainders['pool'] = -1;

    expect(() => resolve(state, registry, secondsToMs(5))).toThrow(RuntimeError);
    expect(() => resolve(state, registry, secondsToMs(5))).toThrow(/resource pool/);
    expect(state.time).toBe(0);
  });

  it('lets a zero-length segment through when it consumes a completion at the current instant', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    state.inventory['raw-shrimp'] = 1;
    state.activeAction = { ownerRef: 'entity.mill', actionSlug: 'press', repeating: true, implicitTarget: IMPLICIT_TARGET_FULL - 3 * toMilliUnits(0.34), cadences: { [PLAYER]: { progress: 0, attemptsMade: 3 } }, roster: { [PLAYER]: { ownerRef: 'entity.mill', actionSlug: 'press', target: 'mill' } } };

    resolve(state, registry, secondsToMs(10));

    expect(state.inventory['wood']).toBe(1);
    expect(state.inventory['raw-shrimp']).toBe(0);
    expect(state.activeAction).toBeNull();
    expect(state.time).toBe(secondsToMs(10));
  });

  it('resolves a span carrying far more boundaries than the stall bound exactly as one with none', () => {
    const registry = loaded();
    const markers = 20;
    expect(markers).toBeGreaterThan(STALL_BOUND);

    const state = withCampfireCooking(registry, false);
    for (let i = 1; i <= markers; i++) grantBuff(state, PLAYER, registry.items.get('marker')!, secondsToMs(i));

    resolve(state, registry, secondsToMs(25));

    expect(state.inventory['cooked-shrimp']).toBe(25);
    expect(state.buffs).toEqual({});
    expect(state.time).toBe(secondsToMs(25));
  });
});
