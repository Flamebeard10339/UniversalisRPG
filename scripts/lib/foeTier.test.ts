import { describe, expect, it } from 'vitest';
import { loadModule } from '../../src/content/load';
import type { Registry } from '../../src/content/registry';
import { ladderedFor, referencePlayer, type Fighter, type LadderedStats } from '../../src/runtime/foeTier';
import { fairAt, fightersIn, shapeDisagrees, shapeOf, unwrittenFactors } from './foeTier';

const WORLD = `
# info arena
version: 1.0.0
pack: fixture

# damage-type physical

# stat attack
base: 0
deals: physical

# stat defense

# stat accuracy
base: 100

# stat evasion
base: 20

# stat attack-rate
base: 60

# stat max-health

# stat regeneration

# stat ward
resists: physical

# resource health
rate: regeneration
max: max-health

# event death
resource: health
trigger: on empty

# skill striking
title: Striking
stat: attack

# skill enduring
title: Enduring
stat: max-health

# faction world

# faction player

# action melee
title: Fight
continuous
rate: us.attack-rate
accuracy: us.accuracy vs them.evasion
damage: us.attack vs them.defense
depletes: them.health

# profile quickfoot
rate: 2
pool: 0.5

# profile leaden
damage: 2
reduction: 1.5

# tier quick
seconds to fell: 7
damage share: 0.8

# tier slow
seconds to fell: 30
damage share: 1.4

# entity straw-man
title: Straw Man
faction: world
stats: max-health 100, attack 2, accuracy 100, evasion 0, defense 0, attack-rate 60
tier: quick
uses: melee

# entity boulder
title: Boulder
faction: world
stats: max-health 100000, attack 2, accuracy 100, evasion 0, defense 0, attack-rate 60
tier: quick
uses: melee

# entity swift-thing
title: Swift Thing
faction: world
stats: max-health 100, attack 2, accuracy 100, evasion 0, defense 0, attack-rate 120
tier: quick
profile: quickfoot
level: 9
uses: melee

# entity untagged-thing
title: Untagged Thing
faction: world
stats: max-health 100, attack 2, accuracy 100, evasion 0, defense 0, attack-rate 60
uses: melee

# entity player
faction: player
stats: max-health 30, attack 0, accuracy 100, evasion 20, defense 0, attack-rate 60
uses: melee

# location yard
x: 0, y: 0
starting
entities: straw-man, boulder, untagged-thing, swift-thing
`;

const registry: Registry = loadModule(WORLD);
const stood = referencePlayer(registry);
const fighters = fightersIn(registry);
const named = (id: string): Fighter => fighters.find((each) => each.entity.id.endsWith(id))!;
const laddered = (fighter: Fighter): LadderedStats => ladderedFor(registry, fighter.fight)!;

describe('what the audit finds to read', () => {
  it('finds what opposes the player and not the player, however many things use the action', () => {
    const found = fighters.map((each) => each.entity.id);
    expect(found).toContain('arena.straw-man');
    expect(found).not.toContain('arena.player');
  });

  it('leaves a body that names no tier out of the reading rather than guessing one for it', () => {
    expect(named('untagged-thing').tier).toBeUndefined();
  });

  it('carries the level a body names, so it is read there rather than solved for', () => {
    expect(named('swift-thing').level).toBe(9);
    expect(named('straw-man').level).toBeUndefined();
  });
});

describe('the level at which a body that names none comes true', () => {
  it('names the level at which each half of the tier comes true', () => {
    const straw = named('straw-man');
    const fair = fairAt(registry, stood, straw, laddered(straw), registry.tiers.get('quick')!, 30);
    expect(fair.toughness).toBeDefined();
    expect(fair.damage).toBeDefined();
  });

  it('puts a body with far too much health out of reach on the half that measures health, and not on the other', () => {
    const boulder = named('boulder');
    const quick = registry.tiers.get('quick')!;
    const fair = fairAt(registry, stood, boulder, laddered(boulder), quick, 30);
    expect(fair.toughness, 'a boulder should never fell in seven seconds anywhere on the ladder').toBeUndefined();
    expect(fair.damage, 'its damage is ordinary, so that half should still land').toBeDefined();
  });

  it('reads a tougher tier as felling later than a slighter one, for the very same body', () => {
    const straw = named('straw-man');
    const asQuick = fairAt(registry, stood, straw, laddered(straw), registry.tiers.get('quick')!, 30);
    const asSlow = fairAt(registry, stood, straw, laddered(straw), registry.tiers.get('slow')!, 30);
    expect(asSlow.toughness!).toBeLessThan(asQuick.toughness!);
  });
});

describe('a body read against the shape it says it fights in', () => {
  it('reads back every factor the profile wrote, and stays silent about the two it solved', () => {
    const swift = named('swift-thing');
    const profile = swift.profile!;
    const read = shapeOf(registry, stood, swift).map((each) => each.factor);
    expect(read.sort()).toEqual(
      Object.keys(profile)
        .filter((key) => key !== 'id' && profile[key as keyof typeof profile] !== undefined)
        .sort(),
    );
    expect(read).not.toContain(unwrittenFactors(profile)[0]);
  });

  it('says nothing about a body that names no profile, rather than holding it to a default one', () => {
    expect(shapeOf(registry, stood, named('untagged-thing'))).toEqual([]);
  });

  it('keeps quiet where the body is cut in the shape it names, and speaks where it is not', () => {
    const swift = named('swift-thing');
    const swinging = shapeOf(registry, stood, swift).find((each) => each.factor === 'rate')!;
    expect(swinging.read, 'it swings at 120 against a player at 60, so it reads as the 2x it claims').toBeCloseTo(2, 6);
    expect(shapeDisagrees([swinging])).toEqual([]);
    expect(shapeDisagrees([{ factor: 'rate', said: 2, read: 0.2 }])).toHaveLength(1);
  });
});
