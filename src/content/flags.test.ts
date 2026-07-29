import { describe, expect, it } from 'vitest';
import { loadModule, loadUniverse } from './registry';
import { ModuleSource } from './universe';

const module = (id: string, ...lines: string[]): ModuleSource => ({ name: id, text: [`# info ${id}`, ...lines].join('\n') });

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
    expect(registry.locations.get('shore')!.actions[0].results[0]).toEqual({ kind: 'set', variable: 'shore.searched' });
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
    expect(registry.entities.get('thief')!.actions[0].requires).toEqual({ kind: 'reference', reference: { path: ['gate', 'unlocked'] } });
  });
});

describe('what the engine answers itself', () => {
  const asks = (condition: string): string[] => {
    const registry = loadModule(['# entity sage', 'muse:', `  requires: ${condition}`].join('\n'));
    const requires = registry.entities.get('sage')!.actions[0].requires as { reference?: { path: string[] }; left?: { path: string[] } };
    return (requires.reference ?? requires.left)!.path;
  };

  it('leaves the clock, the player sheet and a visit counter as written', () => {
    expect(asks('time > 10')).toEqual(['time']);
    expect(asks('player.race')).toEqual(['player', 'race']);
    expect(asks('greeting.visits >= 2')).toEqual(['greeting', 'visits']);
  });

  it('declares discovered on every location, because the engine sets it', () => {
    const registry = loadModule(['# location beach', 'x: 0, y: 0', '# entity gull', 'squawk:', '  requires: beach.discovered'].join('\n'));
    expect(registry.entities.get('gull')!.actions[0].requires).toEqual({ kind: 'reference', reference: { path: ['beach', 'discovered'] } });
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
        { kind: 'reference', reference: { path: ['base', 'door', 'unlocked'] } },
      ],
    });
  });

  it('is refused when the module was never declared a dependency', () => {
    expect(() => loadUniverse([BASE, module('mod', '# entity gull', 'squawk:', '  requires: base.tide-out')])).toThrow(/but base is not this module or one of its dependencies/);
  });

  it(`can be added to another module's object, and hangs under that object`, () => {
    const registry = loadUniverse([BASE, module('mod', 'dependencies: base', '# entity base.door', '+flags: bolted', 'bolt:', '  set: bolted')]);
    expect(registry.entities.get('base.door')!.flags).toEqual(['unlocked', 'bolted']);
    expect(registry.entities.get('base.door')!.actions[1].results[0]).toEqual({ kind: 'set', variable: 'base.door.bolted' });
  });

  it('goes away with the object it belonged to', () => {
    const doomed = module('doomed', '# entity door', 'flags: unlocked');
    const wrecker = module('wrecker', 'dependencies: doomed', '# remove entity.doomed.door', '# entity gull', 'squawk:', '  requires: door.unlocked');
    expect(() => loadUniverse([doomed, wrecker])).toThrow(/names an unknown flag: door.unlocked/);
  });
});
