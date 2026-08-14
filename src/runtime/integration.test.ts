import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { createGameState, grantBuff, PLAYER, resolve, useAction, useFight } from './runtime';
import { engineLocale } from '../content/engineLocale';
import { loadUniverse } from '../content/registry';
import { runTest } from './session';
import { initialState } from './save';
import { secondsToMs, toMilliUnits } from './units';

const source = readFileSync('content/tutorial-island.dsl', 'utf8');
// Beside the engine's own English, which is what the app ships and so what an
// end-to-end read of the island has to be played in.
const island = (text: string) => loadUniverse([engineLocale(), { name: 'tutorial-island', text }]);
const registry = island(source);

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

  for (const id of registry.tests.keys()) {
    it(`test "${id}" passes`, () => {
      expect(runTest(id, registry, createGameState())).toEqual({ passed: true });
    });
  }

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
