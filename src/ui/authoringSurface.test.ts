import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contentSectionMaps, sectionFor, sectionKinds } from '../content/sections';
import { mapOf } from '../content/registry';
import { loadUniverseWithDiagnostics } from '../content/load';
import { COMMANDS } from '../runtime/command';
import {
  addressable,
  deleteLine,
  kindsOffered,
  MAPPED_KIND,
  NOWHERE,
  offeredBy,
  shadowed,
  SHOW_LINE,
  stage,
  SURFACES,
  type Section,
  type Standing,
} from './authoringSurface';
import { createDriver } from './driver';
import { SHIPPED_SOURCES } from './shippedContent';

const here = fileURLToPath(new URL('.', import.meta.url));

const addressed = addressable(SHIPPED_SOURCES);

const REGISTRY = loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry;

const GUIDE_HOUSE: Standing = {
  location: 'tutorial-island.guide-house',
  entities: ['tutorial-island.miki', 'tutorial-island.front-door', 'tutorial-island.oven'],
};

const surfacesOffering = (section: Section, standing: Standing): string[] =>
  SURFACES.filter((surface) => offeredBy([section], standing, surface).length === 1);

const madeUp = (kind: string): Section => ({ kind, address: 'somewhere.nothing-yet', text: `# ${kind} nothing-yet`, module: 'somewhere', staged: false });

describe('the three surfaces are three predicates over one list (c7)', () => {
  it('reads the modules it is a rule about', () => {
    expect(addressed.length).toBeGreaterThan(100);
    expect(kindsOffered(addressed).length).toBeGreaterThan(5);
  });

  for (const standing of [NOWHERE, GUIDE_HOUSE]) {
    it(`offers every section by exactly one surface, standing in ${standing.location || 'nowhere'}`, () => {
      for (const section of addressed) {
        expect(surfacesOffering(section, standing), `${section.kind} ${section.address}`).toHaveLength(1);
      }
    });
  }

  it('offers a section of every kind the load path can parse', () => {
    // Including the kinds the key/value engine does not read: a surface that
    // offered only the schema kinds would pass a walk over the schemas alone.
    expect(sectionKinds().filter((kind) => sectionFor(kind)!.schema === undefined)).not.toHaveLength(0);

    for (const kind of sectionKinds()) {
      expect(surfacesOffering(madeUp(kind), GUIDE_HOUSE), kind).toHaveLength(1);
    }
  });

  it('addresses every section the loaded registry holds', () => {
    const named = new Set(addressed.map((section) => `${section.kind} ${section.address}`));
    let checked = 0;

    for (const [kind, map] of contentSectionMaps()) {
      for (const key of mapOf(REGISTRY, map).keys()) {
        checked += 1;
        expect(named, `${kind} ${key}`).toContain(`${kind} ${key}`);
      }
    }

    expect(checked).toBeGreaterThan(50);
  });

  it('draws every location on the map surface but the one being stood in', () => {
    const mapped = offeredBy(addressed, GUIDE_HOUSE, 'map');
    const elsewhere = [...REGISTRY.locations.keys()].filter((id) => id !== GUIDE_HOUSE.location);

    expect(elsewhere.length).toBeGreaterThan(0);
    expect(mapped.map((section) => section.address).sort()).toEqual(elsewhere.sort());
    expect([...new Set(mapped.map((section) => section.kind))]).toEqual([MAPPED_KIND]);
    expect(offeredBy(addressed, NOWHERE, 'map').length).toBe(mapped.length + 1);
  });

  it('narrows Local to where the player is standing and to what stands there with them', () => {
    const local = offeredBy(addressed, GUIDE_HOUSE, 'local');

    expect([...new Set(local.map((section) => section.address))].sort()).toEqual([GUIDE_HOUSE.location, ...GUIDE_HOUSE.entities].sort());
    expect(local.filter((section) => section.kind === MAPPED_KIND).map((section) => section.address)).toEqual([GUIDE_HOUSE.location]);
    expect(local.length).toBeGreaterThan(GUIDE_HOUSE.entities.length);
    expect(offeredBy(addressed, NOWHERE, 'local')).toEqual([]);
    expect(offeredBy(addressed, NOWHERE, 'global').length).toBe(offeredBy(addressed, GUIDE_HOUSE, 'global').length + local.length - 1);
  });

  it('shadows a shipped section with the copy staged over it, rather than offering both', () => {
    const staged = { name: 'local-changes', text: '# info local-changes\nversion: 0.0.0\n\n# location tutorial-island.beach\nx: 4, y: 0\n' };
    const withLocal = addressable([...SHIPPED_SOURCES, staged]);
    const beach = withLocal.filter((section) => section.address === 'tutorial-island.beach');

    expect(beach).toHaveLength(1);
    expect(beach[0].staged).toBe(true);
    expect(beach[0].text).toContain('x: 4, y: 0');
    expect(withLocal).toHaveLength(addressed.length);
  });
});

