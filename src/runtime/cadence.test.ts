import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { armFightAction, createGameState, GameState, initResources, PLAYER, resolve } from './runtime';
import { loadModule, Registry } from '../content/registry';
import { startSession, view } from './session';
import { attemptDuration } from './stats';
import { secondsToMs, toMilliUnits } from './units';

// `rate:` is attempts per minute, read straight off the stat: player 25/min =
// 2.4s, rat 16/min = 3.75s, hasted 31.25/min = 1.92s.
// giant-rat carries a deep pool; punchbag `uses:` nothing and keeps no clock.
const MODULE = `
# stat attack
base: 10

# stat dr

# stat attack-rate
base: 25

# stat max-health
base: 100

# stat regeneration

# resource health
rate: regeneration
max: max-health

# event death
resource: health
trigger: on empty

# item rat-tail
examine: Still twitching.

# stat max-carapace

# resource carapace
max: max-carapace

# location den
x: 0, y: 0
starting
entities: giant-rat, punchbag

# action fight
title: fight
continuous
rate: my attack-rate
damage: my attack vs their dr
depletes: their health

// First in the rat's uses: list, and reaching a pool the player does not
// carry, so order alone would pick it and the pool rule is what does not.
# action shell-crack
title: shell-crack
continuous
rate: my attack-rate
damage: my attack vs their dr
depletes: their carapace

# entity player
stats: attack 10, dr 0, max-health 100, attack-rate 25
uses: fight
on death:
  say: You black out.

# entity giant-rat
stats: attack 4, dr 2, max-health 10000, attack-rate 16
uses: shell-crack, fight
on death:
  credit:
    give: 1 rat-tail

// The same foe with no uses: line. Nothing to swing back with, which is what
// makes this one a punchbag rather than a second rat.
# entity punchbag
stats: max-health 24, dr 0
`;

function loaded(): Registry {
  return loadModule(MODULE);
}

function fighting(registry: Registry, entityId = 'giant-rat', action = 'fight'): GameState {
  const state = createGameState('den');
  initResources(state, registry);
  armFightAction(action, entityId, registry, state);
  return state;
}

const ratOf = (state: GameState) => state.activeAction!.actors!['giant-rat'];
const ratClock = (state: GameState) => state.activeAction!.cadences['giant-rat'];
const playerClock = (state: GameState) => state.activeAction!.cadences[PLAYER];

describe('independent cadences', () => {
  it('interleaves two clocks with no shared tick', () => {
    const registry = loaded();
    const state = fighting(registry);
    resolve(state, registry, secondsToMs(12));

    // player at 2.4 / 4.8 / 7.2 / 9.6 / 12.0; rat at 3.75 / 7.5 / 11.25
    expect(playerClock(state).attemptsMade).toBe(5);
    expect(ratClock(state)!.attemptsMade).toBe(3);
  });

  it('reads each side damage off its own sheet', () => {
    const registry = loaded();
    const state = fighting(registry);
    resolve(state, registry, secondsToMs(12));

    // player attack 10 - rat dr 2 = 8, five times
    expect(ratOf(state).resources.health).toBe(toMilliUnits(10000 - 5 * 8));
    // rat attack 4 - player dr 0 = 4, three times
    expect(state.resources['health']).toBe(toMilliUnits(100 - 3 * 4));
  });

  it('gives an inert target no clock at all', () => {
    const registry = loaded();
    const state = fighting(registry, 'punchbag');
    expect(state.activeAction!.cadences['punchbag']).toBeUndefined();

    resolve(state, registry, secondsToMs(12));
    expect(state.resources['health']).toBe(toMilliUnits(100)); // nothing swings back
  });

  // The den holds one punchbag and it declares no respawn, so the fight is over
  // when it goes down rather than standing a fresh one up out of nothing.
  it('ends the fight when the last of a population is down', () => {
    const registry = loaded();
    const state = fighting(registry, 'punchbag');
    // 24 hp at 10 a hit: three swings, so it falls at t=7.2.
    resolve(state, registry, secondsToMs(8));

    expect(state.inventory['rat-tail']).toBeUndefined();
    expect(state.activeAction).toBeNull();
    expect(state.populations['den']['punchbag']).toEqual({ down: 1, due: [] });
  });

  // One block, brought by whoever swings: the player is offered its own copy
  // against each foe, and the rat's copy is never a choice of the player's.
  it('offers the two-sided action once per foe, and never as the foe own move', () => {
    const registry = loaded();
    const session = startSession(registry);
    const choices = view(session).choices.filter((choice) => choice.label === 'fight');

    expect(choices.map((choice) => choice.id)).toEqual(['fight:fight:giant-rat', 'fight:fight:punchbag']);
  });
});

// `progress` is elapsed seconds, so raising a rate shortens the swing under way.
describe('a rate raised mid-swing (absolute carry)', () => {
  function hasted(at: number): { registry: Registry; state: GameState } {
    const registry = loaded();
    const state = fighting(registry);
    resolve(state, registry, secondsToMs(at));
    state.activeBuffs['sword:attack-rate'] = { statId: 'attack-rate', kind: 'increased', amount: 0.25, expiresAt: secondsToMs(10_000) };
    return { registry, state };
  }

  it('lands the in-flight swing 0.72s later, not 0.96s or 1.2s', () => {
    // 1.2s banked into a 2.4s swing; at 1.92s per swing, 0.72s remain.
    const { registry, state } = hasted(1.2);
    expect(playerClock(state).progress).toBe(secondsToMs(1.2));

    resolve(state, registry, secondsToMs(1.95));
    expect(playerClock(state).attemptsMade).toBe(1);
  });

  it('leaves the unhasted swing until 2.4, so the assertion above is about the buff', () => {
    const registry = loaded();
    const state = fighting(registry);
    resolve(state, registry, secondsToMs(1.95));
    expect(playerClock(state).attemptsMade).toBe(0);
  });

  it('quickens every later swing too', () => {
    const { registry, state } = hasted(1.2);
    resolve(state, registry, secondsToMs(12));
    // 1.92, 3.84, 5.76, 7.68, 9.6, 11.52 — six swings where 25/min gave five.
    expect(playerClock(state).attemptsMade).toBe(6);
  });
});

