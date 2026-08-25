import { describe, expect, it } from 'vitest';
import { restorePools } from './effects';
import { armAction, armFightAction, createGameState, GameState, grantBuff, initResources, PLAYER, resolve, resolveUnderWay, UNDER_WAY_LIMIT_MS, useAction, WaitedOut } from './runtime';
import { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { secondsToMs, toMilliUnits } from './units';

const MODULE = `
# stat attack
base: 10

# stat dr

# stat attack-rate
base: 25

# stat max-health
base: 30

# stat regeneration

# resource health
rate: regeneration
max: max-health

# event death
resource: health
trigger: on empty

// A pool whose ceiling is entirely buff-granted: max-vigor has no base:, so when
// the buff lapses the max falls to 0 and the pool has nowhere to be but empty.
# stat max-vigor

# resource vigor
max: max-vigor

# event vigor-gone
resource: vigor
trigger: on empty

# action fight
title: fight
continuous
rate: my attack-rate
damage: my attack vs their dr
depletes: their health

# entity player
stats: attack 10, dr 0, max-health 30, attack-rate 25
uses: fight
on death:
  say: You black out.
  take: 1 rat-tail
  stop
on vigor-gone:
  say: Your vigor gutters out.
  stop

# item rat-tail
examine: Still twitching.

# item blessing
examine: A moment of grace.

# item elixir
food, +20 max-vigor, 10s

# location den
x: 0, y: 0
starting
entities: giant-rat, shrine, beacon, 5 training-post, treadmill, altar, cloister, straw-man

# entity giant-rat
stats: attack 10, dr 0, max-health 1000, attack-rate 16
uses: fight
on death:
  credit:
    give: 1 rat-tail

# entity shrine
flags: moon-up
chant:
  continuous
  requires: moon-up
  time: 1
  give: 1 blessing

# entity beacon
flags: dawn
tend:
  continuous
  hidden if: dawn
  time: 1
  give: 1 blessing

# action drill
title: drill
continuous
requires: permitted
rate: my attack-rate
damage: my attack vs their dr
depletes: their health
give: 1 blessing

# entity training-post
flags: permitted
stats: max-health 30, dr 0

# entity treadmill
run:
  continuous
  time: 1
  -60 regeneration
  give: 1 blessing

// The two entities below carry stop in the ACTION's own results rather than in
// a pool's on-empty block. Same verb, different home, and the home is what used
// to break it: an action's results run inside the resolver, where a batched span
// applies them N times over and a captured local holds the ActiveAction.

# entity altar
// Deterministic and repeating — the shape that batches. One completion a second
// over a 100s span is 100 batched completions, of which exactly one may happen.
chant:
  continuous
  time: 1
  give: 1 blessing
  on success:
    say: You have had enough.
    stop

# entity cloister
// The same batched shape as the altar, with the stop one wrapper deep. Nothing
// about the request changes; the only question is whether the batch planner can
// see a stop it has to look inside a selector to find.
chant:
  continuous
  time: 1
  give: 1 blessing
  on success:
    one of:
      3x: nothing
      1x:
        say: You have had enough.
        stop

// The same request on the per-attempt path, and with stop inline among the
// results rather than in an on-success block. 20 health at 10 a swing is two
// swings at 2.4s, so the fight ends at t=4.8 exactly despite resolving
// attempt-by-attempt.
# action spar
title: spar
continuous
rate: my attack-rate
damage: my attack vs their dr
depletes: their health
give: 1 rat-tail
stop

# entity straw-man
stats: max-health 20, dr 0
`;

const WITHOUT_STOP = MODULE.split('\n')
  .filter((line) => line.trim() !== 'stop')
  .join('\n');

function started(source = MODULE): { registry: Registry; state: GameState } {
  const registry = loadInEnglish(source);
  const state = createGameState('den');
  initResources(state, registry);
  return { registry, state };
}

function fighting(source = MODULE): { registry: Registry; state: GameState } {
  const started_ = started(source);
  armFightAction('fight', 'giant-rat', started_.registry, started_.state);
  return started_;
}

describe('a pool running out stops the fight', () => {
  it('ends at the instant health empties, not at the end of whatever span was asked for', () => {
    const { registry, state } = fighting();
    resolve(state, registry, secondsToMs(300));

    expect(state.resources['health']).toBe(0);
    expect(state.activeAction).toBeNull();
    expect(state.log).toContain('You black out.');
    expect(state.inventory['rat-tail'] ?? 0).toBe(0);
    expect(state.time).toBe(secondsToMs(300));
  });

  it('pins that instant to the third bite', () => {
    const { registry, state } = fighting();

    resolve(state, registry, secondsToMs(11.2));
    expect(state.resources['health']).toBe(toMilliUnits(10));
    expect(state.activeAction).not.toBeNull();

    resolve(state, registry, secondsToMs(11.3));
    expect(state.resources['health']).toBe(0);
    expect(state.activeAction).toBeNull();
  });

  it('keeps swinging when no one authored it as fatal', () => {
    const { registry, state } = fighting(WITHOUT_STOP);
    resolve(state, registry, secondsToMs(300));

    expect(state.resources['health']).toBe(0);
    expect(state.inventory['rat-tail']).toBe(1);
    expect(state.populations['den']['giant-rat']).toEqual({ down: 1, due: [] });
  });

  it('runs the rest of the on-empty block, which is where losing your things lives', () => {
    const { registry, state } = fighting();
    state.inventory['rat-tail'] = 3;
    resolve(state, registry, secondsToMs(300));

    expect(state.inventory['rat-tail']).toBe(2);
    expect(state.log.filter((line) => line === 'You black out.')).toHaveLength(1);
  });

  // Thirty health bled at sixty a minute is one a second, so it falls under one at 29.001s: the
  // twenty-ninth blessing is paid and the thirtieth is not. The pool keeps the 0.999 it fell to —
  // being spent and being empty are different facts, and this treadmill's on-empty block does not
  // restore.
  it('stops a deterministic drain the instant it falls under one, which is not a whole second', () => {
    const { registry, state } = started();
    armAction('entity', 'treadmill', 'run', registry, state);
    resolve(state, registry, secondsToMs(100));

    expect(state.inventory['blessing']).toBe(29);
    expect(state.resources['health']).toBe(toMilliUnits(0.999));
    expect(state.activeAction).toBeNull();
  });

  it('fires on empty: when a shrinking max squeezes a pool to nothing', () => {
    const { registry, state } = started();
    armAction('entity', 'beacon', 'tend', registry, state);
    grantBuff(state, PLAYER, registry.items.get('elixir')!, secondsToMs(10));
    restorePools(state, { vigor: toMilliUnits(20) });

    resolve(state, registry, secondsToMs(20));

    expect(state.resources['vigor']).toBe(0);
    expect(state.log).toContain('Your vigor gutters out.');
    expect(state.activeAction).toBeNull();
    expect(state.inventory['blessing']).toBe(10);
  });

  it('lands death at the same instant however the span is split', () => {
    const { registry: oneRegistry, state: oneShot } = fighting();
    resolve(oneShot, oneRegistry, secondsToMs(300));

    for (const splits of [[5, 300], [11.25, 300], [1, 2, 3, 11, 11.5, 60, 300], [0.5, 11.2, 11.3, 300]]) {
      const { registry, state } = fighting();
      for (const t of splits) resolve(state, registry, secondsToMs(t));

      expect(state.rng).toBe(oneShot.rng);
      expect(state.resources['health']).toBe(oneShot.resources['health']);
      expect(state.activeAction).toEqual(oneShot.activeAction);
      expect(state.inventory).toEqual(oneShot.inventory);
      expect(state.log).toEqual(oneShot.log);
    }
  });
});

describe('`stop` among an action’s own results', () => {
  function stopping(entity: string, action: string): { registry: Registry; state: GameState } {
    const s = started();
    if (s.registry.actions.has(action)) armFightAction(action, entity, s.registry, s.state);
    else armAction('entity', entity, action, s.registry, s.state);
    return s;
  }

  it('ends a batched deterministic action at its first completion, not after the span’s worth', () => {
    const { registry, state } = stopping('altar', 'chant');
    resolve(state, registry, secondsToMs(100));

    expect(state.inventory['blessing']).toBe(1);
    expect(state.log.filter((line) => line === 'You have had enough.')).toHaveLength(1);
    expect(state.activeAction).toBeNull();
    expect(state.time).toBe(secondsToMs(100));
  });

  it('sees a stop behind a selector, so the batch is still capped at one completion', () => {
    const { registry, state } = stopping('cloister', 'chant');
    resolve(state, registry, secondsToMs(100));
    expect(state.activeAction).toBeNull();
    expect(state.log.filter((line) => line === 'You have had enough.')).toHaveLength(1);

    const stepped = stopping('cloister', 'chant');
    for (let t = 1; t <= 100; t++) resolve(stepped.state, stepped.registry, secondsToMs(t));
    expect(stepped.state.inventory).toEqual(state.inventory);
    expect(stepped.state.log).toEqual(state.log);
  });

  it('gives the same answer jumped as stepped, which is the invariant it used to break', () => {
    const jumped = stopping('altar', 'chant');
    resolve(jumped.state, jumped.registry, secondsToMs(100));

    const stepped = stopping('altar', 'chant');
    for (let t = 1; t <= 100; t++) resolve(stepped.state, stepped.registry, secondsToMs(t));

    expect(stepped.state.inventory).toEqual(jumped.state.inventory);
    expect(stepped.state.log).toEqual(jumped.state.log);
    expect(stepped.state.activeAction).toEqual(jumped.state.activeAction);
    expect(stepped.state.time).toBe(jumped.state.time);
  });

  it('ends a per-attempt fight without leaving the resolver holding a felled one', () => {
    const { registry, state } = stopping('straw-man', 'spar');
    resolve(state, registry, secondsToMs(300));

    expect(state.inventory['rat-tail']).toBe(1);
    expect(state.activeAction).toBeNull();
    expect(state.time).toBe(secondsToMs(300));
    expect(state.log.filter((line) => line.startsWith('You hit the Straw Man'))).toHaveLength(2);
  });

  it('lands the per-attempt stop at the same instant however the span is split', () => {
    const jumped = stopping('straw-man', 'spar');
    resolve(jumped.state, jumped.registry, secondsToMs(300));

    for (const splits of [[4.8, 300], [2.4, 5, 300], [1, 2, 3, 4, 5, 60, 300], [0.5, 4.7, 4.9, 300]]) {
      const { registry, state } = stopping('straw-man', 'spar');
      for (const t of splits) resolve(state, registry, secondsToMs(t));

      expect(state.rng).toBe(jumped.state.rng);
      expect(state.inventory).toEqual(jumped.state.inventory);
      expect(state.log).toEqual(jumped.state.log);
      expect(state.activeAction).toEqual(jumped.state.activeAction);
      expect(state.resources).toEqual(jumped.state.resources);
    }
  });
});

describe('a start condition that stops holding', () => {
  it('ends a deterministic action once its requires: goes false', () => {
    const { registry, state } = started();
    state.flags['shrine.moon-up'] = true;
    armAction('entity', 'shrine', 'chant', registry, state);

    resolve(state, registry, secondsToMs(3));
    expect(state.inventory['blessing']).toBe(3);

    delete state.flags['shrine.moon-up'];
    resolve(state, registry, secondsToMs(10));
    expect(state.inventory['blessing']).toBe(3);
    expect(state.activeAction).toBeNull();
  });

  it('ends a per-attempt fight the same way', () => {
    const { registry, state } = started();
    state.flags['training-post.permitted'] = true;
    armFightAction('drill', 'training-post', registry, state);

    resolve(state, registry, secondsToMs(15));
    expect(state.inventory['blessing']).toBe(2);

    delete state.flags['training-post.permitted'];
    resolve(state, registry, secondsToMs(100));
    expect(state.inventory['blessing']).toBe(2);
    expect(state.activeAction).toBeNull();
  });

  it('does not treat hidden if: as a reason to stop', () => {
    const { registry, state } = started();
    armAction('entity', 'beacon', 'tend', registry, state);

    resolve(state, registry, secondsToMs(3));
    expect(state.inventory['blessing']).toBe(3);

    state.flags['beacon.dawn'] = true;
    resolve(state, registry, secondsToMs(6));
    expect(state.inventory['blessing']).toBe(6);
    expect(state.activeAction).not.toBeNull();
  });
});

// One grind, read five ways. A quarter of the tree a swing and two swings allowed is a cycle that
// runs out, so `on unfinished:` is reached on every reading below and only the terminator changes.
const GRIND = `
# stat felling
base: 0.25

# flag gave-up

# event giving-up
trigger: unfinished

# location grove
x: 0, y: 0
starting
entities: dead-alder

# entity dead-alder
grind:
  continuous
  time: 1
  damage: felling
  attempts: 2
  on unfinished:
    set: gave-up
`;

const CYCLE_SECONDS = 2;

function grinding(rewrite: (source: string) => string = (source) => source): { waited: WaitedOut; state: GameState } {
  const registry = loadInEnglish(rewrite(GRIND));
  const state = createGameState('grove');
  initResources(state, registry);
  useAction('entity', 'dead-alder', 'grind', registry, state);
  return { waited: resolveUnderWay(state, registry), state };
}

const dropping = (line: string) => (source: string) => source.replace(`${line}\n`, '');
const after = (line: string, added: string) => (source: string) => source.replace(line, `${line}\n${added}`);

describe('attempts: is a budget for one cycle, and a repeating action is handed a fresh one', () => {
  it('runs out on every reading, and ends only where the action names what ends it', () => {
    const once = grinding(dropping('  continuous'));
    expect(once.waited).toEqual({ ended: true });
    expect(once.state.flags['gave-up']).toBe(true);
    expect(once.state.time).toBe(secondsToMs(CYCLE_SECONDS));

    const repeated = grinding();
    expect(repeated.state.flags['gave-up'], 'the handler runs — it is the cycle behind it that never stops coming').toBe(true);
    expect(repeated.waited.ended).toBe(false);
    expect(repeated.state.time).toBeGreaterThanOrEqual(UNDER_WAY_LIMIT_MS);

    const unbudgeted = grinding(dropping('  attempts: 2'));
    expect(unbudgeted.state.flags['gave-up'], 'nothing ran out, so nothing was given up on').toBeUndefined();
    expect(unbudgeted.waited.ended, 'the same four hours with no attempts: written at all').toBe(false);
    expect(unbudgeted.state.time).toBeGreaterThanOrEqual(UNDER_WAY_LIMIT_MS);

    for (const naming of [after('    set: gave-up', '    stop'), after('  attempts: 2', '  stops on: giving-up')]) {
      const ends = grinding(naming);
      expect(ends.waited).toEqual({ ended: true });
      expect(ends.state.flags['gave-up']).toBe(true);
      expect(ends.state.time).toBe(secondsToMs(CYCLE_SECONDS));
    }
  });
});
