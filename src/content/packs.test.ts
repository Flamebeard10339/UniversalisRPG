import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from './load';
import { shippedSources } from './shipped';
import { withModulesOff } from './universe';
import { packsOf, packTurnsTo, refused, turned } from './packs';
import type { ModuleStatus } from './registry';

const status = (over: Partial<ModuleStatus> & { moduleId: string }): ModuleStatus => ({
  sourceName: over.moduleId,
  pack: undefined,
  enabled: true,
  loaded: true,
  ...over,
});

const statusesOf = (off: readonly string[]): readonly ModuleStatus[] => loadUniverseWithDiagnostics(withModulesOff(shippedSources(), off)).modules;

const packNamed = (off: readonly string[], pack: string) => packsOf(statusesOf(off)).find((each) => each.pack === pack)!;

describe('the rows the portal draws', () => {
  it('are every module the load path was handed, grouped under the pack each declares', () => {
    const packs = packsOf(statusesOf([]));
    const listed = packs.flatMap((pack) => pack.modules.map((module) => module.id)).sort();

    expect(listed).toEqual(statusesOf([]).map((status) => status.moduleId).sort());
    expect(packs.map((pack) => pack.pack)).toEqual([...packs.map((pack) => pack.pack)].sort());
    for (const pack of packs) expect(pack.modules.length).toBeGreaterThan(0);
  });

  it('give a module that declares no pack a pack of its own, so nothing has to know which packs exist', () => {
    const packs = packsOf([status({ moduleId: 'lonely' }), status({ moduleId: 'combat', pack: 'skills' })]);

    expect(packs.map((pack) => pack.pack)).toEqual(['lonely', 'skills']);
    expect(packs[0].modules.map((module) => module.id)).toEqual(['lonely']);
  });

  it('say whether a pack is wholly on, wholly off, or part way', () => {
    expect(packNamed([], 'quests').standing).toBe('all');
    expect(packNamed(['first-steps'], 'quests').standing).toBe('some');
    expect(packNamed(packNamed([], 'quests').modules.map((module) => module.name), 'quests').standing).toBe('none');
  });

  // A name on the screen is the engine's to give, so the rows carry ids and the page asks the
  // localizer for the words. Nothing here decides what a player reads.
  it('carry the id a module is known by and the name a toggle is sent under, and no words of their own', () => {
    const [pack] = packsOf([status({ moduleId: 'the-bars-crawl', pack: 'quests', sourceName: 'the-bars-crawl' })]);

    expect(pack).toEqual({ pack: 'quests', standing: 'all', modules: [{ name: 'the-bars-crawl', id: 'the-bars-crawl', on: true, loaded: true }] });
  });
});

describe('what a click leaves behind', () => {
  it('turns a module off and on again, and says nothing about any other', () => {
    expect(turned([], ['first-steps'], false)).toEqual(['first-steps']);
    expect(turned(['first-steps', 'tiers'], ['first-steps'], true)).toEqual(['tiers']);
    expect(turned(['tiers'], ['tiers'], false)).toEqual(['tiers']);
  });

  it('turns a pack by turning each of its modules, so there is one answer to what is off', () => {
    const quests = packNamed([], 'quests');
    const off = turned([], quests.modules.map((module) => module.name), packTurnsTo(quests));

    expect(off).toEqual([...quests.modules.map((module) => module.name)].sort());
    expect(packNamed(off, 'quests').standing).toBe('none');
    expect(packTurnsTo(packNamed(off, 'quests'))).toBe(true);
  });

  it('turns a half-on pack the rest of the way on rather than off', () => {
    const half = packNamed(['first-steps'], 'quests');

    expect(packTurnsTo(half)).toBe(true);
    expect(turned(['first-steps'], half.modules.map((module) => module.name), true)).toEqual([]);
  });
});

// The whole point of the portal, held against the corpus rather than a fixture: the pack the quests
// declare is one click, and what is left has to be a world that opens.
describe('turning the quests off', () => {
  const quests = packNamed([], 'quests').modules.map((module) => module.name);

  it('leaves every other pack standing and every quest module refused by nobody', () => {
    const loaded = loadUniverseWithDiagnostics(withModulesOff(shippedSources(), quests));

    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.registry.quests.size).toBe(0);
    expect([...loaded.registry.locations.values()].some((location) => location.starting)).toBe(true);
    expect(refused(packsOf(loaded.modules))).toEqual([]);
  });

  it('marks a module the loader would not take, rather than showing it as one the player turned off', () => {
    const loaded = loadUniverseWithDiagnostics(withModulesOff(shippedSources(), ['tulsa']));
    const stranded = refused(packsOf(loaded.modules)).map((module) => module.id);

    expect(stranded).toEqual(expect.arrayContaining(quests.filter((name) => name !== 'tulsa')));
    expect(stranded).not.toContain('tulsa');
  });
});
