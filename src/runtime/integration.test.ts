import { clearBuffs } from './buffs';
import { readdirSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { buffsOf, createGameState, GameState, grantBuff, PLAYER, resolve, statValue, useAction, useFight } from './runtime';
import { restorePools } from './effects';
import { Registry } from '../content/registry';
import { engineLocale, withEngineLocale } from '../content/engineLocale';
import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { NAMESPACED_KINDS } from '../content/namespace';
import { loadUniverse } from '../content/registry';
import { runTest } from './session';
import { initialState } from './save';
import { secondsToMs, toMilliUnits } from './units';

const source = readFileSync('content/tutorial-island.dsl', 'utf8');
// Beside the engine's own English, which is what the app ships and so what an
// end-to-end read of the island has to be played in.
const island = (text: string) => loadUniverse([engineLocale(), { name: 'tutorial-island', text }]);
const registry = island(source);

// The directory is the manifest, exactly as the browser's glob is: a `.dsl`
// added to content/ is replayed here on the commit that authors it, and a list
// in this file would be a second answer to what ships. The one exclusion is the
// one the browser makes too — staged local edits are a developer's, not a
// release's.
const shippedSources = () =>
  readdirSync('content')
    .filter((name) => name.endsWith('.dsl'))
    .map((name) => ({ name: name.replace(/\.dsl$/, ''), text: readFileSync(`content/${name}`, 'utf8') }))
    .filter((each) => each.name !== LOCAL_CHANGES_MODULE_ID);

const shipped = loadUniverse(withEngineLocale(shippedSources()));

describe('tutorial-island content', () => {
  // A CRLF checkout is a real configuration — .gitattributes pins LF in the
  // index, and the CI matrix runs Windows, but the loader is what has to hold.
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

// Every `# test` every shipped module declares, replayed in the universe the
// app actually assembles rather than one module at a time: a module that only
// works alone is a module that does not ship.
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

describe('tutorial-island content, continued', () => {

  // The shipped route unlocks the front door through a dialogue effect, so it
  // never picks the lock and never opens the dresser. Both carried a `once` tag
  // that did nothing and the door a `4s` that paced nothing; these are the two
  // places that authoring became real, and no route covers them.
  it('spans the front door by the 4 seconds its inert 4s tag used to only suggest', () => {
    const state = createGameState('tutorial-island.guide-house');
    state.inventory['tutorial-island.lockpick'] = 1;

    useAction('entity', 'tutorial-island.front-door', 'pick-lock', registry, state);
    expect(state.time).toBe(secondsToMs(4));
    expect(state.flags['tutorial-island.front-door.unlocked']).toBe(true);
  });

  it('hands out one lockpick from the dresser, not one per search', () => {
    const state = createGameState();
    const search = () => useAction('entity', 'tutorial-island.dresser', 'search-drawer', registry, state);

    search();
    expect(state.inventory['tutorial-island.lockpick']).toBe(1);
    expect(search).toThrow(/action hidden/);
    expect(state.inventory['tutorial-island.lockpick']).toBe(1);
  });
});

// The routes above are the fixtures; these read the numbers off them. A `# test`
// pins a whole sheet and cannot ask what a stat is worth, so what each effect
// does to the fold is stated here, over the same shipped content.
describe('combat-expansion, read off the routes it ships', () => {
  const POST = 'combat-expansion.proving-post';

  // Replays a shipped route and hands back the state it ended on, so nothing
  // here builds a fixture the player could not have reached.
  const played = (testId: string): GameState => {
    const state = createGameState();
    expect(runTest(testId, shipped, state)).toEqual({ passed: true });
    return state;
  };

  const sheet = (state: GameState, registry: Registry, actorId?: string): Record<string, number> =>
    Object.fromEntries([...registry.stats.keys()].map((statId) => [statId, statValue(statId, state, registry, actorId)]));

  // Derived rather than listed: every stat the universe publishes is read on
  // both sides, so a stat added next month is covered without an edit here.
  it('moves attack as rage accumulates, and moves nothing else at all', () => {
    const state = played('combat-expansion.rage-rises-as-swings-land');
    const full = sheet(state, shipped);
    expect(state.resources['combat-expansion.rage']).toBe(20000);

    restorePools(state, { 'combat-expansion.rage': 0 });
    const empty = sheet(state, shipped);

    const moved = [...shipped.stats.keys()].filter((statId) => full[statId] !== empty[statId]);
    expect(moved).toEqual(['tutorial-island.attack']);

    // Per point, not per pool: the step from ten points to twenty is the step
    // from none to ten, which is what `per` means and what a flat bonus of the
    // same size would not do.
    restorePools(state, { 'combat-expansion.rage': 10000 });
    const half = sheet(state, shipped);
    expect(half['tutorial-island.attack'] - empty['tutorial-island.attack']).toBeCloseTo(full['tutorial-island.attack'] - half['tutorial-island.attack'], 10);
  });

  // The two contributions the same buff makes, told apart by the plane rather
  // than by the buff: the wrath jewel's outer ring holds the passive that reads
  // the stack count, and its hub route does not.
  it('separates what a stack pays from what the count is worth', () => {
    const reading = (testId: string, stacks: number): number => {
      const state = played(testId);
      clearBuffs(state, [PLAYER]);
      const bare = statValue('tutorial-island.attack-rate', state, shipped);
      const vigor = shipped.items.get('combat-expansion.accelerated-vigor')!;
      for (let held = 0; held < stacks; held += 1) grantBuff(state, PLAYER, vigor, state.time + secondsToMs(60));
      return statValue('tutorial-island.attack-rate', state, shipped) - bare;
    };

    // Stacks alone: five instances of `+2 attack-rate`, and nothing reads how
    // many there are, so five stacks are worth five times one.
    expect(reading('combat-expansion.rage-rises-as-swings-land', 5)).toBeCloseTo(10, 10);
    expect(reading('combat-expansion.rage-rises-as-swings-land', 1)).toBeCloseTo(2, 10);

    // Stacks under the per-counter bonus: strictly more, and more per stack the
    // more of them are held.
    const one = reading('combat-expansion.accelerated-vigor-stacks-behind-its-gate', 1);
    const five = reading('combat-expansion.accelerated-vigor-stacks-behind-its-gate', 5);
    expect(one).toBeGreaterThan(2);
    expect(five).toBeGreaterThan(5 * one);
  });

  it('holds poison on the struck party and on nobody else, and makes its pool fall', () => {
    const state = played('combat-expansion.poison-holds-the-struck-enemy');

    expect(buffsOf(state, POST).map((buff) => buff.source)).toEqual(['combat-expansion.venom']);
    expect(buffsOf(state, PLAYER)).toEqual([]);
    expect(statValue('tutorial-island.regeneration', state, shipped, POST)).toBe(-30);

    // The same route twice, one of them with the debuff lifted: the routes draw
    // the same randoms, so the whole of the difference four seconds later is
    // what the venom took.
    const poisoned = played('combat-expansion.poison-holds-the-struck-enemy');
    const clean = played('combat-expansion.poison-holds-the-struck-enemy');
    clearBuffs(clean, [POST]);
    const health = (each: GameState): number => each.activeAction!.actors![POST].resources['tutorial-island.health'];
    const before = health(clean);
    expect(health(poisoned)).toBe(before);

    resolve(poisoned, shipped, poisoned.time + secondsToMs(4));
    resolve(clean, shipped, clean.time + secondsToMs(4));
    expect(before - health(poisoned)).toBeGreaterThan(before - health(clean));
  });

  it('lifts the debuff on its own clock, with nothing else asked to end it', () => {
    expect(buffsOf(played('combat-expansion.poison-lifts-when-its-own-duration-runs-out'), POST)).toEqual([]);
  });

  // The urchin declares no action of any kind, so the only thing that could
  // have taken the player's health is the passive it carries.
  it('costs a striker what the thorned enemy it struck carries', () => {
    const state = played('combat-expansion.striking-a-thorned-enemy-costs-the-striker');
    const attempts = state.activeAction!.cadences![PLAYER].attemptsMade;

    expect(shipped.entities.get('combat-expansion.spined-urchin')!.actions).toEqual([]);
    expect(toMilliUnits(30) - state.resources['tutorial-island.health']).toBe(toMilliUnits(5) * attempts);
  });
});

// The jewels split into a flat half and a percent half because `statRange`
// folds `(base + added) x (1 + increased)`, so the percent half is worth almost
// nothing until the flat half is stacked. Derived over whatever the module
// declares, so a seventh jewel is graded by the same rule that graded the first.
// A tag that groups is one more than one jewel carries: `thorns` names an effect
// and sits on one jewel, where an archetype sits on the pair. Derived, so a
// fourth archetype is grouped — and forbidden below — by the rule that reached
// the first three, and neither reader has a list to keep in step with the other.
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

  // What a jewel's allocated positions pay, counted by channel: one entry per
  // payload, not per position, because a passive may carry several.
  const channels = (registry: Registry, jewel: { positions: Record<number, string> }): { flat: number; percent: number } => {
    const payloads = Object.values(jewel.positions).flatMap((passiveId) => registry.passives.get(passiveId)?.tags ?? []);
    const bonuses = payloads.filter((tag) => tag.kind === 'stat-bonus');
    return { flat: bonuses.filter((tag) => !tag.percent).length, percent: bonuses.filter((tag) => tag.percent).length };
  };

  it('gives every archetype one flat jewel and one percent jewel, and no archetype two of a kind', () => {
    const jewels = declared(shipped, 'combat-expansion');
    const groups = archetypeGrouping(shipped, 'combat-expansion');
    expect(groups.size).toBeGreaterThan(0);
    // Every jewel is in exactly one group, so nothing is graded twice and
    // nothing escapes the rule by carrying no archetype at all.
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

// c2 and c9: nothing in the shipped source is named after anything this content
// composes, an archetype least of all. Both halves of the set are derived from
// the module itself — every id it declares under every kind the language
// namespaces, and every tag that groups its jewels — so a fifth effect and a
// fourth archetype are both covered by authoring them and by nothing else. What
// is deliberately NOT in the set is a free-form keyword tag that groups nothing:
// a passive tagged `state` or `range` would otherwise redden the sweep over an
// engine file that has never heard of it.
describe('no shipped identifier is named after this content', () => {
  const declaredIds = (registry: Registry, namespace: string): Set<string> => {
    const own = new Set<string>();
    for (const kind of NAMESPACED_KINDS) {
      for (const key of registry.namespace.declaredKeys(kind)) {
        if (!key.startsWith(`${namespace}.`)) continue;
        // A member hangs under its owner and a flag under its object, so what
        // is left after the namespace still carries a dot. Only a section's own
        // id is a word, and the owner it hangs under is already in the set.
        const id = key.slice(namespace.length + 1);
        if (!id.includes('.')) own.add(id);
      }
    }
    return own;
  };

  // Every source file the build carries, of either extension, less the tests —
  // which is the one exclusion c2 makes, because a test may use one of these
  // words as an arbitrary content id with no bearing on the runtime.
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
    const shared = declaredIds(shipped, 'tutorial-island');
    const named = [...mine].filter((word) => !shared.has(word));
    expect(named.length).toBeGreaterThan(20);
    expect(sweep(named)).toEqual([]);
  });

  // c9's own honesty mechanism. An archetype is a tag, so it is not among the
  // ids above; it is derived here by the same rule that pairs the jewels, which
  // is what keeps "membership is a tag and nothing more" checkable rather than
  // asserted.
  it('finds no archetype, which is a tag and never an id', () => {
    const archetypes = [...archetypeGrouping(shipped, 'combat-expansion').keys()];
    expect(archetypes.length).toBeGreaterThan(1);
    expect(sweep(archetypes)).toEqual([]);
  });

  // The four the clause names in its own command, two of which are mechanical
  // tags that group nothing and so reach neither derivation above.
  it('finds none of the four effects the clause names either', () => {
    expect(sweep(['poison', 'rage', 'thorns', 'accelerated-vigor', 'accelerated vigour'])).toEqual([]);
  });
});

describe('tutorial-island health resource (Pass 2 end-to-end)', () => {
  it('starts full, drains as the rat bites back, then regenerates from a meal as time passes', () => {
    const state = initialState(registry);
    expect(state.resources['tutorial-island.health']).toBe(toMilliUnits(30)); // full = statValue(max-health) at start

    // The fight is where the rats stand: a fight is bounded by its location.
    state.location = 'tutorial-island.basement';
    // One `use:` is one swing at 25/min; the rat answers on its own 16/min clock.
    useFight('tutorial-island.melee-combat', 'tutorial-island.giant-rat', registry, state);
    expect(state.time).toBe(secondsToMs(2.4));

    resolve(state, registry, secondsToMs(120)); // far longer than the ~6s the rat lasts
    const afterFighting = state.resources['tutorial-island.health'];
    expect(state.flags['tutorial-island.rats-killed']).toBe(1);
    expect(afterFighting).toBeLessThan(toMilliUnits(30)); // it got its bites in
    expect(state.log.some((line) => line.startsWith('The Giant Rat hits you for '))).toBe(true);
    expect(state.log.some((line) => line.startsWith('You hit the Giant Rat for '))).toBe(true);

    // A standing buff needs no active action to tick.
    grantBuff(state, PLAYER, registry.items.get('tutorial-island.cooked-shrimp')!, state.time + secondsToMs(60));
    resolve(state, registry, state.time + secondsToMs(60));
    expect(state.resources['tutorial-island.health']).toBe(Math.min(toMilliUnits(30), afterFighting + toMilliUnits(3)));
  });
});
