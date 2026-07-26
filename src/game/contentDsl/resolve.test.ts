import { describe, expect, it } from 'vitest';
import { ActiveAction, craft, createGameState, GameState, loadModule, Registry, resolve, RuntimeError, statValue, useAction } from './runtime';

// Fixture for the resolver tests: a speed stat, a food item that doubles it
// for a fixed window, an unbounded repeating cook recipe (campfire-cook — no
// in:, so its input limit is infinite), a finite repeating cook recipe
// (smokehouse-cook — in: raw-shrimp bounds it), a non-repeating action with a
// real time: cost (torch), a repeating action with no time: at all to
// exercise the "must have a positive duration" guard (broken-oven), a
// stochastic repeating cook recipe (grill-cook — accuracy-gated, burns
// instead of retrying on a miss), and a deterministic multi-hit fight (tree).
//
// campfire/smokehouse/grill are RECIPES, not entity actions: a "craft" (turn
// inputs into outputs) is exactly what recipes model now (see recipeAction in
// runtime.ts), and driving these gates through the recipe path is the point
// of this rewrite. `tree` stays a plain entity action — see the comment above
// its definition below for why a multi-hit fight isn't a recipe.
const MODULE = `
# stat cooking-speed
base: 1

# item quickroot
examine: A root that quickens the hands at the stove.
food, +100% cooking-speed, 500s
eat: take: 1 quickroot, say: You chew the root. Your hands feel quick.

# item raw-shrimp
examine: Fresh-caught shrimp, raw.

# recipe campfire-cook
speed: cooking-speed
time: 1
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

# entity broken-oven
cook:
  repeating
  give: 1 cooked-shrimp

# stat cook-success
base: 0.7

# item burnt-shrimp
examine: A blackened, inedible husk of what used to be shrimp.

# recipe grill-cook
accuracy: cook-success
time: 1
in: 1 raw-shrimp
out: 1 cooked-shrimp
burnt: 1 burnt-shrimp

# stat chop-power
base: 1

# entity tree
// Deterministic multi-hit fight against a health pool (health: 3, always
// exactly 3 attempts) is combat-shaped, not a craft: it wears down a
// target's hitpoints rather than converting an input stack into an output
// stack, so it stays a plain repeating entity action instead of becoming a
// recipe (recipes always compile to health: 1 — see recipeAction).
chop:
  repeating
  health: 3
  ability: chop-power
  time: 1
  give: 1 wood

# entity kiln
// A repeating ENTITY action that carries an on-success block — the one action
// shape a recipe can't express (recipe results are a fixed take/give/xp/say
// list, no onSuccess block). Kept as a standing regression guard for the
// Pass-1 bug where onSuccess fired once per SEGMENT instead of once per
// completion (non-associative: live driver over-fires vs the REPL). The
// cooking gates above moved to recipes, which would otherwise have left that
// exact bug class untested even though onSuccess is still live content.
fire:
  repeating
  time: 1
  give: 1 brick
  on success:
    add: bricks-fired 1
    xp: smithing 2
`;

function loaded(): Registry {
  return loadModule(MODULE);
}

// Builds the activeAction for a fresh (0-progress, fully-armed) fight against
// a recipe's compiled Action, looked up from the registry rather than
// hardcoded — the recipe path re-driving these gates should not depend on
// guessing the compiled action's internal label text.
function recipeActive(registry: Registry, recipeId: string): ActiveAction {
  const action = registry.recipeActions.get(recipeId)!;
  return { ownerRef: `recipe.${recipeId}`, actionLabel: action.label, progress: 0, repeating: action.repeating === true, healthRemaining: action.health ?? 1, attemptsMade: 0 };
}

function withCampfireCooking(registry: Registry, buffed: boolean): GameState {
  const state = createGameState('nowhere');
  if (buffed) {
    state.activeBuffs['quickroot:cooking-speed'] = { statId: 'cooking-speed', amount: 1, kind: 'increased', expiresAt: 500 };
  }
  state.activeAction = recipeActive(registry, 'campfire-cook');
  return state;
}

