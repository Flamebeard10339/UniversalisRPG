import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { actionProgress, armAction, armFightAction, createGameState, GameState, grantBuff, initResources, PLAYER, resolve } from './runtime';
import { Registry } from '../content/registry';
import { loadModule } from '../content/load';
import { startSession, view } from './session';
import { attemptDuration } from './stats';
import { secondsToMs, toMilliUnits } from './units';

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

# item sword-oil
food, +25% attack-rate, 60s

// Nothing a player carries: what a world inflicts to take somebody's pace to
// nothing, which is a rate like any other rather than an impossible one.
# item cold-iron
examine: Your arms will not do what you tell them.
-100% attack-rate, 20s

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
rate: us.attack-rate
damage: us.attack vs them.dr
depletes: them.health

// First in the rat's uses: list, and reaching a pool the player does not
// carry, so order alone would pick it and the pool rule is what does not.
# action shell-crack
title: shell-crack
continuous
rate: us.attack-rate
damage: us.attack vs them.dr
depletes: them.carapace

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

    expect(playerClock(state).attemptsMade).toBe(5);
    expect(ratClock(state)!.attemptsMade).toBe(3);
  });

  it('reads each side damage off its own sheet', () => {
    const registry = loaded();
    const state = fighting(registry);
    resolve(state, registry, secondsToMs(12));

    expect(ratOf(state).resources.health).toBe(toMilliUnits(10000 - 5 * 8));
    expect(state.resources['health']).toBe(toMilliUnits(100 - 3 * 4));
  });

  it('gives an inert target no clock at all', () => {
    const registry = loaded();
    const state = fighting(registry, 'punchbag');
    expect(state.activeAction!.cadences['punchbag']).toBeUndefined();

    resolve(state, registry, secondsToMs(12));
    expect(state.resources['health']).toBe(toMilliUnits(100));
  });

  it('ends the fight when the last of a population is down', () => {
    const registry = loaded();
    const state = fighting(registry, 'punchbag');
    resolve(state, registry, secondsToMs(8));

    expect(state.inventory['rat-tail']).toBeUndefined();
    expect(state.activeAction).toBeNull();
    expect(state.populations['den']['punchbag']).toEqual({ down: 1, due: [] });
  });

  it('offers the two-sided action once per foe, and never as the foe own move', () => {
    const registry = loaded();
    const session = startSession(registry);
    const choices = view(session).choices.filter((choice) => choice.label === 'fight');

    expect(choices.map((choice) => choice.id)).toEqual(['fight:fight:giant-rat', 'fight:fight:punchbag']);
  });
});

describe('a rate raised mid-swing (absolute carry)', () => {
  function hasted(at: number): { registry: Registry; state: GameState } {
    const registry = loaded();
    const state = fighting(registry);
    resolve(state, registry, secondsToMs(at));
    grantBuff(state, PLAYER, registry.items.get('sword-oil')!, secondsToMs(10_000));
    return { registry, state };
  }

  it('lands the in-flight swing 0.72s later, not 0.96s or 1.2s', () => {
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
    expect(registry.entities.get('giant-rat')!.stats).toEqual([
      ['attack', point(4)],
      ['dr', point(2)],
      ['max-health', point(10000)],
      ['attack-rate', point(16)],
    ]);
  });

  it('answers with the first action in uses: whose depletes: names a pool the attacker has', () => {
    const registry = loaded();
    const state = fighting(registry);
    expect(state.activeAction!.roster!['giant-rat']).toEqual({ ownerRef: 'action.fight', actionSlug: 'fight', target: PLAYER });

    const shelled = loadModule(MODULE.replace('stats: attack 10, dr 0, max-health 100, attack-rate 25', 'stats: attack 10, dr 0, max-health 100, max-carapace 20, attack-rate 25'));
    const against = fighting(shelled);
    expect(against.activeAction!.roster!['giant-rat'].actionSlug).toBe('shell-crack');
  });

  it('gives an entity that uses nothing no answer at all, and no attack-rate of 0 to write', () => {
    const registry = loaded();
    const state = fighting(registry, 'punchbag');
    expect(state.activeAction!.roster!['punchbag']).toBeUndefined();
  });
});

