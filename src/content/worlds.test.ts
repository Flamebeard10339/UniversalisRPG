import { describe, expect, it } from 'vitest';
import { rootModules, standingClosure, standingWithin, worldWithin } from './worlds';
import { loadUniverseWithDiagnostics } from './load';
import type { ModuleSource } from './universe';

const module = (id: string, ...lines: string[]): ModuleSource => ({ name: id, text: [`# info ${id}`, 'version: 1.0.0', ...lines, ''].join('\n') });

const needs = (...ids: string[]): string => `dependencies: ${ids.join(', ')}`;
const OPENS = ['', '# location start', 'x: 0, y: 0', 'starting'];

describe('the world one module leans on', () => {
  const sources = [module('core'), module('town', needs('core')), module('errand', needs('town')), module('elsewhere')];

  it('is the module and everything the loader would refuse to start it without', () => {
    expect(worldWithin(sources, 'errand').map((each) => each.name)).toEqual(['core', 'town', 'errand']);
  });

  it('is the module alone where it leans on nothing', () => {
    expect(worldWithin(sources, 'elsewhere').map((each) => each.name)).toEqual(['elsewhere']);
  });

  it('comes back in the order the sources were given, not the order it walked them', () => {
    const backwards = [...sources].reverse();
    expect(worldWithin(backwards, 'errand').map((each) => each.name)).toEqual(['errand', 'town', 'core']);
  });

  it('leaves out a dependency the loader would start without', () => {
    const optional = [module('core'), module('town', 'dependencies: ? core')];
    expect(worldWithin(optional, 'town').map((each) => each.name)).toEqual(['town']);
  });
});

describe('the standing world', () => {
  it('is the closure of the one module that opens somewhere', () => {
    const sources = [module('core'), module('town', needs('core'), ...OPENS), module('errand', needs('town')), module('elsewhere')];
    expect(standingWithin(sources).map((each) => each.name)).toEqual(['core', 'town']);
  });

  it('is the smallest of them where more than one module opens somewhere, and the rest nest over it', () => {
    const sources = [module('core'), module('town', needs('core'), ...OPENS), module('tutorial', needs('town'), ...OPENS)];
    expect(standingWithin(sources).map((each) => each.name)).toEqual(['core', 'town']);
  });

  it('stands, and stops standing when any one of its modules is taken out', () => {
    const sources = [module('core'), module('town', needs('core'), ...OPENS), module('elsewhere')];
    const held = [...standingClosure(sources)];
    const stands = (subset: readonly ModuleSource[]): boolean => {
      const { registry, diagnostics } = loadUniverseWithDiagnostics(subset);
      return diagnostics.length === 0 && [...registry.locations.values()].some((location) => location.starting);
    };

    expect(held.length).toBeGreaterThan(1);
    expect(stands(standingWithin(sources))).toBe(true);
    for (const dropped of held) {
      expect(stands(standingWithin(sources).filter((source) => source.name !== dropped)), `without ${dropped}`).toBe(false);
    }
  });

  it('refuses a world nothing opens, rather than picking one', () => {
    expect(() => standingClosure([module('core')])).toThrow(/no module declares a starting/);
  });

  it('refuses two openers whose worlds do not nest', () => {
    const sources = [module('north', ...OPENS), module('south', ...OPENS)];
    expect(() => standingClosure(sources)).toThrow(/do not nest/);
  });
});

describe('a module that leans on nothing', () => {
  it('is every module the loader would start first, and no other', () => {
    const sources = [module('core'), module('town', needs('core')), module('aside', 'dependencies: ? core')];
    expect([...rootModules(sources)].sort()).toEqual(['aside', 'core']);
  });
});