const DSL = COMMANDS.find((command) => command.name === '/dsl')!;

const parsed = (line: string): unknown => DSL.parse(line.slice('/dsl '.length), undefined as never);

describe('every control sends a line the shared table parses (c2)', () => {
  it('stages every section the shipped modules hold, as a line /dsl accepts', () => {
    for (const section of addressed) {
      const staged = stage(section.text);
      expect(staged, `${section.kind} ${section.address}`).toHaveProperty('line');
      const line = (staged as { line: string }).line;
      expect(line.startsWith(`/dsl ${section.kind} ${section.address} `) || line === `/dsl ${section.kind} ${section.address}`, line).toBe(true);
      expect(parsed(line), line).toMatchObject({ kind: section.kind, id: section.address });
    }
  });

  it('refuses text that is not one section, rather than sending half of one', () => {
    expect(stage('x: 1')).toEqual({ refused: 'an edit starts with the section it is: # <kind> <id>' });
    expect(stage('# location one\n\n# location two')).toEqual({ refused: 'one section at a time, not 2' });
    expect(stage('# location')).toHaveProperty('refused');
    expect(stage('# location a\nsay: one | two')).toHaveProperty('refused');
  });

  it('puts back what it was given, through the command and the store', () => {
    const oneEach = [...new Map(addressed.map((section) => [section.kind, section])).values()];
    expect(oneEach.length).toBeGreaterThan(5);

    for (const section of oneEach) {
      const driver = createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined });
      driver.send((stage(section.text) as { line: string }).line);
      const held = driver.localChanges() ?? '';
      const staged = addressable([{ name: 'local-changes', text: held }]);

      expect(staged.map((each) => each.address), `${section.kind} ${section.address}`).toEqual([section.address]);
      expect(staged[0].text.split('\n')).toEqual(section.text.split('\n').filter((line, at) => at === 0 || line.trim() !== ''));
    }
  });

  it('deletes and exports by lines the same table parses', () => {
    expect(deleteLine({ kind: 'location', address: 'tutorial-island.beach' })).toBe('/local delete location tutorial-island.beach');
    const local = COMMANDS.find((command) => command.name === '/local')!;
    expect(local.parse('delete location tutorial-island.beach', undefined as never)).toEqual({ op: 'delete', kind: 'location', id: 'tutorial-island.beach' });
    expect(local.parse(SHOW_LINE.slice('/local '.length), undefined as never)).toEqual({ op: 'show' });
  });
});

