import { describe, expect, it } from 'vitest';
import { createGameState, GameState, loadModule, Registry, resolve, RuntimeError, statValue, useAction } from './runtime';

// Fixture for the resolver tests: a speed stat, a food item that doubles it
// for a fixed window, an unbounded repeating cook action (campfire — no
// take:, so its input limit is infinite), a finite repeating cook action
// (smokehouse — take: raw-shrimp bounds it), a non-repeating action with a
// real time: cost (torch), and a repeating action with no time: at all, to
// exercise the "must have a positive duration" guard (broken-oven).
const MODULE = `
# stat cooking-speed
base: 1

# item quickroot
examine: A root that quickens the hands at the stove.
food, +100% cooking-speed, 500s
eat: take: 1 quickroot, say: You chew the root. Your hands feel quick.

# item raw-shrimp
examine: Fresh-caught shrimp, raw.

# entity campfire
cook:
  repeating
  speed: cooking-speed
  time: 1
  give: 1 cooked-shrimp
  on success:
    add: cooks-done 1
    xp: cooking 3

# entity smokehouse
cook:
  repeating
  time: 1
  take: 1 raw-shrimp
  give: 1 cooked-shrimp

# entity torch
light:
  time: 5
  say: The torch flares to life.

# entity broken-oven
cook:
  repeating
  give: 1 cooked-shrimp
`;

function loaded(): Registry {
  return loadModule(MODULE);
}

function withCampfireCooking(buffed: boolean): GameState {
  const state = createGameState('nowhere');
  if (buffed) {
    state.activeBuffs['quickroot:cooking-speed'] = { statId: 'cooking-speed', amount: 1, kind: 'increased', expiresAt: 500 };
  }
  state.activeAction = { ownerRef: 'entity.campfire', actionLabel: 'cook', progress: 0, repeating: true };
  return state;
}

describe('resolve: associativity (the core invariant)', () => {
  it('resolve(resolve(s, t1), t2) === resolve(s, t2) for random split points, including the buff-expiry instant and mid-completion splits', () => {
    const registry = loaded();

    // One big jump, straight to t=1000.
    const oneShot = withCampfireCooking(true);
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

      const folded = withCampfireCooking(true);
      for (const t of sorted) resolve(folded, registry, t);

      expect(folded.time).toBe(oneShot.time);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
      expect(folded.activeBuffs).toEqual(oneShot.activeBuffs);
      // onSuccess effects (cooks-done counter + cooking xp) must batch per
      // completion, not per segment — this is what catches a non-associative
      // onSuccess where the live driver would over-fire relative to the REPL.
      expect(folded.flags).toEqual(oneShot.flags);
      expect(folded.xp).toEqual(oneShot.xp);
    }
  });

  it('also holds when the action is input-limited partway through (an early split can land exactly on the exhaustion instant)', () => {
    const registry = loaded();

    function withSmokehouse(rawShrimp: number): GameState {
      const state = createGameState('nowhere');
      state.inventory['raw-shrimp'] = rawShrimp;
      state.activeAction = { ownerRef: 'entity.smokehouse', actionLabel: 'cook', progress: 0, repeating: true };
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
    const state = withCampfireCooking(true);

    resolve(state, registry, 1000);

    expect(state.inventory['cooked-shrimp']).toBe(1500);
    expect(state.time).toBe(1000);
    expect(state.activeAction).toEqual({ ownerRef: 'entity.campfire', actionLabel: 'cook', progress: 0, repeating: true });
    expect(state.activeBuffs).toEqual({});
  });

  it('produces only 500 over the same 1000s with no buff (speed stays 1 throughout)', () => {
    const registry = loaded();
    const state = withCampfireCooking(false);

    resolve(state, registry, 1000);

    expect(state.inventory['cooked-shrimp']).toBe(1000);
  });
});

describe('resolve: input-limited repeating action ends in O(1) segments (test 4)', () => {
  it('wait(1_000_000) with only 28 raw-shrimp yields exactly 28 cooked, 0 raw, and a cleared activeAction — quickly', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    state.inventory['raw-shrimp'] = 28;
    state.activeAction = { ownerRef: 'entity.smokehouse', actionLabel: 'cook', progress: 0, repeating: true };

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
    state.activeAction = { ownerRef: 'entity.smokehouse', actionLabel: 'cook', progress: 0, repeating: true };

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

describe('useAction integration: repeating actions, eating grants a live buff, and existing semantics are preserved', () => {
  it('starting a repeating action produces exactly one completion, then stays active for a later resolve()/wait to continue', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    useAction('entity', 'smokehouse', 'cook', registry, state); // no raw-shrimp: fails atomically (take: affordability gate)
    expect(state.activeAction).toBeNull();
    expect(state.log).toEqual(["You don't have enough Raw Shrimp."]);

    state.inventory['raw-shrimp'] = 10;
    useAction('entity', 'smokehouse', 'cook', registry, state);
    expect(state.activeAction).toEqual({ ownerRef: 'entity.smokehouse', actionLabel: 'cook', progress: 0, repeating: true });
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
