import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { armAction, createGameState, GameState, initResources, PLAYER, resolve } from './runtime';
import { loadModule, Registry } from '../content/registry';
import { startSession, view } from './session';
import { attemptDuration } from './stats';
import { secondsToMs, toMilliUnits } from './units';

// `rate:` is attempts per minute, read straight off the stat: player 25/min =
// 2.4s, rat 16/min = 3.75s, hasted 31.25/min = 1.92s.
// giant-rat carries a deep pool; punchbag has no `retaliates` and keeps no clock.
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
on empty:
  say: You black out.

# item rat-tail
examine: Still twitching.

# location den
x: 0, y: 0
starting
entities: giant-rat, punchbag

# entitytype melee-foe
fight:
  continuous
  rate: attack-rate
  target: health
  ability: attack
  dr: dr
bite:
  retaliates
  rate: attack-rate
  target: health
  ability: attack
  dr: dr

# entity giant-rat
type: melee-foe
stats: attack 4, dr 2, max-health 1000, attack-rate 16
fight:
  give: 1 rat-tail

// The same foe minus its answer: dropping the inherited retaliation is what
// makes this one a punchbag rather than a second rat.
# entity punchbag
type: melee-foe
stats: max-health 24, dr 0
-bite:
`;

function loaded(): Registry {
  return loadModule(MODULE);
}

function fighting(registry: Registry, entityId = 'giant-rat', label = 'fight'): GameState {
  const state = createGameState('den');
  initResources(state, registry);
  armAction('entity', entityId, label, registry, state);
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
    expect(ratOf(state).resources.health).toBe(toMilliUnits(1000 - 5 * 8));
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

  it('stands a fresh target up with a restarted clock, not the dead one half-swing', () => {
    const registry = loaded();
    const state = fighting(registry, 'punchbag');
    // 24 hp at 10 a hit: three swings, so the fight turns over at t=7.2.
    resolve(state, registry, secondsToMs(8));

    expect(state.inventory['rat-tail']).toBeUndefined();
    expect(state.activeAction!.actors!['punchbag'].resources.health).toBe(toMilliUnits(24)); // refilled
    expect(playerClock(state).attemptsMade).toBe(0);
  });

  it('keeps a retaliation out of the player choice list', () => {
    const registry = loaded();
    const session = startSession(registry);
    const labels = view(session).choices.map((choice) => choice.label);

    expect(labels).toContain('fight');
    expect(labels).not.toContain('bite'); // the rat's move, never the player's
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
      'max-health': point(1000),
      'attack-rate': point(16),
    });
    expect(registry.entities.get('giant-rat')!.actions.find((a) => a.label === 'bite')!.retaliates).toBe(true);
  });

  it('rejects a retaliation with nothing to hit', () => {
    expect(() => loadModule('# entity ghost\nwail:\n  retaliates\n  time: 60\n')).toThrow(/requires a target: pool/);
  });

  it('rejects a second retaliation instead of leaving it dead', () => {
    expect(() => loadModule(`${MODULE}\n# entity giant-rat\nclaw:\n  retaliates\n  time: 60\n  target: health\n`)).toThrow(
      /retaliating action "claw" conflicts with "bite"; only one retaliates action is supported/,
    );
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

    expect(attemptDuration(action(registry, 'giant-rat', 'fight'), state, registry)).toBe(secondsToMs(2.4));
    expect(attemptDuration(action(registry, 'giant-rat', 'bite'), state, registry, 'giant-rat')).toBe(secondsToMs(3.75));

    state.activeBuffs['haste:attack-rate'] = { statId: 'attack-rate', amount: 0.25, kind: 'increased', expiresAt: secondsToMs(60) };
    expect(attemptDuration(action(registry, 'giant-rat', 'fight'), state, registry)).toBe(secondsToMs(1.92));
  });

  it('takes a flat per-minute literal, where 15 is the 4s the oven used to write as time: 4', () => {
    const source = ['# item chestnut', 'examine: Warm.', '# entity oven', 'roast:', '  continuous', '  rate: 15', '  give: 1 chestnut', '# entity slow-oven', 'roast:', '  continuous', '  time: 4', '  give: 1 chestnut'].join('\n');
    const registry = loadModule(source);
    const state = createGameState();

    expect(attemptDuration(action(registry, 'oven', 'roast'), state, registry)).toBe(secondsToMs(4));
    expect(attemptDuration(action(registry, 'slow-oven', 'roast'), state, registry)).toBe(secondsToMs(4));
  });
});
