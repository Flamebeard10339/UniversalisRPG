import { describe, expect, it } from 'vitest';
import { loadUniverse, loadUniverseWithDiagnostics, UNATTRIBUTED } from './load';
import type { ModuleSource } from './universe';

const WATERS: ModuleSource = {
  name: 'waters',
  text: ['# info waters', 'version: 1.0.0', '', '# stat vigor-max', 'base: 10', '', '# resource vigor', 'max: vigor-max', '', '# event line-parted', 'resource: vigor', 'trigger: on empty'].join('\n'),
};

const UNSEEN: ModuleSource = {
  name: 'deeps',
  text: ['# info deeps', 'version: 1.0.0', '', '# stat depth-max', 'base: 10', '', '# resource depth', 'max: depth-max', '', '# event line-parted', 'resource: depth', 'trigger: on empty'].join('\n'),
};

const shore = (...body: string[]): ModuleSource => ({
  name: 'shore',
  text: ['# info shore', 'version: 1.0.0', 'dependencies:', '  waters', '', '# location camp', 'x: 0, y: 0', 'starting', 'entities:', '  angler', '', '# entity angler', 'title: Angler', 'stats: vigor-max 10', ...body].join('\n'),
});

const angler = (...body: string[]) => loadUniverse([WATERS, UNSEEN, shore(...body)]).entities.get('shore.angler')!;

describe('an entry heading may name the module its subject comes from', () => {
  it('lands a qualified handler on the event that module declares', () => {
    expect(angler('on waters.line-parted:', '  say: The line goes slack.').handlers).toEqual([{ event: 'waters.line-parted', results: [{ kind: 'say', text: 'The line goes slack.', key: 'shore.entity.angler.say.0' }] }]);
  });

  it('reads the unqualified form to the same event, so the two are one thing written two ways', () => {
    expect(angler('on line-parted:', '  say: The line goes slack.').handlers).toEqual(angler('on waters.line-parted:', '  say: The line goes slack.').handlers);
  });

  it('refuses one naming a module this one cannot see, in the words every unreachable id is refused in', () => {
    expect(() => loadUniverse([WATERS, UNSEEN, shore('on deeps.line-parted:', '  say: hm')])).toThrow(/names deeps.line-parted, but deeps is not this module or one of its dependencies/);
  });

  it('refuses a heading whose dot joins nothing, which is no heading at all', () => {
    expect(() => loadUniverse([WATERS, UNSEEN, shore('on waters.:', '  say: hm')])).toThrow(/unexpected content: "on waters\.:"/);
  });
});

describe('a build failure nobody owns', () => {
  const SILENT: ModuleSource = {
    name: 'silent',
    text: ['# info silent', 'version: 1.0.0', '', '# entity mute', 'title: Mute', 'examine: @@@ say something here'].join('\n'),
  };

  const loaded = loadUniverseWithDiagnostics([WATERS, SILENT]);

  it('really is a failure, or there is nothing below to be attributed', () => {
    expect(loaded.diagnostics).toHaveLength(1);
    expect(loaded.diagnostics[0]!.message).toContain('note');
  });

  it('says the world rather than naming whichever module happened to be first', () => {
    expect(loaded.diagnostics[0]!.moduleId).toBe(UNATTRIBUTED);
    expect(loaded.diagnostics[0]!.sourceName).toBe(UNATTRIBUTED);
  });

  it('disables nothing, where blaming a module would have disabled an innocent one', () => {
    expect(loaded.disabledModules).toEqual([]);
    expect(loaded.loadedModules).toEqual([]);
  });
});
