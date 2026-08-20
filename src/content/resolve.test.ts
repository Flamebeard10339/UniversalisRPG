import { describe, expect, it } from 'vitest';
import { ACTION_MEMBER } from './namespace';
import { loadModule, loadUniverse } from './load';
import { ModuleSource } from './universe';

const module = (id: string, ...lines: string[]): ModuleSource => ({
  name: id,
  text: [`# info ${id}`, ...lines].join('\n'),
});

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
    expect(() => loadUniverse([BASE, stranger, module('mod', '# entity gull', 'peck:', '  give: stranger.rope')])).toThrow(/names stranger.rope, but stranger is not this module or one of its dependencies/);
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

describe('a - op declares nothing', () => {
  const RAT = module('base', '# entity rat', 'flags: alert');
  const patch = (...lines: string[]) => module('mod', 'dependencies: base', '# entity base.rat', ...lines);

  it('leaves a flag that never existed undeclared, so a reference to it fails the way any typo does', () => {
    expect(() => loadUniverse([RAT, patch('-flags: ghost', 'poke:', '  requires: ghost')])).toThrow(/names an unknown flag: ghost/);
  });

  it('says nothing about a removal that matched nothing, when nothing refers to it', () => {
    expect(loadUniverse([RAT, patch('-flags: ghost')]).entities.get('base.rat')!.flags).toEqual(['alert']);
  });

  it('still declares a name the same section adds after removing it, because the merge keeps it', () => {
    const patched = loadUniverse([RAT, patch('-flags: bolted', '+flags: bolted', 'poke:', '  requires: bolted')]).entities.get('base.rat')!;
    expect(patched.flags).toEqual(['alert', 'bolted']);
    expect(patched.actions[0].requires).toEqual({
      kind: 'reference',
      reference: { path: ['base', 'rat', 'bolted'] },
    });
  });
});

describe('a ~ dependency is visible whichever way the module names sort', () => {
  const target = module('target', '# item gem');
  const referrer = (id: string, ...lines: string[]) => module(id, 'dependencies: ~ target', ...lines);

  it('resolves a reference into it, which is the whole point of ~', () => {
    for (const id of ['aref', 'zref']) {
      const registry = loadUniverse([referrer(id, '# entity npc', 'rummage:', '  give: target.gem'), target]);
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

describe('names the engine keeps for itself', () => {
  it('refuses a flag called visits, which a condition reads as a node counter', () => {
    expect(() => loadUniverse([module('base', '# flag visits')])).toThrow(/# flag visits is reserved/);
    expect(() => loadUniverse([module('base', '# location camp', 'x: 0, y: 0', 'flags: visits')])).toThrow(/declares a flag named visits/);
  });

  it('reserves the module ids the engine actually owns', () => {
    for (const reserved of ['time', 'player', 'item', 'self']) {
      expect(() => loadUniverse([module(reserved, '# item rope')])).toThrow(/is a reserved module id/);
    }
    expect(() => loadUniverse([module('skills', '# item rope')])).not.toThrow();
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

  it('leaves a slot global, because it is a contract between modules that never met', () => {
    const armory = module('armory', '# item sword', 'slot: mainhand');
    const shop = module('shop', 'dependencies: armory', '# item shield', 'slot: offhand');
    const equipped = loadUniverse([armory, shop]);
    expect(equipped.items.get('armory.sword')!.slot).toBe('mainhand');
    expect(equipped.items.get('shop.shield')!.slot).toBe('offhand');
  });
});

describe('a new game begins in exactly one place', () => {
  it('refuses two starting locations rather than picking by source order', () => {
    expect(() => loadUniverse([module('base', '# location a', 'x: 0, y: 0', 'starting', '# location b', 'x: 1, y: 0', 'starting')])).toThrow(/is marked starting, and so is/);
  });
});

describe("an action's address is a member of the namespace", () => {
  const ISLA = module('isla', '# action pry', 'instant', 'say: creak', '# entity dresser', 'flags: searched', 'uses: pry', 'search drawer:', '  instant', '  say: dust', '# location shore', 'x: 0, y: 0', 'starting', 'light beacon:', '  instant', '  say: lit', '# item lamp', 'polish:', '  instant', '  say: shine');

  const namespace = () => loadUniverse([ISLA]).namespace;

  it('hangs an inline block under the object that heads it, on all three kinds that own one', () => {
    expect(namespace().has(ACTION_MEMBER, 'entity.isla.dresser.search-drawer')).toBe(true);
    expect(namespace().has(ACTION_MEMBER, 'location.isla.shore.light-beacon')).toBe(true);
    expect(namespace().has(ACTION_MEMBER, 'item.isla.lamp.polish')).toBe(true);
  });

  it('hangs an action a `uses:` brings under the entity that brings it', () => {
    expect(namespace().has(ACTION_MEMBER, 'entity.isla.dresser.pry')).toBe(true);
    expect(namespace().has(ACTION_MEMBER, 'entity.isla.pry')).toBe(false);
    expect(namespace().has(ACTION_MEMBER, 'item.isla.dresser.pry')).toBe(false);
  });

  it('puts it beside the flags of the same owner, under the one path grammar', () => {
    expect(namespace().has('flag', 'isla.dresser.searched')).toBe(true);
    expect(namespace().snapshot()).toContain(`${ACTION_MEMBER} entity.isla.dresser.search-drawer isla`);
  });

  it('declares nothing for an action nobody performs, so a slug is not a name on its own', () => {
    expect(namespace().has(ACTION_MEMBER, 'isla.dresser.polish')).toBe(false);
  });
});