describe('rate: as the per-minute cadence, to the millisecond', () => {
  const action = (registry: Registry, entityId: string, label: string) => registry.entities.get(entityId)!.actions.find((each) => each.label === label)!;

  it('reads the stat against whoever is swinging, and a buff moves it', () => {
    const registry = loaded();
    const state = fighting(registry);

    const fight = registry.actions.get('fight')!;
    expect(attemptDuration(fight, state, registry)).toBe(secondsToMs(2.4));
    expect(attemptDuration(fight, state, registry, 'giant-rat')).toBe(secondsToMs(3.75));

    grantBuff(state, PLAYER, registry.items.get('sword-oil')!, secondsToMs(60));
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

const bell = (seconds: string): string =>
  ['# item note', 'examine: A note.', '# stat toll', 'base: 0.2', '# entity bell', 'ring:', '  continuous', `  time: ${seconds}`, '  damage: toll', '  give: 1 note'].join('\n');

describe('the bar draws the cycle it is a bar for', () => {
  it('fills across every attempt one cycle takes, and comes back to the beginning when the cycle does', () => {
    const registry = loadModule(bell('1'));
    const state = createGameState();
    armAction('entity', 'bell', 'ring', registry, state);

    const drawn: number[] = [];
    for (let second = 1; second <= 5; second++) {
      resolve(state, registry, secondsToMs(second));
      drawn.push(actionProgress(state, registry));
    }

    expect(drawn[0], 'a bar that never leaves nothing is the one this drew').toBeGreaterThan(0);
    for (let at = 1; at < 4; at++) expect(drawn[at], `attempt ${at + 1}`).toBeGreaterThan(drawn[at - 1]!);
    expect(drawn[3], 'and it is not capped at the one attempt it counts within').toBeGreaterThan(0.5);
    expect(drawn[4], 'the cycle came round, so the bar is back at the beginning').toBeLessThan(drawn[3]!);
  });

  it('keeps the milliseconds a repeat carries over, so a repeating action does not run slow', () => {
    const registry = loadModule(bell('0.3'));
    const state = createGameState();
    armAction('entity', 'bell', 'ring', registry, state);

    resolve(state, registry, secondsToMs(15));

    expect(state.inventory['note'], 'ten completions of 1.5s each fit in fifteen seconds').toBe(10);
  });
});

describe('a pace taken to nothing stops the run rather than losing it', () => {
  it('holds the bar where it stood, counts no time against it, and picks it up from there', () => {
    const registry = loaded();
    const state = fighting(registry);
    resolve(state, registry, secondsToMs(1));

    const held = playerClock(state).progress;
    const drawn = actionProgress(state, registry);
    expect(held).toBeGreaterThan(0);
    expect(drawn, 'a bar part-way through is what a stall has anything to hold').toBeGreaterThan(0);

    grantBuff(state, PLAYER, registry.items.get('cold-iron')!, secondsToMs(20));
    expect(actionProgress(state, registry), 'a stopped bar holds where it stood rather than emptying').toBe(drawn);

    resolve(state, registry, secondsToMs(15));
    expect(playerClock(state).progress, 'nothing is counted against a run standing still').toBe(held);
    expect(actionProgress(state, registry), 'and it is still where it stopped, all that time later').toBe(drawn);
    expect(state.activeAction, 'standing still is not being over').not.toBeNull();
    expect(playerClock(state).attemptsMade, 'and no attempt was made in all that time').toBe(0);

    resolve(state, registry, secondsToMs(25));
    expect(playerClock(state).attemptsMade, 'the run picked back up once it wore off').toBeGreaterThan(0);
  });
});