describe('two cadences stay associative', () => {
  it('matches one jump against random split points, including the instant both clocks collide', () => {
    const registry = loaded();
    const oneShot = fighting(registry);
    resolve(oneShot, registry, secondsToMs(300));

    let seed = 17;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 25; trial++) {
      // 60 and 120 are where 2.4 and 3.75 collide, so roster order must decide.
      const waypoints = new Set<number>([60, 120]);
      for (let i = 0; i < 3 + Math.floor(rand() * 6); i++) waypoints.add(rand() * 300);
      const sorted = [...waypoints].filter((t) => t > 0 && t < 300).sort((a, b) => a - b);
      sorted.push(300);

      const folded = fighting(registry);
      for (const t of sorted) resolve(folded, registry, secondsToMs(t));

      expect(folded.time).toBe(oneShot.time);
      expect(folded.rng).toBe(oneShot.rng);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(playerClock(folded).attemptsMade).toBe(playerClock(oneShot).attemptsMade);
      expect(ratClock(folded)!.attemptsMade).toBe(ratClock(oneShot)!.attemptsMade);
      expect(ratOf(folded).resources.health).toBe(ratOf(oneShot).resources.health);
      expect(folded.resources['health']).toBe(oneShot.resources['health']);
      expect(playerClock(folded).progress).toBe(playerClock(oneShot).progress);
      expect(ratClock(folded)!.progress).toBe(ratClock(oneShot)!.progress);
    }
  });

  it('resolves both swings at a collision instant, in roster order', () => {
    const registry = loaded();
    const state = fighting(registry);
    resolve(state, registry, secondsToMs(60));
    expect(playerClock(state).attemptsMade).toBe(25);
    expect(ratClock(state)!.attemptsMade).toBe(16);
    expect(playerClock(state).progress).toBe(0);
    expect(ratClock(state)!.progress).toBe(0);
  });
});

describe('the rat sheet', () => {
  it('parses its own bases, leaving the player defaults alone', () => {
    const registry = loaded();
    expect(registry.entities.get('giant-rat')!.stats).toEqual({
      attack: point(4),
      dr: point(2),
      'max-health': point(10000),
      'attack-rate': point(16),
    });
  });

  // `uses:` order is the tiebreak, and the pool the attacker carries is the
  // filter: `shell-crack` comes first and reaches a pool the player has none of.
  it('answers with the first action in uses: whose depletes: names a pool the attacker has', () => {
    const registry = loaded();
    const state = fighting(registry);
    expect(state.activeAction!.roster!['giant-rat']).toEqual({ ownerRef: 'action.fight', actionLabel: 'fight', target: PLAYER });

    // The same rat against a target that DOES carry a carapace answers with the
    // earlier one, so the order is doing work rather than the filter alone.
    const shelled = loadModule(MODULE.replace('stats: attack 10, dr 0, max-health 100, attack-rate 25', 'stats: attack 10, dr 0, max-health 100, max-carapace 20, attack-rate 25'));
    const against = fighting(shelled);
    expect(against.activeAction!.roster!['giant-rat'].actionLabel).toBe('shell-crack');
  });

  it('gives an entity that uses nothing no answer at all, and no attack-rate of 0 to write', () => {
    const registry = loaded();
    const state = fighting(registry, 'punchbag');
    expect(state.activeAction!.roster!['punchbag']).toBeUndefined();
  });
});

// The rewrite from `time: 60` + `speed: <per-minute stat>` to `rate: <stat>` has
// to be arithmetic-neutral, or every timing assertion above is measuring the
// change rather than the engine. These are the durations the suite is built on.
describe('rate: as the per-minute cadence, to the millisecond', () => {
  const action = (registry: Registry, entityId: string, label: string) => registry.entities.get(entityId)!.actions.find((each) => each.label === label)!;

  it('reads the stat against whoever is swinging, and a buff moves it', () => {
    const registry = loaded();
    const state = fighting(registry);

    const fight = registry.actions.get('fight')!;
    expect(attemptDuration(fight, state, registry)).toBe(secondsToMs(2.4));
    expect(attemptDuration(fight, state, registry, 'giant-rat')).toBe(secondsToMs(3.75));

    state.activeBuffs['haste:attack-rate'] = { statId: 'attack-rate', amount: 0.25, kind: 'increased', expiresAt: secondsToMs(60) };
    expect(attemptDuration(fight, state, registry)).toBe(secondsToMs(1.92));
  });

  it('takes a flat per-minute literal, where 15 is the 4s the oven used to write as time: 4', () => {
    const source = ['# item chestnut', 'examine: Warm.', '# entity oven', 'roast:', '  continuous', '  rate: 15', '  give: 1 chestnut', '# entity slow-oven', 'roast:', '  continuous', '  time: 4', '  give: 1 chestnut'].join('\n');
    const registry = loadModule(source);
    const state = createGameState();

    expect(attemptDuration(action(registry, 'oven', 'roast'), state, registry)).toBe(secondsToMs(4));
    expect(attemptDuration(action(registry, 'slow-oven', 'roast'), state, registry)).toBe(secondsToMs(4));
  });
});
