import { describe, expect, it } from 'vitest';
import { armFightAction, createGameState, GameState, initResources, resolve, useAction } from './runtime';
import { loadInEnglish } from '../content/engineLocale';
import { secondsToMs, toMilliUnits } from './units';

// One pool that fills on its own and one action that empties it, so a span can
// be cut anywhere and asked whether the cut changed what was reported.
const POOLS = `
# stat max-vigour
base: 100

# stat trickle
base: 60

# stat max-health

# stat attack
base: 4

# stat dr

# stat attack-rate
base: 60

# resource vigour
max: max-vigour
rate: trickle
start: 0

# resource health
max: max-health

# faction people

# faction vermin

# event topped-up
trigger: restored
resource: vigour

# event worn-down
trigger: drained
resource: vigour

# skill resting
gain amount experience on topped-up

# skill enduring
gain 2*amount experience on worn-down

# action loaf
title: loaf
time: 1

# action strain
title: strain
time: 1
drain: 3 vigour

# entity player
faction: people
stats: max-health 1000, attack 4, attack-rate 60
skills: resting, enduring
uses: loaf, strain

# location camp
x: 0, y: 0
starting
`;

function rested(seconds: number, cuts: number): GameState {
  const registry = loadInEnglish(POOLS);
  const state = createGameState('camp');
  initResources(state, registry);
  for (let cut = 1; cut <= cuts; cut += 1) resolve(state, registry, secondsToMs((seconds * cut) / cuts));
  return state;
}

describe('restored and drained report whole units the pool actually moved', () => {
  it('grants for the units gained, and does not depend on where the span was cut', () => {
    // A minute of `trickle` is 60 units, so ten seconds is ten of them however
    // many pieces the ten seconds are resolved in.
    for (const cuts of [1, 2, 3, 7, 10, 100]) {
      const state = rested(10, cuts);
      expect(state.resources.vigour, `${cuts} cuts`).toBe(toMilliUnits(10));
      expect(state.xp, `${cuts} cuts`).toEqual({ resting: 10 });
    }
  });

  it('reports nothing for a settle that moves the pool by less than a unit', () => {
    const state = rested(0.5, 1);
    expect(state.resources.vigour).toBe(toMilliUnits(0.5));
    expect(state.xp).toEqual({});
  });

  it('grants for the units lost when a result drains the pool', () => {
    const registry = loadInEnglish(POOLS);
    const state = createGameState('camp');
    initResources(state, registry);
    resolve(state, registry, secondsToMs(10));
    expect(state.xp).toEqual({ resting: 10 });

    useAction('action', 'strain', 'strain', registry, state);
    // The second the strain takes is one unit of trickle up and three of drain
    // down; the two settle apart, so they are reported apart and their sum is
    // still the two units the pool actually moved.
    expect(state.resources.vigour).toBe(toMilliUnits(8));
    expect(state.xp).toEqual({ resting: 11, enduring: 6 });
  });
});
