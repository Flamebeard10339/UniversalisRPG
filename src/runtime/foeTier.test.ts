import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/load';
import type { Registry } from '../content/registry';
import { midpoint } from '../grammar/range';
import { fightOf, ladderedFor, readingAt, referencePlayer, solvedStatsOf, type Fighter, type LadderedStats } from './foeTier';
import { perHitFor } from './foeSolve';
import { dpsAtLevel } from './pace';
import { statValue } from './stats';
import { minDamage } from './tuning';

const ARENA = `
# info arena
version: 1.0.0
pack: fixture

# damage-type physical

# stat attack
base: 0
deals: physical

# stat defense
base: 4

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

# profile even
rate: 1
pool: 1

# profile quickfoot
rate: 2
pool: 0.5
evasion: 1.4

# profile leaden
damage: 2
reduction: 1.5
accuracy: 0.8

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

# entity untagged-thing
title: Untagged Thing
faction: world
stats: max-health 100, attack 2, accuracy 100, evasion 0, defense 0, attack-rate 60
uses: melee

# entity player
faction: player
stats: max-health 30, attack 0, accuracy 100, evasion 20, defense 4, attack-rate 60
uses: melee

# location yard
x: 0, y: 0
starting
entities: straw-man, untagged-thing
`;

const declared: Registry = loadModule(ARENA);

const LEVELS = [60, 80, 100];

const shaped = (tierId: string, profileId: string, level: number): string => `${tierId}-${profileId}-${String(level)}`;

const cut = [...declared.tiers.keys()].flatMap((tierId) => [...declared.profiles.keys()].flatMap((profileId) => LEVELS.map((level) => ({ tierId, profileId, level }))));

const WORLD = [
  ARENA,
  ...cut.map(({ tierId, profileId, level }) =>
    [`# entity ${shaped(tierId, profileId, level)}`, 'title: A Cut Body', 'faction: world', `tier: ${tierId.split('.').pop()!}`, `profile: ${profileId.split('.').pop()!}`, `level: ${String(level)}`, 'uses: melee'].join('\n'),
  ),
].join('\n\n');

const registry: Registry = loadModule(WORLD);
const stood = referencePlayer(registry);

const fighterFor = (id: string): Fighter => {
  const entity = registry.entities.get(`arena.${id}`)!;
  return {
    entity,
    fight: fightOf(registry, entity)!,
    tier: entity.tier === undefined ? undefined : registry.tiers.get(entity.tier),
    profile: entity.profile === undefined ? undefined : registry.profiles.get(entity.profile),
    level: entity.level,
  };
};

const laddered = (fighter: Fighter): LadderedStats => ladderedFor(registry, fighter.fight)!;

describe('what a fight is made of, read off the action rather than named here', () => {
  it('takes every stat in the contest off the action the foe uses', () => {
    expect(fighterFor('straw-man').fight).toEqual({
      rate: 'arena.attack-rate',
      accuracy: { ours: 'arena.accuracy', theirs: 'arena.evasion' },
      damage: { ours: 'arena.attack', theirs: 'arena.defense' },
      pool: 'arena.health',
    });
  });

  it('reads the laddered stats off the same action, dealt one and pooled one', () => {
    expect(laddered(fighterFor('straw-man'))).toEqual({ dealt: 'arena.attack', pooled: 'arena.max-health' });
  });
});

describe('a foe read against the tier it names', () => {
  it('falls faster the higher the player stands, since the ladder gives them more to hit with', () => {
    const straw = fighterFor('straw-man');
    const low = readingAt(registry, stood, straw, laddered(straw), 5);
    const high = readingAt(registry, stood, straw, laddered(straw), 25);
    expect(high.secondsToFell).toBeLessThan(low.secondsToFell);
    expect(high.damageShare).toBeLessThan(low.damageShare);
  });
});