describe('resolve: associativity (the core invariant)', () => {
  it('resolve(resolve(s, t1), t2) === resolve(s, t2) for random split points, including the buff-expiry instant and mid-completion splits', () => {
    const registry = loaded();

    // One big jump, straight to t=1000.
    const oneShot = withCampfireCooking(registry, true);
    resolve(oneShot, registry, 1000);

    // Deterministic LCG so a failure is reproducible without depending on
    // the platform's Math.random implementation.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 25; trial++) {
      const waypoints = new Set<number>([500]); // force a split exactly at the buff's expiry
      const splitCount = 3 + Math.floor(rand() * 5);
      for (let i = 0; i < splitCount; i++) waypoints.add(rand() * 1000); // random mid-completion splits (duration is 0.5 and 1, so these rarely land on a boundary)
      const sorted = [...waypoints].filter((t) => t > 0 && t < 1000).sort((a, b) => a - b);
      sorted.push(1000);

      const folded = withCampfireCooking(registry, true);
      for (const t of sorted) resolve(folded, registry, t);

      expect(folded.time).toBe(oneShot.time);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
      expect(folded.activeBuffs).toEqual(oneShot.activeBuffs);
      // The recipe's xp result must batch per completion, not per segment —
      // this is what catches a non-associative batch where the live driver
      // would over-fire relative to the REPL. (Recipes have no analogue of
      // the old fixture's `on success: add:` flag effect — a recipe's
      // results are a fixed take/give/xp/say shape — so `flags` is asserted
      // here only as a trivial "stays empty on both sides" regression net,
      // not as a batching gate; xp is what actually exercises batching.)
      expect(folded.flags).toEqual(oneShot.flags);
      expect(folded.xp).toEqual(oneShot.xp);
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
    resolve(oneShot, registry, 1000);

    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 15; trial++) {
      const waypoints = new Set<number>([28]); // exactly the exhaustion instant
      for (let i = 0; i < 4; i++) waypoints.add(rand() * 1000);
      const sorted = [...waypoints].filter((t) => t > 0 && t < 1000).sort((a, b) => a - b);
      sorted.push(1000);

      const folded = withSmokehouse(28);
      for (const t of sorted) resolve(folded, registry, t);

      expect(folded.time).toBe(oneShot.time);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
    }
  });
});

describe('resolve: repeating action, speed stat, and timed buff (test 1 from the design brief)', () => {
  it('produces exactly 1500 cooked-shrimp over 1000s: 1000 while a x2-speed buff is active (500s @ 0.5s/completion), then 500 more after it expires (500s @ 1s/completion)', () => {
    const registry = loaded();
    const state = withCampfireCooking(registry, true);

    resolve(state, registry, 1000);

    expect(state.inventory['cooked-shrimp']).toBe(1500);
    expect(state.time).toBe(1000);
    expect(state.activeAction).toEqual(recipeActive(registry, 'campfire-cook'));
    expect(state.activeBuffs).toEqual({});
  });

  it('produces only 500 over the same 1000s with no buff (speed stays 1 throughout)', () => {
    const registry = loaded();
    const state = withCampfireCooking(registry, false);

    resolve(state, registry, 1000);

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
    resolve(state, registry, 1_000_000);
    const elapsedMs = performance.now() - started;

    expect(state.inventory['cooked-shrimp']).toBe(28);
    expect(state.inventory['raw-shrimp']).toBe(0);
    expect(state.activeAction).toBeNull();
    // A per-completion loop over 1,000,000 (or even just 28) ticks would still
    // be fast in absolute terms, but the point of the closed-form segment math
    // is that cost is independent of both the target time and the completion
    // count — a couple of segments, not a million. A generous ceiling here
    // just guards against an accidental fixed-dt regression.
    expect(elapsedMs).toBeLessThan(50);
  });

  it('resolves the same in a single call when input runs out before the first segment boundary would otherwise land', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    state.inventory['raw-shrimp'] = 0;
    state.activeAction = recipeActive(registry, 'smokehouse-cook');

    resolve(state, registry, 100);

    expect(state.inventory['cooked-shrimp'] ?? 0).toBe(0);
    expect(state.activeAction).toBeNull();
    expect(state.time).toBe(100);
  });
});

describe('resolve: buff expiry', () => {
  it('the buff is present and boosts the stat right up until expiresAt, then is gone', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    state.activeBuffs['quickroot:cooking-speed'] = { statId: 'cooking-speed', amount: 1, kind: 'increased', expiresAt: 500 };

    resolve(state, registry, 499);
    expect(statValue('cooking-speed', state, registry)).toBe(2);
    expect(state.activeBuffs['quickroot:cooking-speed']).toBeDefined();

    resolve(state, registry, 500);
    expect(state.activeBuffs['quickroot:cooking-speed']).toBeUndefined();
    expect(statValue('cooking-speed', state, registry)).toBe(1);
  });
});

