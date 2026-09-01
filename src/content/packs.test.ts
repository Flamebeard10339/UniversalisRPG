import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from './load';
import { fixtureSources } from './worldFixture';
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

const statusesOf = (off: readonly string[]): readonly ModuleStatus[] => loadUniverseWithDiagnostics(withModulesOff(fixtureSources(), off)).modules;

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
    expect(packNamed([], 'fixture').standing).toBe('all');
    expect(packNamed(['fixture-town'], 'fixture').standing).toBe('some');
    expect(packNamed(packNamed([], 'fixture').modules.map((module) => module.name), 'fixture').standing).toBe('none');
  });

  it('carry the id a module is known by and the name a toggle is sent under, and no words of their own', () => {
    const [pack] = packsOf([status({ moduleId: 'the-bars-crawl', pack: 'quests', sourceName: 'the-bars-crawl' })]);

    expect(pack).toEqual({ pack: 'quests', standing: 'all', modules: [{ name: 'the-bars-crawl', id: 'the-bars-crawl', on: true, loaded: true }] });
  });
});

describe('what a click leaves behind', () => {
  it('turns a module off and on again, and says nothing about any other', () => {
    expect(turned([], ['fixture-town'], false)).toEqual(['fixture-town']);
    expect(turned(['fixture-town', 'fixture-quests'], ['fixture-town'], true)).toEqual(['fixture-quests']);
    expect(turned(['fixture-quests'], ['fixture-quests'], false)).toEqual(['fixture-quests']);
  });

  it('turns a pack by turning each of its modules, so there is one answer to what is off', () => {
    const world = packNamed([], 'fixture');
    const off = turned([], world.modules.map((module) => module.name), packTurnsTo(world));

    expect(off).toEqual([...world.modules.map((module) => module.name)].sort());
    expect(packNamed(off, 'fixture').standing).toBe('none');
    expect(packTurnsTo(packNamed(off, 'fixture'))).toBe(true);
  });

  it('turns a half-on pack the rest of the way on rather than off', () => {
    const half = packNamed(['fixture-town'], 'fixture');

    expect(packTurnsTo(half)).toBe(true);
    expect(turned(['fixture-town'], half.modules.map((module) => module.name), true)).toEqual([]);
  });
});

describe('turning the quests off', () => {
  const quests = packNamed([], 'fixture-quests').modules.map((module) => module.name);

  it('leaves every other pack standing and every quest module refused by nobody', () => {
    const loaded = loadUniverseWithDiagnostics(withModulesOff(fixtureSources(), quests));

    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.registry.quests.size).toBe(0);
    expect([...loaded.registry.locations.values()].some((location) => location.starting)).toBe(true);
    expect(refused(packsOf(loaded.modules))).toEqual([]);
  });

  it('marks a module the loader would not take, rather than showing it as one the player turned off', () => {
    const loaded = loadUniverseWithDiagnostics(withModulesOff(fixtureSources(), ['fixture-town']));
    const stranded = refused(packsOf(loaded.modules)).map((module) => module.id);

    expect(stranded).toEqual(expect.arrayContaining(quests.filter((name) => name !== 'fixture-town')));
    expect(stranded).not.toContain('fixture-town');
  });
});
