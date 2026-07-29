import { describe, expect, it } from 'vitest';
import { loadModule, loadUniverse } from './registry';
import { ModuleSource } from './universe';

const module = (id: string, ...lines: string[]): ModuleSource => ({ name: id, text: [`# info ${id}`, ...lines].join('\n') });

const BASE = module('base', '# item rope', '# entity crab', 'title: Crab', 'pinch:', '  give: rope');

describe('a module declares into its own namespace', () => {
  it('hangs every id it creates under its module id', () => {
    const registry = loadUniverse([BASE]);
    expect([...registry.items.keys()]).toEqual(['base.rope']);
    expect([...registry.entities.keys()]).toEqual(['base.crab']);
  });

  it('lets two modules that never met each declare the same name', () => {
    const other = module('other', '# item rope', 'title: Nylon Rope');
    const registry = loadUniverse([BASE, other]);
    expect(registry.items.get('base.rope')!.title).toBe('Rope');
    expect(registry.items.get('other.rope')!.title).toBe('Nylon Rope');
  });

  it('leaves ids at the root when a lone module declares no # info, and refuses that in company', () => {
    expect([...loadModule('# item rope').items.keys()]).toEqual(['rope']);
    expect(() => loadUniverse([{ name: 'loose', text: '# item rope' }, BASE])).toThrow(/declares no # info, so its ids have no namespace/);
  });
});

describe('a reference may drop leading segments', () => {
  const referring = (reference: string) => () => loadUniverse([BASE, module('mod', 'dependencies: base', '# entity gull', `peck:`, `  give: ${reference}`)]);
  const given = (reference: string) => loadUniverse([BASE, module('mod', 'dependencies: base', '# entity gull', 'peck:', `  give: ${reference}`)]).entities.get('mod.gull')!.actions[0].results[0];

  it('resolves the full path, the kind-qualified path, and the bare name alike', () => {
    for (const reference of ['base.rope', 'item.rope', 'rope']) {
      expect(given(reference)).toEqual({ kind: 'give', item: 'base.rope' });
    }
  });

  it('refuses a module that is neither this one nor a declared dependency', () => {
    const stranger = module('stranger', '# item rope');
    expect(() => loadUniverse([BASE, stranger, module('mod', '# entity gull', 'peck:', '  give: stranger.rope')])).toThrow(
      /names stranger.rope, but stranger is not this module or one of its dependencies/,
    );
  });

  it('names both candidates rather than picking one', () => {
    expect(referring('rope')).not.toThrow();
    const shadowing = module('mod', 'dependencies: base', '# item rope', '# entity gull', 'peck:', '  give: rope');
    expect(() => loadUniverse([BASE, shadowing])).toThrow(/ambiguous between base.rope and mod.rope/);
  });

  it('lets self. pick this module out of the ambiguity', () => {
    const shadowing = module('mod', 'dependencies: base', '# item rope', '# entity gull', 'peck:', '  give: self.rope');
    expect(loadUniverse([BASE, shadowing]).entities.get('mod.gull')!.actions[0].results[0]).toEqual({ kind: 'give', item: 'mod.rope' });
  });

  it('is directed by the kind the site wants, so a same-named entity does not shadow an item', () => {
    const both = module('mod', 'dependencies: base', '# entity rope', '# entity gull', 'peck:', '  give: rope');
    expect(loadUniverse([BASE, both]).entities.get('mod.gull')!.actions[0].results[0]).toEqual({ kind: 'give', item: 'base.rope' });
  });
});

describe('a heading creates or edits by its shape alone', () => {
  it('creates in this module when bare, even though a dependency has that name', () => {
    const registry = loadUniverse([BASE, module('mod', 'dependencies: base', '# item rope', 'title: Nylon Rope')]);
    expect(registry.items.get('mod.rope')!.title).toBe('Nylon Rope');
    expect(registry.items.get('base.rope')!.title).toBe('Rope');
  });

  it('edits the dependency when the heading names its path', () => {
    const registry = loadUniverse([BASE, module('mod', 'dependencies: base', '# item base.rope', 'title: Frayed Rope')]);
    expect(registry.items.get('mod.rope')).toBeUndefined();
    expect(registry.items.get('base.rope')!.title).toBe('Frayed Rope');
  });

  it('refuses to edit a path that names nothing', () => {
    expect(() => loadUniverse([BASE, module('mod', 'dependencies: base', '# item base.cable', 'title: Cable')])).toThrow(/names an unknown item: base.cable/);
  });

  it('refuses to edit a dependency declared with ~ because it does not load first', () => {
    const dependency = module('aaa', '# item coin');
    const patch = module('zzz', 'dependencies: ~ aaa', '# item aaa.coin', 'title: Gold Coin');
    expect(() => loadUniverse([patch, dependency])).toThrow(/~ dependencies do not load before this module/);
  });
});

describe('a ~ dependency is visible whichever way the module names sort', () => {
  const target = module('target', '# item gem');
  const referrer = (id: string, ...lines: string[]) => module(id, 'dependencies: ~ target', ...lines);

  it('resolves a reference into it, which is the whole point of ~', () => {
    for (const id of ['aref', 'zref']) {
      const registry = loadUniverse([referrer(id, '# entity npc', 'use:', '  give: target.gem'), target]);
      expect(registry.entities.get(`${id}.npc`)!.actions[0].results[0]).toEqual({ kind: 'give', item: 'target.gem' });
    }
  });

  it('still refuses an edit or a removal, and says why rather than that the id is unknown', () => {
    for (const id of ['aaa', 'zzz']) {
      expect(() => loadUniverse([referrer(id, '# item target.gem', 'title: Gem'), target])).toThrow(/~ dependencies do not load before this module/);
      expect(() => loadUniverse([referrer(id, '# remove item.target.gem'), target])).toThrow(/~ dependencies do not load before this module/);
    }
  });
});

describe('what a namespace does not reach', () => {
  it('leaves a tuning variable global, because the engine reads it by name', () => {
    expect([...loadUniverse([module('base', '# variable min-damage', 'value: 3')]).variables.keys()]).toEqual(['min-damage']);
  });

  it('leaves a station global, because it is a contract between modules that never met', () => {
    const kitchen = module('kitchen', '# entity oven', 'stations: oven');
    const cook = module('cook', 'dependencies: kitchen', '# item bread', '# recipe bake', 'station: oven', 'out: bread');
    expect(loadUniverse([kitchen, cook]).recipes.get('cook.bake')!.requiresCapability).toBe('oven');
  });
});
