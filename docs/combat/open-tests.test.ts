import { describe, expect, it } from 'vitest';
import { loadModule } from '../../src/content/load';
import { armFightAction, createGameState, encounterView, initResources, resolve, statValue } from '../../src/runtime/runtime';
import { startSession, view, walkTest } from '../../src/runtime/session';
import { parseDirectiveLine } from '../../src/content/sections/test';
import { secondsToMs } from '../../src/runtime/units';

const ARENA = `
# stat attack
base: 0

# stat defense

# stat accuracy
base: 100000

# stat evasion

# stat attack-rate
base: 60

# stat max-health
base: 1000

# stat regeneration

# resource health
rate: regeneration
max: max-health

# event death
resource: health
trigger: on empty

# faction world

# faction player

# damage-type fire

# damage-type cold

# stat fire-damage
deals: fire

# stat cold-damage
deals: cold

# stat fire-resistance
resists: fire
at most: max-fire-resistance

# stat max-fire-resistance
base: 75
at most: 90

# stat cold-resistance
resists: cold

# stat fire-to-cold
converts: fire to cold

# action swing
title: swing
rate: us.attack-rate
accuracy: us.accuracy vs them.evasion
damage: us.attack vs them.defense
depletes: them.health

# entity dummy
faction: world
stats: max-health 1000

# entity clay-dummy
faction: world
stats: max-health 1000, fire-resistance 50

# entity oiled-dummy
faction: world
stats: max-health 1000, fire-resistance -50

# entity glazed-dummy
faction: world
stats: max-health 1000, fire-resistance 200

# entity kiln-dummy
faction: world
stats: max-health 1000, fire-resistance 200, max-fire-resistance 200

# location yard
x: 0, y: 0
starting
entities: dummy, clay-dummy, oiled-dummy, glazed-dummy, kiln-dummy
`;

const arena = (playerStats: string): string => `${ARENA}
# entity player
faction: player
stats: max-health 1000, ${playerStats}
uses: swing
`;

function oneSwingAt(source: string, target: string): number {
  const registry = loadModule(source);
  const state = createGameState('yard');
  initResources(state, registry);
  armFightAction('swing', target, registry, state);
  resolve(state, registry, secondsToMs(1.5));
  const foe = encounterView(state, registry)?.foes.find((each) => each.id === target);
  expect(foe, `${target} was never struck`).toBeDefined();
  return 1000 - foe!.current;
}

describe('a-dealt-type-lands-and-a-resistance-takes-its-share', () => {
  it('deals the stat that declares the type, on top of the untyped contest', () => {
    expect(oneSwingAt(arena('fire-damage 100'), 'dummy')).toBeCloseTo(100, 0);
  });

  it('takes the resisting stat off as a share, and a negative share adds', () => {
    expect(oneSwingAt(arena('fire-damage 100'), 'clay-dummy')).toBeCloseTo(50, 0);
    expect(oneSwingAt(arena('fire-damage 100'), 'oiled-dummy')).toBeCloseTo(150, 0);
  });
});

describe('a-resistance-reads-no-higher-than-the-stat-that-caps-it', () => {
  it('reads the resistance at its cap, and the cap at its own', () => {
    const registry = loadModule(arena('fire-damage 100'));
    const state = createGameState('yard');
    initResources(state, registry);
    expect(statValue('fire-resistance', state, registry, 'glazed-dummy')).toBe(75);
    expect(statValue('max-fire-resistance', state, registry, 'kiln-dummy')).toBe(90);
    expect(statValue('fire-resistance', state, registry, 'kiln-dummy')).toBe(90);
  });

  it('lands what the capped share leaves', () => {
    expect(oneSwingAt(arena('fire-damage 100'), 'glazed-dummy')).toBeCloseTo(25, 0);
    expect(oneSwingAt(arena('fire-damage 100'), 'kiln-dummy')).toBeCloseTo(10, 0);
  });
});

