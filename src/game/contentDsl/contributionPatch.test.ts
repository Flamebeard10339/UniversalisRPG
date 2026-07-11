import { describe, expect, it } from 'vitest';
import { applyModulesToBundle } from '../contentModules';
import type { ContentBundle } from '../types';
import { compileDsl } from './compiler';
import { diffModuleToPatch } from './contributionPatch';

const emptyBundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: 'base', version: '1.0.0', author: 'test', locales: ['en'], files: [] },
  locations: [],
  entities: [],
  actions: [],
  skills: [],
  stats: [],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  locales: { en: {} },
});


const BASE = `# info
id: core-town
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: town

# flags
statue-inspected

# location town-square
x: 0, y: 0
starting
title: Town Square
examine: A quiet plaza.
tags: town

## entity fountain
examine: Water trickles.

## entity statue
title: Statue
examine: A weathered figure.

## entity mirror
examine: You see yourself.

# item coin
title: Coin
tags: +1 attack
`;

describe('diffModuleToPatch', () => {
  it('returns null when nothing changed', () => {
    expect(diffModuleToPatch(BASE, BASE, 'core-town').moduleSource).toBeNull();
  });

  it('emits only the changed field for a location move, as ## upsert location', () => {
    const edited = BASE.replace('x: 0, y: 0', 'x: 1, y: 0');
    const { moduleSource } = diffModuleToPatch(BASE, edited, 'core-town');
    expect(moduleSource).toContain('# patch core-town');
    expect(moduleSource).toContain('## upsert location town-square\nx: 1');
    // Unchanged fields are not re-emitted.
    expect(moduleSource).not.toContain('title: Town Square');
    expect(moduleSource).not.toContain('examine: A quiet plaza.');
  });

  it('emits a re-headed verbatim block for a changed entity and a remove op with the updated membership list', () => {
    const edited = BASE
      .replace('## entity mirror\nexamine: You see yourself.\n\n', '')
      .replace('title: Statue', 'title: Bronze Statue');
    const { moduleSource } = diffModuleToPatch(BASE, edited, 'core-town') as { moduleSource: string };
    expect(moduleSource).toContain('## replace entity statue\ntitle: Bronze Statue');
    expect(moduleSource).toContain('## remove entity mirror');
    // Membership change is captured on the location op.
    expect(moduleSource).toContain('entities: fountain, statue');
    expect(moduleSource).not.toContain('mirror,');
  });

  it('warns (does not silently drop) an edit the patch grammar cannot express', () => {
    const edited = BASE.replace('# item coin\ntitle: Coin\ntags: +1 attack\n', '# dialogue elder\nstart (elder): Hello.\n');
    const { warnings } = diffModuleToPatch(BASE, edited, 'core-town');
    expect(warnings.some((warning) => warning.includes('dialogue'))).toBe(true);
  });

  // The load-bearing test: whatever the differ emits must, once compiled and
  // applied on top of the base module, reproduce the same bundle as compiling
  // the author's edited source directly. A patch that "looks right" but
  // doesn't round-trip is worthless.
  it('round-trips: base + generated patch === the edited source, applied', () => {
    const edited = BASE
      .replace('x: 0, y: 0', 'x: 1, y: 0')
      .replace('## entity mirror\nexamine: You see yourself.\n\n', '')
      .replace('title: Statue\nexamine: A weathered figure.', 'title: Bronze Statue\nexamine: A polished figure.\npose: say: It strikes a pose.')
      .replace('## entity fountain\nexamine: Water trickles.\n', '## entity fountain\nexamine: Water trickles.\n\n## entity bench\nexamine: A wooden bench.\n')
      .replace('tags: +1 attack', 'tags: +3 attack');

    // Location membership is implicit in the nested `## entity` order (base:
    // fountain/statue/mirror; edited: fountain/bench/statue) — the differ
    // derives the `entities:` list op from that, no membership line needed.
    const { moduleSource, warnings } = diffModuleToPatch(BASE, edited, 'core-town');
    expect(warnings).toEqual([]);
    if (!moduleSource) throw new Error('expected a patch module');

    const base = compileDsl(BASE).module;
    const patch = compileDsl(moduleSource).module;
    const editedDirect = compileDsl(edited).module;

    const viaPatch = applyModulesToBundle(emptyBundle(), [base, patch]);
    const viaDirect = applyModulesToBundle(emptyBundle(), [editedDirect]);

    expect(viaPatch.issues.filter((issue) => issue.severity === 'error')).toEqual([]);

    const townViaPatch = viaPatch.bundle.locations.find((location) => location.id === 'town-square');
    const townViaDirect = viaDirect.bundle.locations.find((location) => location.id === 'town-square');
    expect(townViaPatch?.position).toEqual(townViaDirect?.position);
    expect(townViaPatch?.entities).toEqual(townViaDirect?.entities);

    const ids = (bundle: ContentBundle) => (bundle.entities ?? []).map((entity) => entity.id).sort();
    expect(ids(viaPatch.bundle)).toEqual(ids(viaDirect.bundle));

    const benchViaPatch = viaPatch.bundle.entities?.find((entity) => entity.id === 'bench');
    expect(benchViaPatch).toBeDefined();
    expect(viaPatch.bundle.entities?.find((entity) => entity.id === 'mirror')).toBeUndefined();

    // Renamed statue title resolves to the edited text.
    expect(viaPatch.bundle.locales.en['entity.statue.title']).toBe('Bronze Statue');
    expect(viaPatch.bundle.locales.en['entity.statue.title']).toBe(viaDirect.bundle.locales.en['entity.statue.title']);
    // The new pose action exists on the patched statue.
    const statueViaPatch = viaPatch.bundle.entities?.find((entity) => entity.id === 'statue');
    expect(statueViaPatch?.actions?.some((action) => action.id === 'pose')).toBe(true);
  });
});
