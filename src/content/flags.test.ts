import { describe, expect, it } from 'vitest';
import { loadModule, loadUniverse } from './load';
import { ModuleSource } from './universe';

const module = (id: string, ...lines: string[]): ModuleSource => ({
  name: id,
  text: [`# info ${id}`, ...lines].join('\n'),
});

const written = (source: string, entity = 'door'): string => {
  const [action] = loadModule(source).entities.get(entity)!.actions;
  return (action.onSuccess ?? action.results)[0].kind === 'set' ? ((action.onSuccess ?? action.results)[0] as { variable: string }).variable : '';
};

describe('a flag is declared by whatever owns it', () => {
  it('hangs a module flag under the module, so no prefix has to be spelled by hand', () => {
    const registry = loadUniverse([module('tutorial', '# flag made-bread', '# entity oven', 'bake:', '  set: made-bread')]);
    expect(registry.entities.get('tutorial.oven')!.actions[0].results[0]).toEqual({ kind: 'set', variable: 'tutorial.made-bread' });
  });

  it('hangs an object flag under the object that lists it', () => {
    expect(written(['# entity door', 'flags: unlocked', 'pick:', '  set: unlocked'].join('\n'))).toBe('door.unlocked');
  });

  it('lets a location own flags the same way an entity does', () => {
    const registry = loadModule(['# location shore', 'flags: searched', 'search:', '  set: searched'].join('\n'));
    expect(registry.locations.get('shore')!.actions[0].results[0]).toEqual({
      kind: 'set',
      variable: 'shore.searched',
    });
  });

  it('refuses a flag nobody declared, which is where a typo used to read false forever', () => {
    expect(() => loadModule(['# entity door', 'flags: unlocked', 'pick:', '  set: unlokced'].join('\n'))).toThrow(/names an unknown flag: unlokced/);
    expect(() => loadModule(['# entity door', 'peek:', '  requires: unlocked'].join('\n'))).toThrow(/names an unknown flag: unlocked/);
  });
});

describe('a bare name means the flag of the object it was written in', () => {
  const TWO_DOORS = ['# entity door', 'flags: unlocked', 'pick:', '  set: unlocked', '# entity gate', 'flags: unlocked', 'force:', '  set: unlocked'].join('\n');

  it('picks the enclosing object even where another declares the same name', () => {
    expect(written(TWO_DOORS, 'door')).toBe('door.unlocked');
    expect(written(TWO_DOORS, 'gate')).toBe('gate.unlocked');
  });

  it('names both candidates when the reference is written outside either of them', () => {
    const outside = [TWO_DOORS, '# entity thief', 'gloat:', '  requires: unlocked'].join('\n');
    expect(() => loadModule(outside)).toThrow(/ambiguous between door.unlocked and gate.unlocked/);
  });

  it(`reads another object's flag by naming that object, which is what a bare one could not do`, () => {
    const registry = loadModule([TWO_DOORS, '# entity thief', 'gloat:', '  requires: gate.unlocked'].join('\n'));
    expect(registry.entities.get('thief')!.actions[0].requires).toEqual({
      kind: 'reference',
      reference: { path: ['gate', 'unlocked'] },
    });
  });
});

describe('what the engine answers itself', () => {
  const asks = (condition: string): string[] => {
    const registry = loadModule(['# entity sage', 'muse:', `  requires: ${condition}`].join('\n'));
    const requires = registry.entities.get('sage')!.actions[0].requires as {
      reference?: { path: string[] };
      left?: { path: string[] };
    };
    return (requires.reference ?? requires.left)!.path;
  };

  it('leaves the clock and the player sheet as written, because nobody declares them', () => {
    expect(asks('time > 10')).toEqual(['time']);
    expect(asks('player.race')).toEqual(['player', 'race']);
  });

  it('declares discovered on every location, because the engine sets it', () => {
    const registry = loadModule(['# location beach', 'x: 0, y: 0', '# entity gull', 'squawk:', '  requires: beach.discovered'].join('\n'));
    expect(registry.entities.get('gull')!.actions[0].requires).toEqual({
      kind: 'reference',
      reference: { path: ['beach', 'discovered'] },
    });
  });
});

