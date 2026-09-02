import { clearBuffs } from './buffs';
import { readdirSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { buffsOf, createGameState, GameState, grantBuff, PLAYER, resolve, sampleStat, statRange, statValue, useFight } from './runtime';
import { restorePools } from './effects';
import { isPoint } from '../grammar/range';
import { isStatAmount } from '../grammar/values';
import { populationCount } from '../content/sections/location';
import { Registry } from '../content/registry';
import { ownedSectionKinds } from '../content/sections';
import { MEMBER_KINDS } from '../content/namespace';
import { loadUniverse } from '../content/load';
import { fixtureModule, fixtureSources } from '../content/worldFixture';
import { runTest } from './session';
import { initialState } from './save';
import { secondsToMs, toMilliUnits } from './units';

const source = fixtureModule('core').text;
const world = (text: string) => loadUniverse(fixtureSources().map((each) => (each.name === 'core' ? { name: 'core', text } : each)));
const registry = world(source);

describe('core content', () => {
  it('loads identically from a CRLF checkout, with or without a BOM', () => {
    const crlf = source.replace(/\n/g, '\r\n');
    for (const text of [crlf, `﻿${crlf}`]) {
      const loaded = world(text);
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

describe("an actor's swing is spent out of the range it stands at", () => {
  const ATTACK = 'core.attack';
  const ranged = [...registry.entities.values()].filter((entity) => entity.stats[ATTACK] !== undefined && !isPoint(entity.stats[ATTACK]));

  it('is written by more than one of them, so neither side of a fight carries this alone', () => {
    expect(ranged.length).toBeGreaterThan(1);
  });

  for (const entity of ranged) {
    it(`${entity.id} reads a different number swing to swing, inside what it stands at`, () => {
      const state = createGameState();
      const standing = statRange(ATTACK, state, registry, entity.id);
      const swings = Array.from({ length: 8 }, () => sampleStat(ATTACK, state, registry, entity.id));

      for (const swing of swings) expect(swing).toBeGreaterThanOrEqual(standing.min);
      for (const swing of swings) expect(swing).toBeLessThanOrEqual(standing.max);
      expect(new Set(swings).size).toBeGreaterThan(1);
    });
  }
});

describe('the four shapes a buff has, read off the routes the fixture walks', () => {
  const POST = 'fixture-combat.proving-post';
  const SPITTER = 'fixture-combat.spitting-post';
  const RAGE = 'fixture-combat.rage';

  const endOf = (testId: string): GameState => {
    const state = createGameState();
    runTest(testId, registry, state);
    return state;
  };

  const sheet = (state: GameState, registry: Registry, actorId?: string): Record<string, number> =>
    Object.fromEntries([...registry.stats.keys()].map((statId) => [statId, statValue(statId, state, registry, actorId)]));

  it('moves attack as rage accumulates, and moves nothing else at all', () => {
    const state = endOf('fixture-combat.rage-rises-as-swings-land');
    expect(state.resources[RAGE]).toBeGreaterThan(0);
    const ceiling = toMilliUnits(statValue('fixture-combat.max-rage', state, registry));

    restorePools(state, { [RAGE]: ceiling });
    const full = sheet(state, registry);

    restorePools(state, { [RAGE]: 0 });
    const empty = sheet(state, registry);

    const moved = [...registry.stats.keys()].filter((statId) => full[statId] !== empty[statId]);
    expect(moved).toEqual(['core.attack']);

    restorePools(state, { [RAGE]: ceiling / 2 });
    const half = sheet(state, registry);
    expect(half['core.attack']! - empty['core.attack']!).toBeCloseTo(full['core.attack']! - half['core.attack']!, 10);
  });

  it('separates what a stack pays from what the count is worth', () => {
    const reading = (testId: string, stacks: number): number => {
      const state = endOf(testId);
      clearBuffs(state, [PLAYER]);
      const bare = statValue('core.attack-rate', state, registry);
      const vigor = registry.items.get('fixture-combat.accelerated-vigor')!;
      for (let held = 0; held < stacks; held += 1) grantBuff(state, PLAYER, vigor, state.time + secondsToMs(60));
      return statValue('core.attack-rate', state, registry) - bare;
    };

    expect(reading('fixture-combat.rage-rises-as-swings-land', 5)).toBeCloseTo(10, 10);
    expect(reading('fixture-combat.rage-rises-as-swings-land', 1)).toBeCloseTo(2, 10);

    const one = reading('fixture-combat.accelerated-vigor-stacks-behind-its-gate', 1);
    const five = reading('fixture-combat.accelerated-vigor-stacks-behind-its-gate', 5);
    expect(one).toBeGreaterThan(2);
    expect(five).toBeGreaterThan(5 * one);
  });

  it('holds poison on the struck party and on nobody else, and makes its pool fall', () => {
    const poisoned = endOf('fixture-combat.poison-holds-the-struck-enemy');
    const clean = endOf('fixture-combat.poison-holds-the-struck-enemy');
    clearBuffs(clean, [POST]);

    expect(buffsOf(poisoned, POST).map((buff) => buff.source)).toEqual(['fixture-combat.venom']);
    expect(buffsOf(poisoned, PLAYER)).toEqual([]);
    const regeneration = (each: GameState): number => statValue('core.regeneration', each, registry, POST);
    expect(regeneration(poisoned) - regeneration(clean)).toBe(-30);

    const health = (each: GameState): number => each.activeAction!.actors![POST]!.resources['core.health']!;
    const before = health(clean);
    expect(health(poisoned)).toBe(before);

    resolve(poisoned, registry, poisoned.time + secondsToMs(4));
    resolve(clean, registry, clean.time + secondsToMs(4));
    expect(before - health(poisoned)).toBeGreaterThan(before - health(clean));
  });

  it('lifts the debuff on its own clock, with nothing else asked to end it', () => {
    expect(buffsOf(endOf('fixture-combat.poison-lifts-when-its-own-duration-runs-out'), PLAYER)).toEqual([]);
    expect(registry.entities.get(SPITTER)!.passives).toContain('fixture-combat.envenom');
  });

  it('costs a striker what the thorned enemy it struck carries', () => {
    const state = endOf('fixture-combat.striking-a-thorned-enemy-costs-the-striker');
    const landed = state.activeAction!.cadences![PLAYER]!.attemptsMade;
    const struck = state.resources['core.health']!;

    expect(registry.entities.get(POST)!.blocks).toEqual([]);
    expect(landed).toBeGreaterThan(0);

    const idle = initialState(registry);
    const opening = idle.resources['core.health']!;
    restorePools(idle, { 'core.health': struck });
    resolve(idle, registry, idle.time + (state.time - idle.time));
    const regenerated = idle.resources['core.health']! - struck;

    const spine = registry.passives.get('fixture-combat.retribution')!.whenHit.find((effect) => effect.kind === 'pool')!;
    const drained = spine.delta;
    if (isStatAmount(drained)) throw new Error('fixture-combat.retribution drains a written amount, so this reads it as one');
    expect(drained.min).toBe(drained.max);
    expect(opening + regenerated - struck).toBe(toMilliUnits(-drained.min) * landed);
  });
});

describe('no identifier in the engine is named after the content it loads', () => {
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

  it('finds no id a content module declares', () => {
    const mine = declaredIds(registry, 'fixture-combat');
    const shared = declaredIds(registry, 'core');
    const named = [...mine].filter((word) => !shared.has(word));
    expect(named.length).toBeGreaterThan(5);
    expect(sweep(named)).toEqual([]);
  });

  it('finds none of the four effects the clause names either', () => {
    expect(sweep(['poison', 'rage', 'thorns', 'accelerated-vigor', 'accelerated vigour'])).toEqual([]);
  });
});

describe('core health resource (Pass 2 end-to-end)', () => {
  const wellRats = registry.locations.get('fixture-town.well')!.entities.find((each) => each.entity === 'fixture-town.rat')!;

  it('starts full, drains as the rat bites back, then regenerates from a meal as time passes', () => {
    const state = initialState(registry);
    const full = state.resources['core.health']!;
    expect(full).toBe(toMilliUnits(statValue('core.max-health', state, registry)));

    state.location = 'fixture-town.well';
    useFight('core.melee-combat', 'fixture-town.rat', registry, state);
    expect(state.time).toBeGreaterThan(0);

    let lowest = full;
    for (let target = state.time + secondsToMs(1); target < secondsToMs(120); target += secondsToMs(1)) {
      resolve(state, registry, target);
      lowest = Math.min(lowest, state.resources['core.health']!);
    }
    resolve(state, registry, secondsToMs(120));
    const afterFighting = state.resources['core.health']!;
    expect(state.flags['fixture-quests.well-cleared']).toBe(true);
    expect(populationCount(wellRats)).toBeGreaterThan(1);
    expect(lowest).toBeLessThan(full);
    expect(state.log.some((line) => line.startsWith('The Rat hits you for '))).toBe(true);
    expect(state.log.some((line) => line.startsWith('You hit the Rat for '))).toBe(true);

    const unfed = statValue('core.regeneration', state, registry);
    grantBuff(state, PLAYER, registry.items.get('core.bread')!, state.time + secondsToMs(60));
    const fed = statValue('core.regeneration', state, registry);
    expect(fed).toBeGreaterThan(unfed);

    resolve(state, registry, state.time + secondsToMs(60));
    expect(state.resources['core.health']).toBe(Math.min(full, afterFighting + toMilliUnits(fed)));
  });
});

describe('sitting down is worth more than standing about', () => {
  it('leaves the sitter better off than the same span opened at the same pool', () => {
    const sat = createGameState();
    runTest('fixture-combat.the-bench-is-where-health-comes-back', registry, sat);

    const opened = (registry.saves.get('fixture-combat.hurt-in-town')!.diff as { resources: Record<string, number> }).resources['core.health']!;
    const stood = initialState(registry);
    restorePools(stood, { 'core.health': opened });
    resolve(stood, registry, stood.time + (sat.time - stood.time));

    expect(sat.resources['core.health']).toBeGreaterThan(stood.resources['core.health']!);
  });
});