function modulesUnder(directory: string, prefix: string): Array<{ file: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path, `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [{ file: `${prefix}/${entry.name}`, text: readFileSync(path, 'utf8') }];
  });
}

const LOCAL_CHANGES = readFileSync(join(here, '..', 'content', 'localChanges.ts'), 'utf8');

const EXPORTED = [...LOCAL_CHANGES.matchAll(/^export (?:const|function|interface|type) (\w+)/gm)].map(([, name]) => name);

const ADDRESSED_BY_NAME = 'LOCAL_CHANGES_MODULE_ID';

describe('no surface goes around the one load-and-adopt path (c2)', () => {
  it('reads both trees it is a rule about', () => {
    expect(EXPORTED).toEqual(expect.arrayContaining(['upsertLocalSection', 'deleteLocalSection', 'renderLocalChangesModule', ADDRESSED_BY_NAME]));
    expect(modulesUnder(here, 'src/ui').length).toBeGreaterThan(20);
  });

  it('reaches the local-changes module for its name and for nothing else', () => {
    const modules = [...modulesUnder(here, 'src/ui'), { file: 'src/main.tsx', text: readFileSync(join(here, '..', 'main.tsx'), 'utf8') }];

    for (const module of modules) {
      for (const name of EXPORTED) {
        if (name === ADDRESSED_BY_NAME) continue;
        expect(module.text, `${module.file} reaches ${name}`).not.toContain(name);
      }
      expect(module.text, `${module.file} adopts a registry of its own`).not.toContain('adoptRegistry');
    }
  });
});

const ADDRESSABLE_KINDS = sectionKinds().filter((kind) => kind !== 'info');

const asModule = (name: string, sections: readonly string[]): { name: string; text: string } => ({
  name,
  text: [`# info ${name}`, 'version: 1.0.0', '', ...sections].join('\n') + '\n',
});

describe('a local section that shadows a base section is reported, for every kind (c3)', () => {
  it('reports the address and the file, for every kind a module can declare', () => {
    expect(ADDRESSABLE_KINDS.length).toBeGreaterThan(10);

    for (const kind of ADDRESSABLE_KINDS) {
      const base = asModule('shipped', [`# ${kind} thing`]);
      const address = addressable([base])[0].address;
      const local = { name: 'local-changes', text: `# info local-changes\nversion: 0.0.0\npack: local\n\n# ${kind} ${address}\n` };

      expect(shadowed([base, local]), kind).toEqual([{ kind, address, modules: ['shipped'] }]);
    }
  });

  it('reports a copy that matches its base byte for byte, because that is the copy that hides an edit', () => {
    const base = asModule('shipped', ['# item lamp', 'title: Lamp']);
    const same = { name: 'local-changes', text: `# info local-changes\nversion: 0.0.0\npack: local\n\n# item shipped.lamp\ntitle: Lamp\n` };
    const different = { name: 'local-changes', text: `# info local-changes\nversion: 0.0.0\npack: local\n\n# item shipped.lamp\ntitle: Lantern\n` };

    expect(shadowed([base, same])).toEqual(shadowed([base, different]));
    expect(shadowed([base, same])).toHaveLength(1);
  });

  it('says nothing about a staged section no shipped module declares, or about the shipped modules alone', () => {
    const base = asModule('shipped', ['# item lamp', 'title: Lamp']);
    const fresh = { name: 'local-changes', text: `# info local-changes\nversion: 0.0.0\npack: local\n\n# item torch\ntitle: Torch\n` };

    expect(shadowed([base, fresh])).toEqual([]);
    expect(shadowed([base])).toEqual([]);
    expect(shadowed([base, asModule('shipped', ['# item lamp', 'title: Lamp'])])).toEqual([]);
  });

  it('reports every staged copy that shadows one, not merely the first', () => {
    const base = asModule('shipped', ['# item lamp', 'title: Lamp', '', '# location cave', 'x: 0, y: 0']);
    const local = {
      name: 'local-changes',
      text: '# info local-changes\nversion: 0.0.0\npack: local\n\n# item shipped.lamp\ntitle: Mine\n\n# location shipped.cave\nx: 1, y: 1\n\n# item torch\ntitle: Torch\n',
    };

    expect(shadowed([base, local])).toEqual([
      { kind: 'item', address: 'shipped.lamp', modules: ['shipped'] },
      { kind: 'location', address: 'shipped.cave', modules: ['shipped'] },
    ]);
  });
});