describe('a dialogue node is a member too, and its visits are counted against its path', () => {
  const TWO_GREETINGS = ['# entity miki', '# dialogue miki', 'owner = miki', 'node greeting:', '  Hello.', '# entity gull', '# dialogue gull', 'owner = gull', 'node greeting:', '  Squawk.'].join('\n');

  const asked = (source: string, dialogue = 'miki'): string[] => {
    const node = loadModule(source)
      .dialogues.get(dialogue)!
      .nodes.find((each) => each.when)!;
    return ((node.when as { left: { path: string[] } }).left ?? (node.when as unknown as { reference: { path: string[] } }).reference).path;
  };

  it('counts two dialogues that each have a greeting apart, where one bare key used to conflate them', () => {
    const source = [TWO_GREETINGS, 'node annoyed:', '  when: greeting.visits >= 2', '  Still you.'].join('\n');
    expect(asked(source, 'gull')).toEqual(['gull', 'greeting', 'visits']);
  });

  it(`reads its own dialogue's node before any other, and another dialogue's by naming it`, () => {
    const own = [TWO_GREETINGS.replace('  Squawk.', '  Squawk.\nnode annoyed:\n  when: greeting.visits >= 2\n  Still you.'), ''].join('\n');
    expect(asked(own, 'gull')).toEqual(['gull', 'greeting', 'visits']);
    const other = [TWO_GREETINGS, 'node annoyed:', '  when: miki.greeting.visits >= 2', '  Still you.'].join('\n');
    expect(asked(other, 'gull')).toEqual(['miki', 'greeting', 'visits']);
  });

  it('refuses a node nobody declared', () => {
    expect(() => loadModule([TWO_GREETINGS, 'node annoyed:', '  when: grating.visits >= 2', '  Still you.'].join('\n'))).toThrow(/names an unknown node: grating/);
  });
});

describe('a flag across module boundaries', () => {
  const BASE = module('base', '# flag tide-out', '# entity door', 'flags: unlocked', 'pick:', '  set: unlocked');

  it('is reached by a dependency without naming the module, and by path when shadowed', () => {
    const registry = loadUniverse([BASE, module('mod', 'dependencies: base', '# entity gull', 'squawk:', '  requires: tide-out and door.unlocked')]);
    expect(registry.entities.get('mod.gull')!.actions[0].requires).toEqual({
      kind: 'and',
      conditions: [
        { kind: 'reference', reference: { path: ['base', 'tide-out'] } },
        {
          kind: 'reference',
          reference: { path: ['base', 'door', 'unlocked'] },
        },
      ],
    });
  });

  it('is refused when the module was never declared a dependency', () => {
    expect(() => loadUniverse([BASE, module('mod', '# entity gull', 'squawk:', '  requires: base.tide-out')])).toThrow(/but base is not this module or one of its dependencies/);
  });

  it(`can be added to another module's object, and hangs under that object`, () => {
    const registry = loadUniverse([BASE, module('mod', 'dependencies: base', '# entity base.door', '+flags: bolted', 'bolt:', '  set: bolted')]);
    expect(registry.entities.get('base.door')!.flags).toEqual(['unlocked', 'bolted']);
    expect(registry.entities.get('base.door')!.actions[1].results[0]).toEqual({
      kind: 'set',
      variable: 'base.door.bolted',
    });
  });

  it('goes away with the object it belonged to', () => {
    const doomed = module('doomed', '# entity door', 'flags: unlocked');
    const wrecker = module('wrecker', 'dependencies: doomed', '# remove entity.doomed.door', '# entity gull', 'squawk:', '  requires: door.unlocked');
    expect(() => loadUniverse([doomed, wrecker])).toThrow(/names an unknown flag: doomed.door.unlocked/);
  });
});

describe('a flag a field edit takes away', () => {
  const BASE = module('base', '# entity door', 'flags: unlocked');
  const cut = (id: string): ModuleSource => module(id, 'dependencies: base', '# entity base.door', '-flags: unlocked');
  const wants = (id: string): ModuleSource => module(id, 'dependencies: base', '# entity gull', 'squawk:', '  requires: base.door.unlocked');
  const dangles = /names an unknown flag: base.door.unlocked/;

  it('goes away with the value, so a reference the edit stranded no longer resolves', () => {
    expect(() => loadUniverse([BASE, cut('mod'), wants('watcher')])).toThrow(dangles);
  });

  it('fails whichever module names it first, because what survives is decided at merge', () => {
    expect(() => loadUniverse([BASE, cut('aaa-cut'), wants('zzz-wants')])).toThrow(dangles);
    expect(() => loadUniverse([BASE, wants('aaa-wants'), cut('zzz-cut')])).toThrow(dangles);
  });

  it('stays when a + in the same section puts it back, because the merged section is what is asked', () => {
    const readd = module('mod', 'dependencies: base', '# entity base.door', '-flags: unlocked', '+flags: unlocked', '# entity gull', 'squawk:', '  requires: base.door.unlocked');
    expect(loadUniverse([BASE, readd]).entities.get('base.door')!.flags).toEqual(['unlocked']);
  });

  it('leaves discovered alone when a location edits its flags, because a location owns a member it never lists', () => {
    const shore = module('base', '# location beach', 'x: 0, y: 0', 'flags: searched');
    const strip = module('mod', 'dependencies: base', '# location base.beach', '-flags: searched', '# entity gull', 'squawk:', '  requires: base.beach.discovered');
    const registry = loadUniverse([shore, strip]);
    expect(registry.locations.get('base.beach')!.flags).toEqual([]);
    expect(registry.namespace.has('flag', 'base.beach.discovered')).toBe(true);
  });
});

