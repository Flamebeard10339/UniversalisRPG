import { describe, expect, it } from 'vitest';
import { formatModuleDiagnostic, loadUniverse, loadUniverseWithDiagnostics } from './registry';
import { ModuleSource, orderModules, parseModuleSource, parseUniverse } from './universe';

const module = (name: string, ...lines: string[]): ModuleSource => ({ name, text: lines.join('\n') });

const ids = (sources: ModuleSource[]): string[] => parseUniverse(sources).map((parsed) => parsed.info.id);

describe('module identity', () => {
  it('reads id, version and pack off # info', () => {
    const parsed = parseModuleSource(module('whatever', '# info orc-pack', 'version: 2.1', 'pack: bestiary'));
    expect(parsed.info.id).toBe('orc-pack');
    expect(parsed.info.version).toEqual([2, 1]);
    expect(parsed.info.pack).toBe('bestiary');
  });

  it('falls back to the source name, with a zero version and no dependencies', () => {
    const parsed = parseModuleSource(module('tutorial-island', '# stat attack'));
    expect(parsed.info.id).toBe('tutorial-island');
    expect(parsed.info.version).toEqual([0, 0, 0]);
    expect(parsed.info.dependencies).toEqual([]);
  });

  it('keeps # info out of the sections the registry applies', () => {
    const parsed = parseModuleSource(module('m', '# info m', '# stat attack'));
    expect(parsed.sections.map((section) => section.kind)).toEqual(['stat']);
  });

  it('rejects a second # info, a reserved id, and a duplicate id', () => {
    expect(() => parseModuleSource(module('m', '# info a', '# info b'))).toThrow(/declares # info more than once/);
    expect(() => parseModuleSource(module('m', '# info entity'))).toThrow(/entity is a reserved module id/);
    expect(() => parseModuleSource(module('m', '# info player'))).toThrow(/player is a reserved module id/);
    expect(() => orderModules([parseModuleSource(module('a', '# info a')), parseModuleSource(module('a', '# info a'))])).toThrow(/two modules declare the id a/);
  });
});

describe('load order', () => {
  it('loads a dependency before the module that declares it', () => {
    expect(ids([module('zebra', '# info zebra', 'dependencies: alpha'), module('alpha', '# info alpha')])).toEqual(['alpha', 'zebra']);
  });

  it('breaks ties by module id, whatever order the sources arrive in', () => {
    const sources = [module('c', '# info c'), module('a', '# info a'), module('b', '# info b')];
    expect(ids(sources)).toEqual(['a', 'b', 'c']);
    expect(ids([...sources].reverse())).toEqual(['a', 'b', 'c']);
  });

  it('places a module immediately after the dependency that unblocks it', () => {
    const sources = [module('b', '# info b'), module('a-late', '# info a-late', 'dependencies: b'), module('c', '# info c')];
    expect(ids(sources)).toEqual(['b', 'a-late', 'c']);
  });

  it('makes the later module win a conflict, so the order is visible in the registry', () => {
    const first = module('alpha', '# info alpha', '# stat attack', 'base: 3');
    const second = module('zebra', '# info zebra', 'dependencies: alpha', '# stat alpha.attack', 'base: 9');
    expect(loadUniverse([second, first]).stats.get('alpha.attack')!.base).toEqual({ min: 9, max: 9 });
  });

  it('builds the same universe from the same modules in any source order', () => {
    const base = module('base', '# info base', '# stat attack', 'base: 3');
    const addon = module('addon', '# info addon', 'dependencies: base', '# stat base.attack', 'base: 7');
    const bestiary = module('bestiary', '# info bestiary', 'dependencies: addon, base', '# entity ogre', 'stats: attack 4-7');
    const flavor = module('flavor', '# info flavor');

    const expected = { order: ['base', 'addon', 'bestiary', 'flavor'], attack: { min: 7, max: 7 }, ogre: { 'base.attack': { min: 4, max: 7 } } };
    const sourceOrders = [
      [base, addon, bestiary, flavor],
      [flavor, bestiary, addon, base],
      [bestiary, flavor, base, addon],
    ];

    for (const sources of sourceOrders) {
      const universe = loadUniverse(sources);
      expect(ids(sources)).toEqual(expected.order);
      expect(universe.stats.get('base.attack')!.base).toEqual(expected.attack);
      expect(universe.entities.get('bestiary.ogre')!.stats).toEqual(expected.ogre);
    }
  });
});

describe('dependency declarations', () => {
  it('requires a hard dependency to be present', () => {
    expect(() => ids([module('m', '# info m', 'dependencies: missing')])).toThrow(/names a module that is not loaded: missing/);
  });

  it('loads without an absent optional or recommended dependency', () => {
    expect(ids([module('m', '# info m', 'dependencies: ? missing, + also-missing')])).toEqual(['m']);
  });

  it('orders against an optional dependency that is present', () => {
    expect(ids([module('a-late', '# info a-late', 'dependencies: ? zebra'), module('zebra', '# info zebra')])).toEqual(['zebra', 'a-late']);
  });

  it('rejects a loaded incompatible module', () => {
    expect(() => ids([module('m', '# info m', 'dependencies: ! other'), module('other', '# info other')])).toThrow(/m is incompatible with other/);
  });

  it('checks the version of a dependency that is present', () => {
    const base = module('base', '# info base', 'version: 1.2.0');
    expect(ids([module('m', '# info m', 'dependencies: base >= 1.2'), base])).toEqual(['base', 'm']);
    expect(ids([module('m', '# info m', 'dependencies: base < 2'), base])).toEqual(['base', 'm']);
    expect(() => ids([module('m', '# info m', 'dependencies: base >= 1.3'), base])).toThrow(/needs base >= 1.3, but base 1.2.0 is loaded/);
    expect(() => ids([module('m', '# info m', 'dependencies: ? base = 1.0.0'), base])).toThrow(/needs \? base = 1.0.0, but base 1.2.0 is loaded/);
  });

  it('reads dependencies as a block as well as inline', () => {
    const parsed = parseModuleSource(module('m', '# info m', 'dependencies:', '  base >= 1.0.0', '  ? extras'));
    expect(parsed.info.dependencies).toEqual([
      { prefix: 'required', module: 'base', operator: '>=', version: [1, 0, 0] },
      { prefix: 'optional', module: 'extras' },
    ]);
  });
});

describe('cycles', () => {
  it('names the modules in a cycle', () => {
    const sources = [module('a', '# info a', 'dependencies: b'), module('b', '# info b', 'dependencies: a')];
    expect(() => ids(sources)).toThrow(/depend on each other in a cycle: a, b/);
  });

  it('lets ~ break a cycle without weakening the requirement', () => {
    const sources = [module('a', '# info a', 'dependencies: b'), module('b', '# info b', 'dependencies: ~ a')];
    expect(ids(sources)).toEqual(['b', 'a']);
    expect(() => ids([module('b', '# info b', 'dependencies: ~ a')])).toThrow(/names a module that is not loaded: ~ a/);
  });
});

describe('loadUniverse', () => {
  it('resolves references across module boundaries in either direction', () => {
    const stats = module('stats', '# info stats', '# stat attack');
    const uses = module('uses', '# info uses', 'dependencies: stats', '# entity ogre', 'stats: attack 4-7');
    expect(loadUniverse([uses, stats]).entities.get('uses.ogre')!.stats).toEqual({ 'stats.attack': { min: 4, max: 7 } });
  });
});

describe('loadUniverseWithDiagnostics', () => {
  it('skips disabled modules before parsing the strict load set, while reporting their pack status', () => {
    const base = module('base', '# info base', '# item rope');
    const extra: ModuleSource = { ...module('extra', '# info extra', 'pack: side-content', '# item gem'), enabled: false };

    expect([...loadUniverse([base, extra]).items.keys()]).toEqual(['base.rope']);

    const result = loadUniverseWithDiagnostics([extra, base]);
    expect(result.loadedModules).toEqual(['base']);
    expect(result.disabledModules).toEqual(['extra']);
    expect(result.diagnostics).toEqual([]);
    expect(result.modules).toEqual([
      { sourceName: 'extra', moduleId: 'extra', pack: 'side-content', enabled: false, loaded: false },
      { sourceName: 'base', moduleId: 'base', enabled: true, loaded: true },
    ]);
  });

  it('prunes references into absent optional modules instead of disabling the referring module', () => {
    const addon: ModuleSource = {
      ...module('addon', '# info addon', '# item gem', '# entity fairy', '# location garden', 'x: 1, y: 0', '# stat might'),
      enabled: false,
    };
    const base = module(
      'base',
      '# info base',
      'dependencies: ? addon',
      '# stat guile',
      '# item charm',
      '+2 addon.might, +1 guile',
      '# entity chest',
      'stats: addon.might 3, guile 4',
      'open:',
      '  give: addon.gem',
      '# recipe charm',
      'in: addon.gem',
      'out: charm',
      '# location camp',
      'x: 0, y: 0',
      'starting',
      'entities: chest, addon.fairy',
      'adjacent: addon.garden',
    );

    const result = loadUniverseWithDiagnostics([base, addon]);

    expect(result.loadedModules).toEqual(['base']);
    expect(result.diagnostics).toEqual([]);
    expect(result.registry.entities.get('base.chest')!.actions).toEqual([]);
    expect(result.registry.entities.get('base.chest')!.stats).toEqual({ 'base.guile': { min: 4, max: 4 } });
    expect(result.registry.items.get('base.charm')!.tags.map((tag) => (tag.kind === 'stat-bonus' ? tag.statId : tag.kind))).toEqual(['base.guile']);
    expect(result.registry.recipes.has('base.charm')).toBe(false);
    expect(result.registry.locations.get('base.camp')!.entities).toEqual([{ entity: 'base.chest' }]);
    expect(result.registry.locations.get('base.camp')!.adjacent).toEqual([]);
  });

  it('undeclares what it prunes, so the namespace and the registry survive as one universe', () => {
    const addon: ModuleSource = { ...module('addon', '# info addon', '# item gem'), enabled: false };
    const base = module(
      'base',
      '# info base',
      'dependencies: ? addon',
      '# entity miki',
      '# dialogue chat',
      'owner = miki',
      'node greet:',
      '  Hi.',
      '  give: addon.gem',
      '# location camp',
      'north of addon.garden',
    );

    const { registry, loadedModules, diagnostics } = loadUniverseWithDiagnostics([base, addon]);

    expect({ loadedModules, diagnostics }).toEqual({ loadedModules: ['base'], diagnostics: [] });
    expect(registry.entities.has('base.miki')).toBe(true);
    expect(registry.dialogues.has('base.chat')).toBe(false);
    expect(registry.namespace.has('dialogue', 'base.chat')).toBe(false);
    expect(registry.namespace.has('node', 'base.chat.greet')).toBe(false);
    expect(registry.locations.has('base.camp')).toBe(false);
    expect(registry.namespace.has('location', 'base.camp')).toBe(false);
    expect(registry.namespace.has('flag', 'base.camp.discovered')).toBe(false);
  });

  it('disables only the module whose source does not parse', () => {
    const result = loadUniverseWithDiagnostics([module('base', '# info base', '# item rope'), { name: 'broken', text: '# item' }]);

    expect(result.loadedModules).toEqual(['base']);
    expect(result.disabledModules).toEqual(['broken']);
    expect([...result.registry.items.keys()]).toEqual(['base.rope']);
    expect(result.diagnostics[0]).toMatchObject({
      sourceName: 'broken',
      moduleId: 'broken',
      stage: 'parse',
      message: '# item requires an id',
      line: 1,
      column: 1,
    });
    expect(formatModuleDiagnostic(result.diagnostics[0])).toContain('broken:1:1 [broken] parse: # item requires an id');
  });

  it('does not diagnose a switched-off source that does not parse, so switching one off is an exit from its problems', () => {
    const result = loadUniverseWithDiagnostics([module('base', '# info base', '# item rope'), { name: 'broken', text: '# item', enabled: false }]);

    expect(result.loadedModules).toEqual(['base']);
    expect(result.disabledModules).toEqual(['broken']);
    expect(result.diagnostics).toEqual([]);
  });

  it('disables a module that fails resolution, then disables dependents against the recomputed active set', () => {
    const base = module('base', '# info base', '# item rope');
    const bad = module('bad', '# info bad', 'dependencies: base', '# entity gull', 'peck:', '  give: missing');
    const child = module('child', '# info child', 'dependencies: bad', '# item bead');

    const result = loadUniverseWithDiagnostics([child, bad, base]);

    expect(result.loadedModules).toEqual(['base']);
    expect([...result.disabledModules].sort()).toEqual(['bad', 'child']);
    expect(result.diagnostics.map((d) => [d.moduleId, d.stage, d.message])).toEqual([
      ['bad', 'resolve', '# entity bad.gull action "peck" give: names an unknown item: missing'],
      ['child', 'order', '# info child dependencies: names a module that is not loaded: bad'],
    ]);
  });

  it('attributes post-merge validation errors to the module that owns the section', () => {
    const base = module('base', '# info base', '# entity oven', 'stations: oven');
    const bad = module('bad', '# info bad', '# item bread', '# recipe bake', 'station: kiln', 'out: bread');

    const result = loadUniverseWithDiagnostics([base, bad]);

    expect(result.loadedModules).toEqual(['base']);
    expect(result.registry.recipes.size).toBe(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      moduleId: 'bad',
      stage: 'validate',
      message: '# recipe bad.bake station: names an unknown capability: kiln',
    });
  });
});

