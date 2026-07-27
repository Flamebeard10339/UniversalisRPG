import { describe, expect, it } from 'vitest';
import { armAction, createGameState, GameState, initResources, loadModule, Registry, resolve } from './runtime';

// An action outliving the circumstances that let it start is the bug this
// covers: a player swinging on at 0 health, a ritual continuing after its
// blessing lapses. Two independent mechanisms answer it and they are tested
// separately — `requires:`/inputs are re-checked by the resolver, while a pool
// running out is content's call via `stop` in that pool's `on empty:` block.
//
// The rat: 16 bites/min (3.75s) for 10 each against 30 health, so the player
// dies on the third bite at t=11.25 exactly. The player swings 25/min (2.4s)
// for 10 against 1000, needing 100 hits — 240s — so the rat always outlives the
// player and the fight would otherwise run the whole span.
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
on empty:
  say: You black out.
  take: 1 rat-tail
  stop

# item rat-tail
examine: Still twitching.

# item blessing
examine: A moment of grace.

# location den
x: 0, y: 0
starting
entities: giant-rat, shrine, beacon, training-post, treadmill

# entity giant-rat
stats: attack 10, dr 0, max-health 1000, attack-rate 16
fight:
  repeating
  time: 60
  speed: attack-rate
  target: health
  ability: attack
  dr: dr
  give: 1 rat-tail
bite:
  retaliates
  time: 60
  speed: attack-rate
  target: health
  ability: attack
  dr: dr

# entity shrine
chant:
  repeating
  requires: moon-up
  time: 1
  give: 1 blessing

# entity beacon
tend:
  repeating
  hidden if: dawn
  time: 1
  give: 1 blessing

# entity training-post
stats: max-health 30, dr 0
drill:
  repeating
  requires: permitted
  time: 60
  speed: attack-rate
  target: health
  ability: attack
  dr: dr
  give: 1 blessing

# entity treadmill
run:
  repeating
  time: 1
  -60 regeneration
  give: 1 blessing
`;

// The same world with nothing declaring health fatal — the control that shows
// stopping is authored rather than something the engine imposes.
const WITHOUT_STOP = MODULE.replace('\n  stop\n', '\n');

function started(source = MODULE): { registry: Registry; state: GameState } {
  const registry = loadModule(source);
  const state = createGameState('den');
  initResources(state, registry);
  return { registry, state };
}

function fighting(source = MODULE): { registry: Registry; state: GameState } {
  const started_ = started(source);
  armAction('entity', 'giant-rat', 'fight', started_.registry, started_.state);
  return started_;
}

describe('a pool running out stops the fight', () => {
  it('ends at the instant health empties, not at the end of whatever span was asked for', () => {
    const { registry, state } = fighting();
    resolve(state, registry, 300);

    expect(state.resources['health']).toBe(0);
    expect(state.activeAction).toBeNull();
    expect(state.log).toContain('You black out.');
    // Under a settle-at-span-end reading the player would have kept swinging
    // through the whole 300s and felled the rat at 240s. No tail means the
    // fight really stopped at 11.25.
    expect(state.inventory['rat-tail'] ?? 0).toBe(0);
    expect(state.time).toBe(300); // time still passes; the player just isn't fighting
  });

  it('pins that instant to the third bite', () => {
    const { registry, state } = fighting();

    resolve(state, registry, 11.2);
    expect(state.resources['health']).toBe(10);
    expect(state.activeAction).not.toBeNull();

    resolve(state, registry, 11.3);
    expect(state.resources['health']).toBe(0);
    expect(state.activeAction).toBeNull();
  });

  it('keeps swinging when no one authored it as fatal', () => {
    const { registry, state } = fighting(WITHOUT_STOP);
    resolve(state, registry, 300);

    // Still at 0 health and still fighting: the engine has no opinion about a
    // pool named `health`, so the fight runs to the rat's death at 240s.
    expect(state.resources['health']).toBe(0);
    expect(state.activeAction).not.toBeNull();
    expect(state.inventory['rat-tail']).toBe(1);
  });

  it('runs the rest of the on-empty block, which is where losing your things lives', () => {
    const { registry, state } = fighting();
    state.inventory['rat-tail'] = 3;
    resolve(state, registry, 300);

    expect(state.inventory['rat-tail']).toBe(2); // `take: 1 rat-tail` on blacking out
    expect(state.log.filter((line) => line === 'You black out.')).toHaveLength(1);
  });

  it('stops a deterministic drain on its exact second too', () => {
    const { registry, state } = started();
    armAction('entity', 'treadmill', 'run', registry, state);
    resolve(state, registry, 100);

    // -60/min against 30 health empties at t=30, and a completion lands on each
    // whole second up to it. nextBoundary already lands the segment there, so
    // this path is exact rather than segment-granular.
    expect(state.inventory['blessing']).toBe(30);
    expect(state.resources['health']).toBe(0);
    expect(state.activeAction).toBeNull();
  });

  it('lands death at the same instant however the span is split', () => {
    const { registry: oneRegistry, state: oneShot } = fighting();
    resolve(oneShot, oneRegistry, 300);

    for (const splits of [[5, 300], [11.25, 300], [1, 2, 3, 11, 11.5, 60, 300], [0.5, 11.2, 11.3, 300]]) {
      const { registry, state } = fighting();
      for (const t of splits) resolve(state, registry, t);

      expect(state.rng).toBe(oneShot.rng);
      expect(state.resources['health']).toBe(oneShot.resources['health']);
      expect(state.activeAction).toEqual(oneShot.activeAction);
      expect(state.inventory).toEqual(oneShot.inventory);
      expect(state.log).toEqual(oneShot.log);
    }
  });
});

describe('a start condition that stops holding', () => {
  it('ends a deterministic action once its requires: goes false', () => {
    const { registry, state } = started();
    state.flags['shrine.moon-up'] = true;
    armAction('entity', 'shrine', 'chant', registry, state);

    resolve(state, registry, 3);
    expect(state.inventory['blessing']).toBe(3);

    delete state.flags['shrine.moon-up'];
    resolve(state, registry, 10);
    expect(state.inventory['blessing']).toBe(3); // nothing since the moon set
    expect(state.activeAction).toBeNull();
  });

  it('ends a per-attempt fight the same way', () => {
    const { registry, state } = started();
    state.flags['training-post.permitted'] = true;
    armAction('entity', 'training-post', 'drill', registry, state);

    // 30 health at 10 a hit is 3 swings, so a fight turns over every 7.2s.
    resolve(state, registry, 15);
    expect(state.inventory['blessing']).toBe(2);

    delete state.flags['training-post.permitted'];
    resolve(state, registry, 100);
    expect(state.inventory['blessing']).toBe(2);
    expect(state.activeAction).toBeNull();
  });

  it('does not treat hidden if: as a reason to stop', () => {
    const { registry, state } = started();
    armAction('entity', 'beacon', 'tend', registry, state);

    resolve(state, registry, 3);
    expect(state.inventory['blessing']).toBe(3);

    // `hidden if:` decides whether an action is OFFERED. One already under way
    // is a different question — a rat fight shouldn't abort mid-swing because
    // the kill-count made the option disappear from the list.
    state.flags['beacon.dawn'] = true;
    resolve(state, registry, 6);
    expect(state.inventory['blessing']).toBe(6);
    expect(state.activeAction).not.toBeNull();
  });
});
