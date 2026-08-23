import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { engineLocale } from '../content/engineLocale';
import { contentSectionMaps, sectionFor, sectionKinds } from '../content/sections';
import type { ModuleSource } from '../content/universe';
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
  removeLine,
  searching,
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

const SPARE: ModuleSource = {
  name: 'spare',
  text: '# info spare\nversion: 0.0.0\npack: test\n\n# location camp\nx: 0, y: 0\nstarting\n\n# item coin\ntitle: Coin\n',
};

const spoken = (driver: ReturnType<typeof createDriver>): string[] => driver.snapshot().transcript.entries.map((entry) => String(entry.text));

const sectionKeyOf = (section: Section): string => `${section.kind} ${section.address}`;

const REGISTRY = loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry;

// Any real location with a few entities standing in it proves the same rule;
// naming one by hand would go stale the day an author renamed it.
const HOUSE = [...REGISTRY.locations.values()].find((location) => location.entities.length >= 3)!;
const GUIDE_HOUSE: Standing = { location: HOUSE.id, entities: HOUSE.entities.map((each) => each.entity) };
const ELSEWHERE = [...REGISTRY.locations.keys()].find((id) => id !== GUIDE_HOUSE.location)!;

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
        // What a module wrote, which is not everything standing in a kind's map: a quest gives dialogues away, and those are the quest's to be edited through and not sections of their own. The namespace declared the written ones.
        if (!REGISTRY.namespace.has(kind, key)) continue;
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
    const staged = { name: 'local-changes', text: `# info local-changes\nversion: 0.0.0\n\n# location ${ELSEWHERE}\nx: 4, y: 0\n` };
    const withLocal = addressable([...SHIPPED_SOURCES, staged]);
    const shadowing = withLocal.filter((section) => section.address === ELSEWHERE);

    expect(shadowing).toHaveLength(1);
    expect(shadowing[0].staged).toBe(true);
    expect(shadowing[0].text).toContain('x: 4, y: 0');
    expect(withLocal).toHaveLength(addressed.length);
  });
});

const ONE_OF_EACH_KIND = [...new Map(addressed.map((section) => [section.kind, section])).values()];

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

  it('reads the kinds it is a rule about', () => {
    expect(ONE_OF_EACH_KIND.length).toBeGreaterThan(5);
  });

  for (const section of ONE_OF_EACH_KIND) {
    it(`puts back the ${section.kind} it was given, through the command and the store`, () => {
      const driver = createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined });
      driver.send((stage(section.text) as { line: string }).line);
      const held = driver.localChanges() ?? '';
      const staged = addressable([{ name: 'local-changes', text: held }]);

      expect(staged.map((each) => each.address), `${section.kind} ${section.address}`).toEqual([section.address]);
      expect(staged[0].text.split('\n')).toEqual(section.text.split('\n').filter((line, at) => at === 0 || line.trim() !== ''));
    });
  }

  it('takes a shipped section out of the game by the line an emptied field sends', () => {
    const driver = createDriver([engineLocale(), SPARE], { ticker: () => () => undefined });

    driver.send(removeLine({ kind: 'item', address: 'spare.coin' }));
    const staged = driver.localChanges() ?? '';

    expect(spoken(driver).filter((line) => line.includes('did not load'))).toEqual([]);
    expect(staged).toContain('# remove item.spare.coin');
    expect(loadUniverseWithDiagnostics([engineLocale(), SPARE, { name: 'local-changes', text: staged }]).registry.items.has('spare.coin')).toBe(false);
  });

  it('refuses to take out a section the world still names, and says what still names it', () => {
    const named = {
      name: 'base',
      text: '# info base\nversion: 1.0.0\n\n# location camp\nx: 0, y: 0\nstarting\nentities:\n  mirror\n\n# entity mirror\nlook in: say: hm\n',
    };
    const driver = createDriver([engineLocale(), named], { ticker: () => () => undefined });
    const mirror = { kind: 'entity', address: 'base.mirror' };

    driver.send(removeLine(mirror));

    expect(driver.localChanges() ?? '').not.toContain('# remove');
    expect(driver.snapshot().view.entities.map((each) => each.id)).toContain(mirror.address);
    expect(spoken(driver).some((line) => line.includes(mirror.address) && line.includes('unknown entity'))).toBe(true);
  });

  it('deletes and exports by lines the same table parses', () => {
    expect(deleteLine({ kind: 'location', address: 'somewhere.place' })).toBe('/local delete location somewhere.place');
    const local = COMMANDS.find((command) => command.name === '/local')!;
    expect(local.parse('delete location somewhere.place', undefined as never)).toEqual({ op: 'delete', kind: 'location', id: 'somewhere.place' });
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

describe('narrowing the list to the sections being looked for', () => {
  const kept = (query: string): Section[] => addressed.filter((section) => searching(query).holds(section));

  it('holds every section back until each term matches it, so a module and a word narrow together', () => {
    const both = kept('core sword');

    // A term is looked for in everything a section is searched by, its module among it, so a section of another module that names this one is a match and not a leak.
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((section) => /core/i.test(`${section.module} ${section.kind} ${section.address} ${section.text}`))).toBe(true);
    expect(both.every((section) => /sword/i.test(`${section.address} ${section.text}`))).toBe(true);
    expect(both.length).toBeLessThan(kept('core').length);
    expect(both.length).toBeLessThanOrEqual(kept('sword').length);
  });

  it('reads a term as a pattern rather than as the letters it is spelt with', () => {
    expect(kept('sword|whetstone').length).toBeGreaterThan(kept('sword').length);
    expect(kept('sw.rd').map(sectionKeyOf)).toEqual(kept('sword').map(sectionKeyOf));
    expect(kept('SWORD').map(sectionKeyOf)).toEqual(kept('sword').map(sectionKeyOf));
  });

  it('reaches the module a section came from, which its address need not spell', () => {
    const global = addressed.filter((section) => !section.address.includes('.'));

    expect(global.length).toBeGreaterThan(0);
    expect(kept(global[0].module)).toContain(global[0]);
  });

  it('keeps nothing and says so when a term is not a pattern at all', () => {
    const broken = searching('sword (');

    expect(broken.broken).toBe(true);
    expect(addressed.filter((section) => broken.holds(section))).toEqual([]);
    expect(searching('').broken).toBe(false);
    expect(kept('   ')).toEqual(addressed);
  });
});