describe('the parsed modules a load hands back', () => {
  it('are in the order they were applied, not the order the sources arrived in', () => {
    const sources = [module('zebra', '# info zebra', 'dependencies: alpha'), module('alpha', '# info alpha')];
    const result = loadUniverseWithDiagnostics(sources);
    expect(result.parsed.map((each) => each.info.id)).toEqual(['alpha', 'zebra']);
    expect(result.parsed.map((each) => each.info.id)).toEqual(result.loadedModules);
  });

  it('carry the sections each module declared, which is what a serializer needs off them', () => {
    const result = loadUniverseWithDiagnostics([module('m', '# info m', '# item rock', '# variable pace', 'value: 3')]);
    expect(result.parsed[0].sections.map((section) => section.kind)).toEqual(['item', 'variable']);
  });

  it('hold the same source objects that were passed in, so a caller can match them up', () => {
    const source = module('m', '# info m', '# item rock');
    expect(loadUniverseWithDiagnostics([source]).parsed[0].source).toBe(source);
  });

  it('exclude a module that failed to load, since it contributed nothing to the registry', () => {
    const good = module('good', '# info good', '# item rock');
    const bad = module('bad', '# info bad', '# recipe nope', 'out: missing');
    const result = loadUniverseWithDiagnostics([good, bad]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.parsed.map((each) => each.info.id)).toEqual(['good']);
  });

  it('are empty when nothing loaded at all', () => {
    expect(loadUniverseWithDiagnostics([]).parsed).toEqual([]);
  });
});
