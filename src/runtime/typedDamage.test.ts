import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/load';
import { armFightAction, createGameState, encounterView, initResources, resolve, statValue } from './runtime';
import { secondsToMs } from './units';

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

# entity plated-dummy
faction: world
stats: max-health 1000, defense 30

# entity clay-plated-dummy
faction: world
stats: max-health 1000, fire-resistance 50, defense 30

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
entities: dummy, clay-dummy, oiled-dummy, glazed-dummy, kiln-dummy, plated-dummy, clay-plated-dummy
`;

const arena = (playerStats: string): string => `${ARENA}
# entity player
faction: player
stats: max-health 1000, attack 0, accuracy 100000, attack-rate 60, ${playerStats}
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

describe('a dealt type lands, and a resistance takes its share', () => {
  it('deals the stat that declares the type, on top of the untyped contest', () => {
    expect(oneSwingAt(arena('fire-damage 100'), 'dummy')).toBeCloseTo(100, 0);
  });

  it('takes the resisting stat off as a share, and a negative share adds', () => {
    expect(oneSwingAt(arena('fire-damage 100'), 'clay-dummy')).toBeCloseTo(50, 0);
    expect(oneSwingAt(arena('fire-damage 100'), 'oiled-dummy')).toBeCloseTo(150, 0);
  });

  it('deals nothing typed where the action names no damage contest, and nothing where no stat deals a type', () => {
    expect(oneSwingAt(arena('cold-damage 0'), 'dummy')).toBeLessThan(1);
  });

  it('takes the flat reduction off the whole blow, typed damage included', () => {
    expect(oneSwingAt(arena('fire-damage 100'), 'plated-dummy')).toBeCloseTo(70, 0);
  });

  it('resists the type first and reduces what is left, so the two mitigations compound rather than one hiding the other', () => {
    expect(oneSwingAt(arena('fire-damage 100'), 'clay-plated-dummy')).toBeCloseTo(20, 0);
  });
});

describe('a resistance reads no higher than the stat that caps it', () => {
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

describe('a conversion moves damage between types before it is resisted', () => {
  it('moves the converting stat percent of the source type into the target type, and each is then resisted as itself', () => {
    expect(oneSwingAt(arena('fire-damage 100, fire-to-cold 50'), 'clay-dummy')).toBeCloseTo(75, 0);
    expect(oneSwingAt(arena('fire-damage 100, fire-to-cold 50'), 'dummy')).toBeCloseTo(100, 0);
  });

  it('shares the whole of a type among conversions that together ask for more than it', () => {
    expect(oneSwingAt(arena('fire-damage 100, fire-to-cold 250'), 'clay-dummy')).toBeCloseTo(100, 0);
  });
});