describe('three tags cut a body, and reading it back finds the tier they were cut against', () => {
  it.each(cut)('reads $tierId / $profileId at level $level back as exactly the tier it was cut against', ({ tierId, profileId, level }) => {
    const fighter = fighterFor(shaped(tierId, profileId, level));
    const back = readingAt(registry, stood, fighter, laddered(fighter), level);
    expect(back.secondsToFell).toBeCloseTo(fighter.tier!.secondsToFell, 6);
    expect(back.damageShare).toBeCloseTo(fighter.tier!.damageShare, 6);
  });

  it.each(cut)('cuts $tierId / $profileId at level $level in the shape its profile names, on every side the profile wrote', ({ tierId, profileId, level }) => {
    const fighter = fighterFor(shaped(tierId, profileId, level));
    const profile = fighter.profile!;
    const theirs = (statId: string): number => statValue(statId, stood, registry, fighter.entity.id);
    const ours = (statId: string): number => statValue(statId, stood, registry, 'player');
    const dealt = perHitFor(dpsAtLevel(level), ours(fighter.fight.rate), ours(fighter.fight.accuracy.ours), registry);
    expect(theirs(fighter.fight.accuracy.ours) / ours(fighter.fight.accuracy.ours)).toBeCloseTo(profile.accuracy, 6);
    expect(theirs(fighter.fight.accuracy.theirs) / ours(fighter.fight.accuracy.ours), 'evasion is read against the accuracy it is contested with, not against the player evasion it shares a name with').toBeCloseTo(profile.evasion, 6);
    if (profile.rate !== undefined) expect(theirs(fighter.fight.rate) / ours(fighter.fight.rate)).toBeCloseTo(profile.rate, 6);
    if (profile.reduction !== undefined) expect(theirs(fighter.fight.damage.theirs) / dealt, 'reduction is read against the damage it takes its cut of').toBeCloseTo(profile.reduction, 6);
  });

  it('leaves a body that writes its own stat alone, and solves only what it left unwritten', () => {
    const written = loadModule([WORLD, ['# entity quick-even-60', '+stats: max-health 12345'].join('\n')].join('\n\n'));
    const entity = written.entities.get('arena.quick-even-60')!;
    expect(midpoint(entity.stats['arena.max-health']!)).toBe(12345);
    expect(statValue("arena.max-health", referencePlayer(written), written, entity.id)).toBe(12345);
    expect(Object.keys(solvedStatsOf(written, entity)!)).toContain('arena.attack-rate');
  });

  it('lays a modifier over the solved number rather than in place of it', () => {
    const bare = fighterFor('quick-even-60');
    const solved = statValue(bare.fight.rate, stood, registry, bare.entity.id);
    const layered = loadModule([WORLD, ['# entity quick-even-60', 'modifiers: +10% attack-rate'].join('\n')].join('\n\n'));
    const entity = layered.entities.get('arena.quick-even-60')!;
    expect(statValue(bare.fight.rate, referencePlayer(layered), layered, entity.id)).toBeCloseTo(solved * 1.1, 6);
  });

  it('says nothing about a body that names no tier, and leaves its own numbers standing', () => {
    const idle = registry.entities.get('arena.untagged-thing')!;
    expect(solvedStatsOf(registry, idle)).toBeNull();
    expect(statValue('arena.max-health', stood, registry, idle.id)).toBe(100);
  });

  it('cannot cut a blow under the floor the engine puts on one, so low enough on the ladder a body reads over its tier however it is cut', () => {
    const under = 2;
    const world = loadModule([WORLD, ['# entity underfoot', 'title: Underfoot', 'faction: world', 'tier: quick', 'profile: even', `level: ${String(under)}`, 'uses: melee'].join('\n')].join('\n\n'));
    const entity = world.entities.get('arena.underfoot')!;
    const fight = fightOf(world, entity)!;
    const fighter: Fighter = { entity, fight, tier: world.tiers.get('quick'), profile: world.profiles.get('even'), level: under };
    const at = referencePlayer(world);
    const blow = statValue(fight.damage.ours, at, world, entity.id) - statValue(fight.damage.theirs, at, world, 'player');
    expect(blow, 'the tier asks for less than one point of damage a blow, which the engine will not deal').toBeLessThan(minDamage(world));
    expect(readingAt(world, at, fighter, ladderedFor(world, fight)!, under).damageShare).toBeGreaterThan(fighter.tier!.damageShare);
  });

  it('says nothing about a body that names a tier but no profile or level', () => {
    expect(solvedStatsOf(registry, registry.entities.get('arena.straw-man')!)).toBeNull();
  });
});

