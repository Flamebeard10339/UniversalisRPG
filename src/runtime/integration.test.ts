import { clearBuffs } from './buffs';
import { readdirSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { buffsOf, createGameState, GameState, grantBuff, PLAYER, resolve, sampleStat, statRange, statValue, useFight } from './runtime';
import { restorePools } from './effects';
import { isPoint } from '../grammar/range';
import { populationCount } from '../content/sections/location';
import { Registry } from '../content/registry';
import { engineLocale, withEngineLocale } from '../content/engineLocale';
import { ownedSectionKinds } from '../content/sections';
import { MEMBER_KINDS } from '../content/namespace';
import { loadUniverse } from '../content/load';
import { moduleSource, shippedSources, standingSources } from '../content/shipped';
import { runTest } from './session';
import { initialState } from './save';
import { secondsToMs, toMilliUnits } from './units';

const source = moduleSource('core').text;
// The smallest shipped world with somewhere to stand, derived rather than listed, with core's own
// text swapped for whatever a caller is perturbing: a module split moves with no edit here.
const island = (text: string) => loadUniverse([engineLocale(), ...standingSources().map((each) => (each.name === 'core' ? { name: 'core', text } : each))]);
const registry = island(source);

const shipped = loadUniverse(withEngineLocale(shippedSources()));

describe('core content', () => {
  it('loads identically from a CRLF checkout, with or without a BOM', () => {
    const crlf = source.replace(/\n/g, '\r\n');
    for (const text of [crlf, `\uFEFF${crlf}`]) {
      const loaded = island(text);
      expect([...loaded.locations.keys()]).toEqual([...registry.locations.keys()]);
      expect([...loaded.tests.keys()]).toEqual([...registry.tests.keys()]);
    }
  });

  it('loads the expected kinds', () => {
    expect(registry.entities.size).toBeGreaterThan(0);
    expect(registry.dialogues.size).toBeGreaterThan(0);
    expect(registry.tests.size).toBeGreaterThan(0);
  });

});

describe('shipped content', () => {
  it('assembles every module in content/ into one universe', () => {
    expect(shipped.tests.size).toBeGreaterThanOrEqual(registry.tests.size);
  });

  for (const id of shipped.tests.keys()) {
    it(`test "${id}" passes`, () => {
      expect(runTest(id, shipped, createGameState())).toEqual({ passed: true });
    });
  }
});

// A swing is spent out of the range its swinger stands at, so a shipped actor that writes a range
// hits for a different number every time. The subjects are the corpus's own — the player among
// them, on the same footing as anything it fights, which is the point of writing the spread on a
// sheet. What an actor stands at is its sheet folded with what it carries, so it is asked for
// rather than assumed: a foe carrying nothing stands where it wrote, and the player stands a melee
// level above. That the fight path spends the range rather than its midpoint is proved on a
// fixture in encounter.test.ts.
describe("a shipped actor's swing is spent out of the range it stands at", () => {
  const ATTACK = 'core.attack';
  const ranged = [...shipped.entities.values()].filter((entity) => entity.stats[ATTACK] !== undefined && !isPoint(entity.stats[ATTACK]));

  it('is written by more than one of them, so neither side of a fight carries this alone', () => {
    expect(ranged.length).toBeGreaterThan(1);
  });

  for (const entity of ranged) {
    it(`${entity.id} reads a different number swing to swing, inside what it stands at`, () => {
      const state = createGameState();
      const standing = statRange(ATTACK, state, shipped, entity.id);
      const swings = Array.from({ length: 8 }, () => sampleStat(ATTACK, state, shipped, entity.id));

      for (const swing of swings) expect(swing).toBeGreaterThanOrEqual(standing.min);
      for (const swing of swings) expect(swing).toBeLessThanOrEqual(standing.max);
      expect(new Set(swings).size).toBeGreaterThan(1);
    });
  }
});

describe('the archetype jewels, read off the routes tulsa ships', () => {
  const POST = 'tulsa.proving-post';

  const played = (testId: string): GameState => {
    const state = createGameState();
    expect(runTest(testId, shipped, state)).toEqual({ passed: true });
    return state;
  };

  const sheet = (state: GameState, registry: Registry, actorId?: string): Record<string, number> =>
    Object.fromEntries([...registry.stats.keys()].map((statId) => [statId, statValue(statId, state, registry, actorId)]));

  it('moves attack as rage accumulates, and moves nothing else at all', () => {
    const state = played('tulsa.rage-rises-as-swings-land');
    // Where the route left the pool is the route's own `assert:` to say. What is needed here is
    // only that it left one, and the readings below are taken at the ceiling the jewel grants.
    expect(state.resources['combat-expansion.rage']).toBeGreaterThan(0);
    const ceiling = toMilliUnits(statValue('combat-expansion.max-rage', state, shipped));

    restorePools(state, { 'combat-expansion.rage': ceiling });
    const full = sheet(state, shipped);

    restorePools(state, { 'combat-expansion.rage': 0 });
    const empty = sheet(state, shipped);

    const moved = [...shipped.stats.keys()].filter((statId) => full[statId] !== empty[statId]);
    expect(moved).toEqual(['core.attack']);

    restorePools(state, { 'combat-expansion.rage': ceiling / 2 });
    const half = sheet(state, shipped);
    expect(half['core.attack'] - empty['core.attack']).toBeCloseTo(full['core.attack'] - half['core.attack'], 10);
  });

  it('separates what a stack pays from what the count is worth', () => {
    const reading = (testId: string, stacks: number): number => {
      const state = played(testId);
      clearBuffs(state, [PLAYER]);
      const bare = statValue('core.attack-rate', state, shipped);
      const vigor = shipped.items.get('combat-expansion.accelerated-vigor')!;
      for (let held = 0; held < stacks; held += 1) grantBuff(state, PLAYER, vigor, state.time + secondsToMs(60));
      return statValue('core.attack-rate', state, shipped) - bare;
    };

    expect(reading('tulsa.rage-rises-as-swings-land', 5)).toBeCloseTo(10, 10);
    expect(reading('tulsa.rage-rises-as-swings-land', 1)).toBeCloseTo(2, 10);

    const one = reading('tulsa.accelerated-vigor-stacks-behind-its-gate', 1);
    const five = reading('tulsa.accelerated-vigor-stacks-behind-its-gate', 5);
    expect(one).toBeGreaterThan(2);
    expect(five).toBeGreaterThan(5 * one);
  });

  it('holds poison on the struck party and on nobody else, and makes its pool fall', () => {
    const poisoned = played('tulsa.poison-holds-the-struck-enemy');
    const clean = played('tulsa.poison-holds-the-struck-enemy');
    clearBuffs(clean, [POST]);

    expect(buffsOf(poisoned, POST).map((buff) => buff.source)).toEqual(['combat-expansion.venom']);
    expect(buffsOf(poisoned, PLAYER)).toEqual([]);
    const regeneration = (each: GameState): number => statValue('core.regeneration', each, shipped, POST);
    expect(regeneration(poisoned) - regeneration(clean)).toBe(-30);

    const health = (each: GameState): number => each.activeAction!.actors![POST].resources['core.health'];
    const before = health(clean);
    expect(health(poisoned)).toBe(before);

    resolve(poisoned, shipped, poisoned.time + secondsToMs(4));
    resolve(clean, shipped, clean.time + secondsToMs(4));
    expect(before - health(poisoned)).toBeGreaterThan(before - health(clean));
  });

  it('lifts the debuff on its own clock, with nothing else asked to end it', () => {
    expect(buffsOf(played('tulsa.poison-lifts-when-its-own-duration-runs-out'), POST)).toEqual([]);
  });

  it('costs a striker what the thorned enemy it struck carries', () => {
    const state = played('tulsa.striking-a-thorned-enemy-costs-the-striker');
    const attempts = state.activeAction!.cadences![PLAYER].attemptsMade;
    const struck = state.resources['core.health'];

    expect(shipped.entities.get('tulsa.spined-urchin')!.blocks).toEqual([]);

    // The pool fell by what thorns took net of what regeneration gave back, so the same span is run
    // again with nothing to fight, opened where the fight left off: what it gains is what to add back.
    const idle = initialState(shipped);
    const opening = idle.resources['core.health'];
    restorePools(idle, { 'core.health': struck });
    resolve(idle, shipped, idle.time + (state.time - idle.time));
    const regenerated = idle.resources['core.health'] - struck;

    expect(opening + regenerated - struck).toBe(toMilliUnits(5) * attempts);
  });
});

const jewelsOf = (registry: Registry, namespace: string) => [...registry.clusterJewels.values()].filter((jewel) => jewel.id.startsWith(`${namespace}.`));

const unsharedTagsOn = (registry: Registry, namespace: string, jewel: { positions: Record<number, string> }): string[] => {
  const shared = new Set(
    [...registry.passives.values()].filter((passive) => !passive.id.startsWith(`${namespace}.`)).flatMap((passive) => passive.tags.filter((tag) => tag.kind === 'keyword').map((tag) => tag.value)),
  );
  const carried = Object.values(jewel.positions).flatMap((passiveId) => registry.passives.get(passiveId)?.tags ?? []);
  return [...new Set(carried.filter((tag) => tag.kind === 'keyword' && !shared.has(tag.value)).map((tag) => (tag as { value: string }).value))];
};

function archetypeGrouping(registry: Registry, namespace: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  for (const jewel of jewelsOf(registry, namespace)) for (const tag of unsharedTagsOn(registry, namespace, jewel)) seen.set(tag, [...(seen.get(tag) ?? []), jewel.id]);
  return new Map([...seen.entries()].filter(([, carriers]) => carriers.length > 1));
}

describe('the archetype jewels are paired added-then-increased', () => {
  const declared = jewelsOf;

  const channels = (registry: Registry, jewel: { positions: Record<number, string> }): { flat: number; percent: number } => {
    const payloads = Object.values(jewel.positions).flatMap((passiveId) => registry.passives.get(passiveId)?.tags ?? []);
    const bonuses = payloads.filter((tag) => tag.kind === 'stat-bonus');
    return { flat: bonuses.filter((tag) => !tag.percent).length, percent: bonuses.filter((tag) => tag.percent).length };
  };

  it('gives every archetype one flat jewel and one percent jewel, and no archetype two of a kind', () => {
    const jewels = declared(shipped, 'combat-expansion');
    const groups = archetypeGrouping(shipped, 'combat-expansion');
    expect(groups.size).toBeGreaterThan(0);
    expect([...groups.values()].flat().sort()).toEqual(jewels.map((jewel) => jewel.id).sort());

    for (const [archetype, carriers] of groups) {
      const led = carriers.map((id) => {
        const worth = channels(shipped, shipped.clusterJewels.get(id)!);
        expect(worth.flat + worth.percent).toBeGreaterThan(0);
        return worth.percent > worth.flat ? 'increased' : 'added';
      });
      expect({ archetype, led: [...led].sort() }).toEqual({ archetype, led: ['added', 'increased'] });
    }
  });
});

describe('no shipped identifier is named after this content', () => {
  const declaredIds = (registry: Registry, namespace: string): Set<string> => {
    const own = new Set<string>();
    for (const kind of [...ownedSectionKinds(), ...MEMBER_KINDS]) {
      for (const key of registry.namespace.declaredKeys(kind)) {
        if (!key.startsWith(`${namespace}.`)) continue;
        const id = key.slice(namespace.length + 1);
        if (!id.includes('.')) own.add(id);
      }
    }
    return own;
  };

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(full);
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) return [];
      return /\.test\.tsx?$/.test(entry.name) ? [] : [full];
    });

  const sweep = (words: readonly string[]): string[] => {
    const camel = (word: string): string => word.replace(/-(.)/g, (_, letter: string) => letter.toUpperCase());
    const patterns = words.flatMap((word) => [word, camel(word)]).map((token) => new RegExp(`\\b${token}\\b`, 'i'));
    return sourceFiles('src').flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return patterns.filter((pattern) => pattern.test(text)).map((pattern) => `${file}: ${pattern.source}`);
    });
  };

  it('sweeps every file the build carries, of either extension', () => {
    const swept = sourceFiles('src');
    expect(swept.filter((file) => file.endsWith('.tsx')).length).toBeGreaterThan(0);
    expect(swept.some((file) => file.endsWith('.test.ts'))).toBe(false);
  });

  it('finds no id this module declares', () => {
    const mine = declaredIds(shipped, 'combat-expansion');
    const shared = declaredIds(shipped, 'core');
    const named = [...mine].filter((word) => !shared.has(word));
    expect(named.length).toBeGreaterThan(20);
    expect(sweep(named)).toEqual([]);
  });

  it('finds no archetype, which is a tag and never an id', () => {
    const archetypes = [...archetypeGrouping(shipped, 'combat-expansion').keys()];
    expect(archetypes.length).toBeGreaterThan(1);
    expect(sweep(archetypes)).toEqual([]);
  });

  it('finds none of the four effects the clause names either', () => {
    expect(sweep(['poison', 'rage', 'thorns', 'accelerated-vigor', 'accelerated vigour'])).toEqual([]);
  });
});

