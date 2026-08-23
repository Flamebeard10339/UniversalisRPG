import { describe, expect, it } from 'vitest';
import { formatModuleDiagnostic } from './registry';
import { loadUniverse, loadUniverseWithDiagnostics } from './load';
import { ModuleSource, orderModules, parseModuleSource, parseUniverse } from './universe';

const module = (name: string, ...lines: string[]): ModuleSource => ({
  name,
  text: lines.join('\n'),
});

const ids = (sources: ModuleSource[]): string[] => parseUniverse(sources).map((parsed) => parsed.info.id);

describe('module identity', () => {
  it('reads id, version and pack off # info', () => {
    const parsed = parseModuleSource(module('whatever', '# info orc-pack', 'version: 2.1', 'pack: bestiary'));
    expect(parsed.info.id).toBe('orc-pack');
    expect(parsed.info.version).toEqual([2, 1]);
    expect(parsed.info.pack).toBe('bestiary');
  });

  it('falls back to the source name, with a zero version and no dependencies', () => {
    const parsed = parseModuleSource(module('core', '# stat attack'));
    expect(parsed.info.id).toBe('core');
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

    const expected = {
      order: ['base', 'addon', 'bestiary', 'flavor'],
      attack: { min: 7, max: 7 },
      ogre: { 'base.attack': { min: 4, max: 7 } },
    };
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
      {
        prefix: 'required',
        module: 'base',
        operator: '>=',
        version: [1, 0, 0],
      },
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
    const extra: ModuleSource = {
      ...module('extra', '# info extra', 'pack: side-content', '# item gem'),
      enabled: false,
    };

    expect([...loadUniverse([base, extra]).items.keys()]).toEqual(['base.rope']);

    const result = loadUniverseWithDiagnostics([extra, base]);
    expect(result.loadedModules).toEqual(['base']);
    expect(result.disabledModules).toEqual(['extra']);
    expect(result.diagnostics).toEqual([]);
    expect(result.modules).toEqual([
      {
        sourceName: 'extra',
        moduleId: 'extra',
        pack: 'side-content',
        enabled: false,
        loaded: false,
      },
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
    expect(result.registry.entities.get('base.chest')!.stats).toEqual({
      'base.guile': { min: 4, max: 4 },
    });
    expect(result.registry.items.get('base.charm')!.tags.map((tag) => (tag.kind === 'stat-bonus' ? tag.statId : tag.kind))).toEqual(['base.guile']);
    expect(result.registry.recipes.has('base.charm')).toBe(false);
    expect(result.registry.locations.get('base.camp')!.entities).toEqual([{ entity: 'base.chest' }]);
    expect(result.registry.locations.get('base.camp')!.adjacent).toEqual([]);
  });

  it('prunes what a passive carries, who carries it, and the position that placed it', () => {
    const addon: ModuleSource = {
      ...module('addon', '# info addon', '# stat might', '# item gem', '# passive gilded'),
      enabled: false,
    };
    const base = module(
      'base',
      '# info base',
      'dependencies: ? addon',
      '# stat guile',
      '# passive spined',
      '+2 addon.might, +1 guile',
      'on hit: give: addon.gem',
      'when hit: give: 1 charm',
      '# item charm',
      '# cluster-jewel band',
      'shape: spindle',
      'open-connections: e',
      'passives: 1 spined, 2 addon.gilded',
      '# entity urchin',
      'passives: spined, addon.gilded',
    );

    const { registry, loadedModules, diagnostics } = loadUniverseWithDiagnostics([base, addon]);

    expect({ loadedModules, diagnostics }).toEqual({
      loadedModules: ['base'],
      diagnostics: [],
    });
    expect(registry.entities.get('base.urchin')!.passives).toEqual(['base.spined']);
    expect(registry.clusterJewels.get('base.band')!.positions).toEqual({
      1: 'base.spined',
    });

    const spined = registry.passives.get('base.spined')!;
    expect(spined.tags.map((tag) => (tag.kind === 'stat-bonus' ? tag.statId : tag.kind))).toEqual(['base.guile']);
    expect(spined.onHit).toEqual([]);
    expect(spined.whenHit).toEqual([{ kind: 'give', item: 'base.charm', amount: { min: 1, max: 1 } }]);
  });

  it("prunes each of an item's cluster fields by what that field makes the item", () => {
    const addon: ModuleSource = {
      ...module('addon', '# info addon', '# stat vigour', '# cluster-jewel gilded', 'shape: point', 'open-connections: e'),
      enabled: false,
    };
    const base = module(
      'base',
      '# info base',
      'dependencies: ? addon',
      '# stat guile',
      '# cluster-jewel band',
      'shape: point',
      'open-connections: e',
      '# item shard',
      'cluster-jewel: addon.gilded',
      '# item charm',
      'cluster-jewel: band',
      '# item heartwood-blade',
      'slot: mainhand',
      'origin-cluster: addon.gilded',
      '# item orb-of-vitality',
      'cluster-effect: +25% addon.vigour',
      '# item orb-of-guile',
      'cluster-effect: +10% guile',
    );

    const { registry, loadedModules, diagnostics } = loadUniverseWithDiagnostics([base, addon]);

    expect({ loadedModules, diagnostics }).toEqual({
      loadedModules: ['base'],
      diagnostics: [],
    });

    expect(registry.items.has('base.shard')).toBe(false);
    expect(registry.namespace.has('item', 'base.shard')).toBe(false);
    expect(registry.items.get('base.charm')!.clusterJewel).toBe('base.band');

    const blade = registry.items.get('base.heartwood-blade')!;
    expect({ slot: blade.slot, originCluster: blade.originCluster }).toEqual({ slot: 'mainhand', originCluster: undefined });

    expect(registry.items.get('base.orb-of-vitality')!.clusterEffect).toBeUndefined();
    expect(registry.items.get('base.orb-of-guile')!.clusterEffect).toEqual({ statId: 'base.guile', percent: 10 });
  });

  it('undeclares what it prunes, so the namespace and the registry survive as one universe', () => {
    const addon: ModuleSource = {
      ...module('addon', '# info addon', '# item gem'),
      enabled: false,
    };
    const base = module('base', '# info base', 'dependencies: ? addon', '# entity miki', '# dialogue chat', 'owner = miki', 'node greet:', '  Hi.', '  give: addon.gem', '# location camp', 'north of addon.garden');

    const { registry, loadedModules, diagnostics } = loadUniverseWithDiagnostics([base, addon]);

    expect({ loadedModules, diagnostics }).toEqual({
      loadedModules: ['base'],
      diagnostics: [],
    });
    expect(registry.entities.has('base.miki')).toBe(true);
    expect(registry.dialogues.has('base.chat')).toBe(false);
    expect(registry.namespace.has('dialogue', 'base.chat')).toBe(false);
    expect(registry.namespace.has('node', 'base.chat.greet')).toBe(false);
    expect(registry.locations.has('base.camp')).toBe(false);
    expect(registry.namespace.has('location', 'base.camp')).toBe(false);
    expect(registry.namespace.has('flag', 'base.camp.discovered')).toBe(false);
  });

  it('takes an action-slug member with the action, at every site that prunes one, so a use: naming it cannot load clean', () => {
    const ghost: ModuleSource = {
      ...module('ghost', '# info ghost', '# item gem'),
      enabled: false,
    };
    const base = module(
      'base',
      '# info base',
      'dependencies: ? ghost',
      '# action swing',
      'give: ghost.gem',
      '# entity brute',
      'uses: swing',
      '# entity dresser',
      'search drawer:',
      '  give: ghost.gem',
      '# item lamp',
      'polish:',
      '  give: ghost.gem',
      '# location shore',
      'x: 0, y: 0',
      'starting',
      'entities: brute, dresser',
      'light beacon:',
      '  give: ghost.gem',
    );
    const walker = (name: string, use: string): ModuleSource => module(name, `# info ${name}`, 'dependencies: base', `# test ${name}`, `use: ${use}`);

    for (const [name, address] of [
      ['t1', 'entity.base.brute.swing'],
      ['t2', 'entity.base.dresser.search-drawer'],
      ['t3', 'item.base.lamp.polish'],
      ['t4', 'location.base.shore.light-beacon'],
    ]) {
      const { registry, loadedModules, diagnostics } = loadUniverseWithDiagnostics([base, ghost, walker(name, address)]);

      expect({ address, loadedModules, diagnostics }).toEqual({
        address,
        loadedModules: ['base', name],
        diagnostics: [],
      });
      expect({ address, tests: [...registry.tests.keys()] }).toEqual({
        address,
        tests: [],
      });
      expect(registry.namespace.declaredKeys('action-slug')).toEqual([]);
    }
  });

  it('reads the survivors off the whole universe, so pruning one object does not take an identically named object of another kind with it', () => {
    const ghost: ModuleSource = {
      ...module('ghost', '# info ghost', '# item gem'),
      enabled: false,
    };
    const base = module('base', '# info base', 'dependencies: ? ghost', '# entity dresser', 'search drawer:', '  give: ghost.gem', '# item dresser', 'search drawer:', '  say: rattle', '# location shore', 'x: 0, y: 0', 'starting', 'entities: dresser');
    const walker = (use: string): ModuleSource => module('walk', '# info walk', 'dependencies: base', '# test walk', `use: ${use}`);

    const survivor = loadUniverseWithDiagnostics([base, ghost, walker('item.base.dresser.search-drawer')]);

    expect({
      loadedModules: survivor.loadedModules,
      diagnostics: survivor.diagnostics,
    }).toEqual({ loadedModules: ['base', 'walk'], diagnostics: [] });
    expect(survivor.registry.entities.get('base.dresser')!.blocks).toEqual([]);
    expect(survivor.registry.items.get('base.dresser')!.actions).toHaveLength(1);
    expect(survivor.registry.namespace.declaredKeys('action-slug')).toEqual(['item.base.dresser.search-drawer']);
    expect([...survivor.registry.tests.keys()]).toEqual(['walk.walk']);

    const stranded = loadUniverseWithDiagnostics([base, ghost, walker('entity.base.dresser.search-drawer')]);

    expect({
      loadedModules: stranded.loadedModules,
      diagnostics: stranded.diagnostics,
    }).toEqual({ loadedModules: ['base', 'walk'], diagnostics: [] });
    expect([...stranded.registry.tests.keys()]).toEqual([]);
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
    const base = module('base', '# info base', '# entity smith', 'equipment-slots: mainhand');
    const bad = module('bad', '# info bad', '# item hat', 'slot: helm');

    const result = loadUniverseWithDiagnostics([base, bad]);

    expect(result.loadedModules).toEqual(['base']);
    expect(result.registry.items.size).toBe(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      moduleId: 'bad',
      stage: 'validate',
      message: '# item bad.hat slot: names helm, which no # entity declares among its equipment-slots:',
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

describe('a module declares the language it is written in (c5)', () => {
  const titled = (language: string): string => {
    const sources = [module('island', '# info island', 'version: 1.0.0', `language: ${language}`, '# entity giant-rat', '# location shore', 'x: 0, y: 0', 'starting')];
    return loadUniverse(sources).entities.get('island.giant-rat')!.title;
  };

  it('defaults to en, which is where humanizeEn supplies an unauthored title', () => {
    expect(parseModuleSource(module('island', '# info island')).info.language).toBe('en');
    expect(titled('en')).toBe('Giant Rat');
  });

  it('leaves the raw id standing in another language, rather than an English phrase dressed as content', () => {
    expect(titled('es')).toBe('giant-rat');
  });

  it('records a generated title as an entry only for a module writing English', () => {
    const en = loadUniverse([module('island', '# info island', 'version: 1.0.0', '# entity giant-rat', '# location shore', 'x: 0, y: 0', 'starting')]);
    const es = loadUniverse([module('island', '# info island', 'version: 1.0.0', 'language: es', '# entity giant-rat', '# location shore', 'x: 0, y: 0', 'starting')]);

    expect(en.locales.base.get('island.entity.giant-rat.title')).toEqual({
      text: 'Giant Rat',
      language: 'en',
      generated: true,
    });
    expect(es.locales.base.has('island.entity.giant-rat.title')).toBe(false);
    expect(es.locales.addressable.has('island.entity.giant-rat.title')).toBe(true);
  });

  it('records an authored title under whatever language its module declared', () => {
    const es = loadUniverse([module('island', '# info island', 'version: 1.0.0', 'language: es', '# entity rata-gigante', 'title: Rata Gigante', '# location shore', 'x: 0, y: 0', 'starting')]);

    expect(es.locales.base.get('island.entity.rata-gigante.title')).toEqual({
      text: 'Rata Gigante',
      language: 'es',
    });
  });

  it('takes a tag it has never heard of, because nothing but the humanizeEn gate reads one', () => {
    expect(parseModuleSource(module('island', '# info island', 'language: pt-br')).info.language).toBe('pt-br');
  });
});

describe('a generated action label is an English entry too (c5)', () => {
  const isla = (language: string) => loadUniverse([module('isla', '# info isla', 'version: 1.0.0', `language: ${language}`, '# location orilla', 'x: 0, y: 0', 'starting', 'entities:', '  puerta', '# entity puerta', 'uses: abrir-puerta', '# action abrir-puerta', 'instant', 'say: se abre')]);

  it('records the generated label only for a module writing English', () => {
    expect(isla('en').locales.base.get('isla.action.abrir-puerta.abrir-puerta')).toEqual({ text: 'Abrir Puerta', language: 'en', generated: true });
    expect(isla('es').locales.base.has('isla.action.abrir-puerta.abrir-puerta')).toBe(false);
    expect(isla('es').locales.base.has('isla.entity.puerta.abrir-puerta')).toBe(false);
  });

  it('leaves the label itself alone, because it is what a player is shown', () => {
    expect(isla('es').actions.get('isla.abrir-puerta')?.label).toBe('Abrir Puerta');
  });

  it('records an authored label whatever language it is in', () => {
    const titled = loadUniverse([module('isla', '# info isla', 'version: 1.0.0', 'language: es', '# location orilla', 'x: 0, y: 0', 'starting', '# action abrir', 'title: Abrir la puerta', 'instant', 'say: se abre')]);

    expect(titled.locales.base.get('isla.action.abrir.abrir')).toEqual({
      text: 'Abrir la puerta',
      language: 'es',
    });
  });
});
