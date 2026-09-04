import { describe, expect, it } from 'vitest';
import { loadModule } from '../../src/content/load';
import type { Registry } from '../../src/content/registry';
import { fairAt, fightersIn, ladderedStatsFor, readingAt, type Fighter, type LadderedStats } from './foeTier';
import { activitiesIn } from './tiers';
import { tierState } from '../tier-build';

const WORLD = `
# info arena
version: 1.0.0
pack: fixture

# damage-type physical

# stat attack
base: 0

# stat defense

# stat accuracy
base: 100

# stat evasion

# stat attack-rate
base: 60

# stat max-health

# stat regeneration

# stat blade
deals: physical

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
stat: blade

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

# entity untagged-thing
title: Untagged Thing
faction: world
stats: max-health 100, attack 2, accuracy 100, evasion 0, defense 0, attack-rate 60
uses: melee

# entity player
faction: player
stats: max-health 30, attack 0, accuracy 100, evasion 0, defense 0, attack-rate 60
uses: melee

# location yard
x: 0, y: 0
starting
entities: straw-man, boulder, untagged-thing
`;

const registry: Registry = loadModule(WORLD);
const activity = activitiesIn(registry)[0]!;
const stood = tierState(registry, activity, 1);
const fighters = fightersIn(registry);
const named = (id: string): Fighter => fighters.find((each) => each.entity.id.endsWith(id))!;
const laddered = (fighter: Fighter): LadderedStats => ladderedStatsFor(registry, activity, fighter.fight)!;

describe('what a fight is made of, read off the action rather than named here', () => {
  it('takes every stat in the contest off the action the foe uses', () => {
    const shape = named('straw-man').fight;
    expect(shape).toEqual({
      rate: 'arena.attack-rate',
      accuracy: { ours: 'arena.accuracy', theirs: 'arena.evasion' },
      damage: { ours: 'arena.attack', theirs: 'arena.defense' },
      pool: 'arena.health',
    });
  });

  it('finds what opposes the player and not the player, however many things use the action', () => {
    const found = fighters.map((each) => each.entity.id);
    expect(found).toContain('arena.straw-man');
    expect(found).not.toContain('arena.player');
  });

  it('reads the laddered stats off the skills rather than off a list, dealt one and pooled one', () => {
    expect(laddered(named('straw-man'))).toEqual({ dealt: 'arena.blade', pooled: 'arena.max-health' });
  });
});

describe('a foe read against the tier it names', () => {
  it('falls faster the higher the player stands, since the ladder gives them more to hit with', () => {
    const straw = named('straw-man');
    const low = readingAt(registry, stood, straw, laddered(straw), 5);
    const high = readingAt(registry, stood, straw, laddered(straw), 25);
    expect(high.secondsToFell).toBeLessThan(low.secondsToFell);
    expect(high.damageShare).toBeLessThan(low.damageShare);
  });

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

  it('leaves a body that names no tier out of the reading rather than guessing one for it', () => {
    expect(named('untagged-thing').tier).toBeUndefined();
  });
});