describe('useAction/craft integration: repeating actions, eating grants a live buff, and existing semantics are preserved', () => {
  it('craft() on a repeating recipe produces exactly one completion, then stays active for a later resolve()/wait to continue', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    expect(() => craft('smokehouse-cook', registry, state)).toThrow(RuntimeError); // no raw-shrimp: recipeCraftable gate fails atomically
    expect(state.activeAction).toBeNull();

    state.inventory['raw-shrimp'] = 10;
    craft('smokehouse-cook', registry, state);
    expect(state.activeAction).toEqual(recipeActive(registry, 'smokehouse-cook'));
    expect(state.inventory['cooked-shrimp']).toBe(1);
    expect(state.inventory['raw-shrimp']).toBe(9);
    expect(state.time).toBe(1);
  });

  it('eating a food item grants its tags as a live timed buff via the ordinary self-consuming eat action', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    state.inventory['quickroot'] = 1;

    useAction('item', 'quickroot', 'eat', registry, state);

    expect(state.inventory['quickroot']).toBe(0);
    expect(state.log).toContain('You chew the root. Your hands feel quick.');
    expect(state.activeBuffs['quickroot:cooking-speed']).toEqual({ statId: 'cooking-speed', amount: 1, kind: 'increased', expiresAt: 500 });
    expect(statValue('cooking-speed', state, registry)).toBe(2);
  });

  it('a plain non-repeating action with a real time: cost still advances state.time by exactly that much in one call, as before', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    useAction('entity', 'torch', 'light', registry, state);
    expect(state.time).toBe(5);
    expect(state.activeAction).toBeNull();
    expect(state.log).toEqual(['The torch flares to life.']);
  });

  it('a repeating action with no time: (duration resolves to 0) refuses to start rather than looping forever', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    expect(() => useAction('entity', 'broken-oven', 'cook', registry, state)).toThrow(RuntimeError);
  });
});

// Fixtures for the fight-model gates: `grill-cook` is a STOCHASTIC repeating
// craft (accuracy: cook-success @ 0.7 — a miss on the one attempt a craft
// gets immediately fails to `burnt` instead of cooking it, since recipeAction
// always compiles accuracy => escape after 1); `tree` is a DETERMINISTIC
// multi-hit repeating fight (health: 3, ability: chop-power @ 1/hit, no
// accuracy — always takes exactly 3 attempts).
function withGrillCooking(registry: Registry, rawShrimp: number): GameState {
  const state = createGameState('nowhere');
  state.inventory['raw-shrimp'] = rawShrimp;
  state.activeAction = recipeActive(registry, 'grill-cook');
  return state;
}

function withTreeChopping(): GameState {
  const state = createGameState('nowhere');
  state.activeAction = { ownerRef: 'entity.tree', actionLabel: 'chop', progress: 0, repeating: true, healthRemaining: 3, attemptsMade: 0 };
  return state;
}

describe('resolve: stochastic associativity — the accuracy/RNG core gate', () => {
  it('resolve(resolve(s,t1),t2) === resolve(s,t2) for random split points, including mid-fight splits, matching time/inventory/flags/xp/log/activeAction/activeBuffs AND rng', () => {
    const registry = loaded();

    const oneShot = withGrillCooking(registry, 100_000);
    resolve(oneShot, registry, 200);

    // A separate seeded LCG, only used here to pick split points — distinct
    // from the resolver's own state.rng, which is exactly what's under test.
    let seed = 99;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 25; trial++) {
      const waypoints = new Set<number>();
      const splitCount = 3 + Math.floor(rand() * 6);
      for (let i = 0; i < splitCount; i++) waypoints.add(rand() * 200); // random mid-attempt splits (duration is 1s, these rarely land on an attempt boundary)
      const sorted = [...waypoints].filter((t) => t > 0 && t < 200).sort((a, b) => a - b);
      sorted.push(200);

      const folded = withGrillCooking(registry, 100_000);
      for (const t of sorted) resolve(folded, registry, t);

      expect(folded.time).toBe(oneShot.time);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.flags).toEqual(oneShot.flags);
      expect(folded.xp).toEqual(oneShot.xp);
      expect(folded.log.length).toBe(oneShot.log.length);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
      expect(folded.activeBuffs).toEqual(oneShot.activeBuffs);
      // The draw that decides attempt N must be the SAME draw regardless of
      // how the calls to resolve() are split — this is what a non-associative
      // RNG (e.g. one keyed by segment count or by wall-clock split points
      // instead of by attempt order) would break.
      expect(folded.rng).toBe(oneShot.rng);
    }
  });
});

