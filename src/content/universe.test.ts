import { describe, expect, it } from 'vitest';
import { loadUniverse } from './registry';
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
    expect(() => orderModules([parseModuleSource(module('a')), parseModuleSource(module('a'))])).toThrow(/two modules declare the id a/);
  });
});

describe('load order', () => {
  it('loads a dependency before the module that declares it', () => {
    expect(ids([module('zebra', '# info zebra', 'dependencies: alpha'), module('alpha', '# info alpha')])).toEqual(['alpha', 'zebra']);
  });

  it('breaks ties by module id, whatever order the sources arrive in', () => {
    const sources = [module('c'), module('a'), module('b')];
    expect(ids(sources)).toEqual(['a', 'b', 'c']);
    expect(ids([...sources].reverse())).toEqual(['a', 'b', 'c']);
  });

  it('places a module immediately after the dependency that unblocks it', () => {
    const sources = [module('b'), module('a-late', '# info a-late', 'dependencies: b'), module('c')];
    expect(ids(sources)).toEqual(['b', 'a-late', 'c']);
  });

  it('makes the later module win a conflict, so the order is visible in the registry', () => {
    const first = module('alpha', '# info alpha', '# stat attack', 'base: 3');
    const second = module('zebra', '# info zebra', 'dependencies: alpha', '# stat attack', 'base: 9');
    expect(loadUniverse([second, first]).stats.get('attack')!.base).toEqual({ min: 9, max: 9 });
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
    expect(ids([module('a-late', '# info a-late', 'dependencies: ? zebra'), module('zebra')])).toEqual(['zebra', 'a-late']);
  });

  it('rejects a loaded incompatible module', () => {
    expect(() => ids([module('m', '# info m', 'dependencies: ! other'), module('other')])).toThrow(/m is incompatible with other/);
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
    expect(loadUniverse([uses, stats]).entities.get('ogre')!.stats).toEqual({ attack: { min: 4, max: 7 } });
  });
});