describe('a-conversion-moves-damage-between-types-before-it-is-resisted', () => {
  it('moves the converting stat percent of the source type into the target type, and each is then resisted as itself', () => {
    expect(oneSwingAt(arena('fire-damage 100, fire-to-cold 50'), 'clay-dummy')).toBeCloseTo(75, 0);
    expect(oneSwingAt(arena('fire-damage 100, fire-to-cold 50'), 'dummy')).toBeCloseTo(100, 0);
  });
});

describe('a-conversion-cycle-is-refused-at-load', () => {
  it('refuses two stats that convert each other, naming both', () => {
    expect(() =>
      loadModule(`${arena('fire-damage 100')}
# stat cold-to-fire
converts: cold to fire
`),
    ).toThrow(/fire-to-cold[\s\S]*cold-to-fire|cold-to-fire[\s\S]*fire-to-cold/);
  });

  it('refuses a stat that converts a type to itself', () => {
    expect(() =>
      loadModule(`${arena('fire-damage 100')}
# stat fire-to-fire
converts: fire to fire
`),
    ).toThrow(/fire-to-fire/);
  });
});

describe('a-cap-cycle-is-refused-at-load', () => {
  it('refuses two stats that cap each other, naming both', () => {
    expect(() =>
      loadModule(`${ARENA}
# stat heat
at most: warmth

# stat warmth
at most: heat

# entity player
faction: player
stats: max-health 1000
uses: swing
`),
    ).toThrow(/heat[\s\S]*warmth|warmth[\s\S]*heat/);
  });

  it('refuses a stat that caps itself', () => {
    expect(() =>
      loadModule(`${ARENA}
# stat heat
at most: heat

# entity player
faction: player
stats: max-health 1000
uses: swing
`),
    ).toThrow(/heat/);
  });
});

const TIDEPOOL = `
# stat attack
base: 1

# stat defense

# stat accuracy
base: 100000

# stat evasion

# stat attack-rate
base: 60

# stat max-health
base: 10

# stat regeneration

# resource health
rate: regeneration
max: max-health

# event death
resource: health
trigger: on empty

# faction world

# faction player

# action swing
title: swing
rate: us.attack-rate
accuracy: us.accuracy vs them.evasion
damage: us.attack vs them.defense
depletes: them.health

# entity player
faction: player
stats: max-health 10
uses: swing
on death:
  restore: health
  perform: faint
faint:
  title: You come round
  time: 5
  say: The ground is cold, and then it is not the same ground.
  on success:
    relocate: starting-location

# entity limpet
faction: world
stats: max-health 1000, attack 1000
uses: swing
aggressive
respawn after: 2s

# location shore
x: 0, y: 0
starting
title: Shore

# location tidepool
x: 1, y: 0
title: Tidepool
entities: 3 limpet
`;

const steps = (...lines: string[]) => lines.map((line) => parseDirectiveLine(line)!);

describe('a-performed-action-cannot-be-called-off', () => {
  it('refuses cancel while the performed action runs, and takes it again once the action is over', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2', 'cancel', 'refused')).failure).toBeNull();
    expect(view(session).action, 'the faint went on running past the refused cancel').not.toBeNull();
  });
});

describe('a-performed-action-runs-its-success-when-its-time-is-up', () => {
  it('holds the player where they fell for its time, then runs its success', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2')).failure).toBeNull();
    expect(view(session).location.id).toBe('tidepool');
    expect(view(session).action?.label).toBe('You come round');
    expect(walkTest(session, steps('wait: 5')).failure).toBeNull();
    expect(view(session).location.id).toBe('shore');
    expect(view(session).action).toBeNull();
  });
});

describe('nothing-engages-a-player-while-a-performed-action-runs', () => {
  it('keeps the aggressive room off the player until the performed action has run out', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2', 'wait: 3')).failure).toBeNull();
    expect(view(session).encounter).toBeNull();
    expect(view(session).action?.label).toBe('You come round');
    expect(view(session).location.id).toBe('tidepool');
  });
});