describe('core health resource (Pass 2 end-to-end)', () => {
  const cellarRats = registry.locations.get('first-steps.basement')!.entities.find((each) => each.entity === 'first-steps.giant-rat')!;

  it('starts full, drains as the rat bites back, then regenerates from a meal as time passes', () => {
    const state = initialState(registry);
    const full = state.resources['core.health'];
    // A pool starts at its own ceiling, and the ceiling is the stat the resource names rather than
    // a number written here: what the player's sheet and their level of Health come to is the
    // balance's business and moves without this file.
    expect(full).toBe(toMilliUnits(statValue('core.max-health', state, registry)));

    state.location = 'first-steps.basement';
    useFight('core.melee-combat', 'first-steps.giant-rat', registry, state);
    expect(state.time).toBeGreaterThan(0);

    resolve(state, registry, secondsToMs(120));
    const afterFighting = state.resources['core.health'];
    // Melee is continuous, so a Fight re-arms on the next rat still standing and the cellar empties
    // rather than stopping at the first. Two minutes is longer than any sheet would make that take.
    expect(state.flags['first-steps.rats-killed']).toBe(populationCount(cellarRats));
    expect(afterFighting).toBeLessThan(full);
    expect(state.log.some((line) => line.startsWith('The Giant Rat hits you for '))).toBe(true);
    expect(state.log.some((line) => line.startsWith('You hit the Giant Rat for '))).toBe(true);

    const unfed = statValue('core.regeneration', state, registry);
    grantBuff(state, PLAYER, registry.items.get('core.cooked-shrimp')!, state.time + secondsToMs(60));
    const fed = statValue('core.regeneration', state, registry);
    expect(fed).toBeGreaterThan(unfed);

    resolve(state, registry, state.time + secondsToMs(60));
    expect(state.resources['core.health']).toBe(Math.min(full, afterFighting + toMilliUnits(fed)));
  });
});
