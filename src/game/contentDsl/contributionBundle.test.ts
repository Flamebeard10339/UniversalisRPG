import { describe, expect, it } from 'vitest';
import { compileDsl } from './compiler';
import { buildContributionBundle, moduleIdOf, parseModules } from './contributionBundle';

const CORE = `# info
id: core-town
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: town

# location town-square
x: 0, y: 0
starting
title: Town Square
examine: A quiet plaza.
tags: town

## entity fountain
examine: Water trickles.
`;

const AUTHORED = `# info
id: my-new-wing
version: 1.0.0
universe: base
author: contributor
game_version: 1.0

# item lantern
title: Lantern
examine: A brass lantern.
`;

describe('parseModules', () => {
  it('splits a multi-module file on # info boundaries and round-trips ids', () => {
    const bundle = `${AUTHORED}\n${CORE}`;
    const modules = parseModules(bundle);
    expect(modules).toHaveLength(2);
    expect(modules.map(moduleIdOf)).toEqual(['my-new-wing', 'core-town']);
    // Each split chunk is itself a compilable module.
    for (const source of modules) expect(() => compileDsl(source)).not.toThrow();
  });

  it('ignores content before the first # info', () => {
    expect(parseModules('stray text\n\n# info\nid: x\nversion: 1.0.0\nuniverse: base\nauthor: a\ngame_version: 1.0\n')).toHaveLength(1);
  });
});

describe('buildContributionBundle', () => {
  it('emits authored modules verbatim and core edits as -PATCHES, and nothing for unchanged drafts', () => {
    const editedCore = CORE.replace('x: 0, y: 0', 'x: 1, y: 0');
    const { source, moduleIds, warnings } = buildContributionBundle([
      { moduleId: 'my-new-wing', baselineSource: '# info\nid: my-new-wing\nversion: 1.0.0\nuniverse: base\nauthor: contributor\ngame_version: 1.0\n', currentSource: AUTHORED, isCoreModule: false },
      { moduleId: 'core-town', baselineSource: CORE, currentSource: editedCore, isCoreModule: true },
      { moduleId: 'untouched', baselineSource: CORE, currentSource: CORE, isCoreModule: true },
    ]);
    expect(warnings).toEqual([]);
    expect(moduleIds).toEqual(['my-new-wing', 'core-town-PATCHES']);
    if (!source) throw new Error('expected a bundle');
    // Authored module first, verbatim; generated patch after.
    expect(source.indexOf('id: my-new-wing')).toBeLessThan(source.indexOf('id: core-town-PATCHES'));
    expect(source).toContain('## upsert location town-square');
    // The whole bundle splits back into two compilable modules.
    const modules = parseModules(source);
    expect(modules).toHaveLength(2);
    for (const moduleSource of modules) expect(() => compileDsl(moduleSource)).not.toThrow();
  });

  it('returns null when no draft changed', () => {
    expect(buildContributionBundle([{ moduleId: 'core-town', baselineSource: CORE, currentSource: CORE, isCoreModule: true }]).source).toBeNull();
  });
});