describe('a member key is owned by every kind that declares it', () => {
  const twins = module('base', '# location beach', 'x: 0, y: 0', 'flags: searched', 'search:', '  set: searched', '# entity beach', 'flags: searched');

  it('keeps the location its flag when an entity of the same id edits that flag away', () => {
    const strip = module('mod', 'dependencies: base', '# entity base.beach', '-flags: searched');
    const registry = loadUniverse([twins, strip]);
    expect(registry.entities.get('base.beach')!.flags).toEqual([]);
    expect(registry.locations.get('base.beach')!.flags).toEqual(['searched']);
    expect(registry.namespace.has('flag', 'base.beach.searched')).toBe(true);
  });

  it('keeps a location discoverable when an entity of the same id edits discovered away', () => {
    const shadow = module('base', '# location beach', 'x: 0, y: 0', 'starting', '# entity beach', 'flags: discovered');
    const strip = module('mod', 'dependencies: base', '# entity base.beach', '-flags: discovered');
    expect(loadUniverse([shadow, strip]).namespace.has('flag', 'base.beach.discovered')).toBe(true);
  });

  it('does not let a dialogue node hold an entity flag of the same key alive, because they are different kinds', () => {
    const chat = module('base', '# entity chat', 'flags: greet', '# dialogue chat', 'owner = chat', 'node greet:', '  Hello.');
    const strip = module('mod', 'dependencies: base', '# entity base.chat', '-flags: greet');
    const registry = loadUniverse([chat, strip]);
    expect(registry.namespace.has('flag', 'base.chat.greet')).toBe(false);
    expect(registry.namespace.has('node', 'base.chat.greet')).toBe(true);
  });

  it('goes away when the module that added it is not the one that created the object', () => {
    const door = module('base', '# entity door', 'flags: unlocked');
    const adds = module('aaa-adds', 'dependencies: base', '# entity base.door', '+flags: sealed');
    const cuts = module('zzz-cuts', 'dependencies: base', '# entity base.door', '-flags: sealed');
    expect(loadUniverse([door, adds, cuts]).namespace.has('flag', 'base.door.sealed')).toBe(false);
    expect(loadUniverse([door, adds]).namespace.has('flag', 'base.door.sealed')).toBe(true);
  });
});

describe('an action a field edit takes away', () => {
  const BASE = module('base', '# action pry', 'instant', 'say: creak', '# entity dresser', 'uses: pry');
  const cut = (id: string): ModuleSource => module(id, 'dependencies: base', '# entity base.dresser', '-uses: pry');
  const wants = (id: string): ModuleSource => module(id, 'dependencies: base', '# test walk', 'use: entity.base.dresser.pry');
  const dangles = /names an unknown action-slug: entity.base.dresser.pry/;

  it('goes away with the value, so a use: the edit stranded no longer resolves', () => {
    expect(() => loadUniverse([BASE, wants('watcher')])).not.toThrow();
    expect(() => loadUniverse([BASE, cut('mod'), wants('watcher')])).toThrow(dangles);
  });

  it('fails whichever module names it first, because what survives is decided at merge', () => {
    expect(() => loadUniverse([BASE, cut('aaa-cut'), wants('zzz-wants')])).toThrow(dangles);
    expect(() => loadUniverse([BASE, wants('aaa-wants'), cut('zzz-cut')])).toThrow(dangles);
  });

  it('stays when a + in the same section puts it back, because the merged section is what is asked', () => {
    const readd = module('mod', 'dependencies: base', '# entity base.dresser', '-uses: pry', '+uses: pry');
    expect(
      loadUniverse([BASE, readd, wants('watcher')])
        .entities.get('base.dresser')!
        .actions.map((action) => action.label),
    ).toEqual(['pry']);
  });

  const shelf = module('base', '# entity shelf', 'dust it:', '  instant', '  say: puff');
  const dusts = module('watcher', 'dependencies: base', '# test walk', 'use: entity.base.shelf.dust-it');

  it('takes an inline block away with the block, not only with the object that headed it', () => {
    const cutBlock = module('mod', 'dependencies: base', '# entity base.shelf', '-dust it:');

    expect(() => loadUniverse([shelf, dusts])).not.toThrow();
    expect(loadUniverse([shelf, cutBlock]).entities.get('base.shelf')!.actions).toEqual([]);
    expect(() => loadUniverse([shelf, cutBlock, dusts])).toThrow(/names an unknown action-slug: entity.base.shelf.dust-it/);
  });

  it('takes it with the object too, when the whole object goes', () => {
    expect(() => loadUniverse([shelf, module('mod', 'dependencies: base', '# remove entity.base.shelf'), dusts])).toThrow(/names an unknown entity: base.shelf/);
  });
});