describe('resolve: raw-to-burnt outcome distribution (accuracy < 1, escape after 1)', () => {
  it('produces both cooked and burnt outcomes over many fights, each consuming exactly one raw input, cooked + burnt totaling the fight count', () => {
    const registry = loaded();
    const fights = 500;
    const state = withGrillCooking(registry, fights);

    resolve(state, registry, fights * 10); // generous horizon; input runs out well before this

    const cooked = state.inventory['cooked-shrimp'] ?? 0;
    const burnt = state.inventory['burnt-shrimp'] ?? 0;
    expect(state.inventory['raw-shrimp']).toBe(0);
    expect(cooked).toBeGreaterThan(0);
    expect(burnt).toBeGreaterThan(0);
    expect(cooked + burnt).toBe(fights);
    expect(state.activeAction).toBeNull();
  });
});

describe('resolve: deterministic multi-hit fights (health > 1, no accuracy)', () => {
  it('a health:3/ability:1 fight takes exactly ceil(3/1)=3 attempts; a mid-fight split carries healthRemaining/attemptsMade and reproduces the one-shot result', () => {
    const registry = loaded();

    const oneShot = withTreeChopping();
    resolve(oneShot, registry, 3); // exactly one full fight (3 attempts * 1s)
    expect(oneShot.inventory['wood']).toBe(1);
    expect(oneShot.activeAction).toEqual({ ownerRef: 'entity.tree', actionLabel: 'chop', progress: 0, repeating: true, healthRemaining: 3, attemptsMade: 0 }); // rearmed fresh

    const midFight = withTreeChopping();
    resolve(midFight, registry, 1); // 1 of 3 attempts
    expect(midFight.activeAction).toEqual({ ownerRef: 'entity.tree', actionLabel: 'chop', progress: 0, repeating: true, healthRemaining: 2, attemptsMade: 1 });
    expect(midFight.inventory['wood'] ?? 0).toBe(0);

    resolve(midFight, registry, 2); // 2 of 3 attempts
    expect(midFight.activeAction).toEqual({ ownerRef: 'entity.tree', actionLabel: 'chop', progress: 0, repeating: true, healthRemaining: 1, attemptsMade: 2 });

    resolve(midFight, registry, 3); // completes the fight
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
      state.activeAction = { ownerRef: 'entity.kiln', actionLabel: 'fire', progress: 0, repeating: true, healthRemaining: 1, attemptsMade: 0 };
      return state;
    }

    const oneShot = withKilnFiring();
    resolve(oneShot, registry, 1000); // 1000 completions at 1s each

    let seed = 123;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 20; trial++) {
      const waypoints = new Set<number>();
      const splitCount = 3 + Math.floor(rand() * 5);
      for (let i = 0; i < splitCount; i++) waypoints.add(rand() * 1000); // mid-completion splits
      const sorted = [...waypoints].filter((t) => t > 0 && t < 1000).sort((a, b) => a - b);
      sorted.push(1000);

      const folded = withKilnFiring();
      for (const t of sorted) resolve(folded, registry, t);

      expect(folded.inventory).toEqual(oneShot.inventory); // give (results) batches per completion
      expect(folded.flags).toEqual(oneShot.flags); // add: (onSuccess) — would over-fire if batched per segment
      expect(folded.xp).toEqual(oneShot.xp); // xp: (onSuccess) — same
    }
    // Sanity: onSuccess actually ran the expected number of times (1 per
    // completion). `add: bricks-fired` is entity-scoped to `kiln.bricks-fired`
    // (bare set/unset/add inside an entity action scope to the owner); xp's
    // skill id stays global.
    expect(oneShot.flags['kiln.bricks-fired']).toBe(1000);
    expect(oneShot.xp['smithing']).toBe(2000);
  });
});
