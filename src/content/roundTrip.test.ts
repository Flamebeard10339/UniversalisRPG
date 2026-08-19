import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { formatModuleDiagnostic, loadModule, loadUniverse, loadUniverseWithDiagnostics, type ModuleDiagnostic, type UniverseLoadResult } from './registry';
import { canSerialize, declaredGlobalIds, republishModule, roundTripModule, roundTripUniverse } from './serialize';
import { parseUniverse, type ModuleSource } from './universe';
import { collectionFailures, exportedCodecs, isCodec, reachableCodecs } from '../grammar/codec';
import { AnySchema } from '../grammar/section';
import { LOCAL_CHANGES_MODULE_ID } from './localChanges';
import { SCHEMAS } from './module';


// The content layer's own modules, read from the directory. Together with the
// walk in `src/grammar/codec.test.ts` this is every codec the tree holds: the
// two layers are where a `Parser` can be written, and `layer-check` is what
// keeps that true.
const MODULES = import.meta.glob(['./*.ts', '!./*.test.ts'], { eager: true }) as Record<string, object>;

// The other route to the same population, and the one the load path itself
// takes: every field of every collected schema, and a list parser's element
// under it. A kind added to `SCHEMAS` brings its parsers into this set with no
// edit here, which a list of parsers could not do.
const fromSchemas = () =>
  reachableCodecs(
    Object.entries(SCHEMAS).flatMap(([kind, schema]) => Object.entries((schema as AnySchema).fields).map(([field, spec]) => [`${kind}.${field}`, spec.parser] as const)),
  );

describe('every parser in the grammar is a codec that survives its own examples', () => {
  it('reaches the content layer parsers and finds each one round-tripping', () => {
    const codecs = exportedCodecs(MODULES);
    expect(codecs.size).toBeGreaterThanOrEqual(8);
    expect(collectionFailures(codecs)).toEqual([]);
  });

  // Two kinds keep their value parsers unexported, so the export walk above
  // cannot see them and the schema walk is what does. Asserting the schema set
  // is not a subset of the export set is what stops that from silently
  // becoming untrue.
  it('reaches the parsers only a schema names, and finds each one round-tripping', () => {
    const codecs = fromSchemas();
    expect(codecs.size).toBeGreaterThanOrEqual(20);
    expect(collectionFailures(codecs)).toEqual([]);
    const exported = exportedCodecs(MODULES);
    expect([...codecs.keys()].some((parser) => !exported.has(parser as never))).toBe(true);
  });

  // Every field of every kind, asked directly rather than through the walk
  // above, whose object-identity dedupe means a shared parser is named only
  // after the first kind that reached it.
  it('finds a codec behind every field of every collected kind', () => {
    const fields = Object.entries(SCHEMAS).flatMap(([kind, schema]) => Object.entries((schema as AnySchema).fields).map(([field, spec]) => [`${kind}.${field}`, spec.parser] as const));
    expect(fields.length).toBeGreaterThan(40);
    expect(fields.filter(([, parser]) => !isCodec(parser)).map(([name]) => name)).toEqual([]);
  });
});

// The bytes every shipped module printed to at this branch's merge base,
// captured there rather than regenerated here. A change that alters the print
// and the parse consistently still fails this, which regenerating could not
// see. `>>>>` opens each module because no line the serializer emits starts
// with it: a heading starts with `#` and a field with a lowercase letter.
const FIXTURE = readFileSync(path.join(import.meta.dirname, 'printedCorpus.fixture.txt'), 'utf8');

const SEPARATOR = '>>>> ';

const shippedSources = (): ModuleSource[] => {
  const dir = path.join(import.meta.dirname, '../../content');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.dsl'))
    .map((name) => ({ name: name.replace(/[.]dsl$/, ''), text: readFileSync(path.join(dir, name), 'utf8') }))
    .filter((source) => source.name !== LOCAL_CHANGES_MODULE_ID);
};

const fixtureSources = (): ModuleSource[] =>
  FIXTURE.split(SEPARATOR)
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => ({ name: chunk.slice(0, chunk.indexOf('\n')), text: chunk.slice(chunk.indexOf('\n') + 1) }));

describe('nothing that loads today loads differently, and nothing prints differently', () => {
  const printCorpus = () => {
    const sources = shippedSources();
    expect(sources.length).toBeGreaterThan(1);
    const trip = roundTripUniverse(loadUniverse(sources), parseUniverse(sources).filter(canSerialize), (printed) => loadUniverseWithDiagnostics(printed));
    expect(trip.diagnostics.map(formatModuleDiagnostic)).toEqual([]);
    expect(trip.differences).toEqual([]);
    return trip.sources;
  };

  it('prints every shipped module to the bytes it printed to at the branch base', () => {
    expect(printCorpus().map((source) => `${SEPARATOR}${source.name}\n${source.text}`).join('')).toEqual(FIXTURE);
  });

  it('carries the whole corpus in the fixture, so an emptied one cannot pass', () => {
    expect(FIXTURE.length).toBeGreaterThan(40000);
    expect(fixtureSources().map((source) => source.name).sort()).toEqual(shippedSources().map((source) => source.name).sort());
  });

  // The other direction of c7. Byte equality of the print says nothing about
  // what the sources parse to unless the two registries are compared, and the
  // fixture is the only side of that comparison this branch cannot have moved.
  it('loads the shipped sources to a registry deep-equal to the one the base bytes load to', () => {
    const fromSources = loadUniverseWithDiagnostics(shippedSources());
    const fromFixture = loadUniverseWithDiagnostics(fixtureSources());
    expect(fromFixture.diagnostics.map(formatModuleDiagnostic)).toEqual([]);
    expect(fromSources.registry.items.size).toBeGreaterThan(20);
    expect(fromFixture.registry).toEqual(fromSources.registry);
  });
});

const BASE = ['# info base', 'version: 1.0.0', '', '# item bread', 'title: Bread', '', '# location camp', 'x: 0, y: 0', 'starting'].join('\n');

const info = { id: 'base', version: [1, 0, 0] as [number, number, number] };

const reloadAlone = (printed: string): UniverseLoadResult => loadUniverseWithDiagnostics([{ name: 'base', text: printed }]);

const diagnostic = (message: string): ModuleDiagnostic => ({ sourceName: 'base', moduleId: 'base', stage: 'validate', message });

const without = (printed: string, heading: string): string =>
  printed
    .split('\n\n')
    .filter((section) => !section.startsWith(heading))
    .join('\n\n');

describe('roundTripModule', () => {
  it('reports no differences when a module survives serialize and reload', () => {
    const result = roundTripModule(loadModule(BASE), { info }, reloadAlone);
    expect(result.diagnostics).toEqual([]);
    expect(result.differences).toEqual([]);
    expect(result.printed).toContain('# item bread');
  });

  // Both blocks on both carriers, in one module, because what the round trip
  // proves is that a hook survives the only form the serializer can print.
  const CARRIERS = [
    '# info base',
    'version: 1.0.0',
    '',
    '# stat vigor',
    'base: 10',
    '',
    '# resource rage',
    'max: vigor',
    'display: minimal',
    '',
    '# item bramble-mail',
    '+4-7 vigor, +2 vigor per rage',
    'on hit: 1 in 4: drain: 3 rage from them',
    'when hit: drain: 2 rage from them',
    '',
    '# entity berserker',
    'stats: vigor 3',
    'on hit:',
    '  restore: 1 rage to me',
    '  1 in 20:',
    '    drain: 4 rage from them',
    'when hit: restore: 1 rage',
  ].join('\n');

  it('carries both hook blocks, on both carriers, through serialize and reload', () => {
    const result = roundTripModule(loadModule(CARRIERS), { info }, reloadAlone);
    expect(result.diagnostics).toEqual([]);
    expect(result.differences).toEqual([]);
    expect(result.printed).toContain('drain: 4 base.rage from them');
    // Unmarked is the carrier's, and `to me` is kept as written rather than
    // normalized away, so the reload returns the author's words.
    expect(result.printed).toContain('restore: 1 base.rage to me');
    expect(result.printed).toContain('restore: 1 base.rage\n');
    expect(result.printed).toContain('+2 base.vigor per base.rage');
  });

  it.each([
    ['  restore: 1 base.rage to me\n', 'entities', 'berserker'],
    ['when hit:\n  restore: 1 base.rage\n', 'entities', 'berserker'],
    ['on hit:\n  1 in 4:\n    drain: 3 base.rage from them\n', 'items', 'bramble-mail'],
    ['when hit:\n  drain: 2 base.rage from them\n', 'items', 'bramble-mail'],
  ])('reports a hook the reload lost, so dropping one cannot read as clean: %s', (printedForm, where, id) => {
    const result = roundTripModule(loadModule(CARRIERS), { info }, (printed) => {
      expect(printed).toContain(printedForm);
      return reloadAlone(printed.replace(printedForm, ''));
    });
    expect(result.differences).toEqual([`  ${where}: changed base.${id}`]);
  });

  it('names what the reloaded registry lost, so a dropped section cannot read as clean', () => {
    const result = roundTripModule(loadModule(BASE), { info }, (printed) => reloadAlone(without(printed, '# item bread')));
    expect(result.differences).toEqual(['  items: missing base.bread']);
  });

  it('reports a value the reload changed, not only one it dropped', () => {
    const result = roundTripModule(loadModule(BASE), { info }, (printed) => reloadAlone(printed.replace('x: 0, y: 0', 'x: 1, y: 0')));
    expect(result.differences).toEqual(['  locations: changed base.camp']);
  });

  it('stops at diagnostics and does not diff a registry that never loaded', () => {
    const failed = { registry: loadModule('# info base\nversion: 1.0.0\n'), diagnostics: [diagnostic('did not validate')], modules: [], parsed: [], loadedModules: [], disabledModules: [] };
    const result = roundTripModule(loadModule(BASE), { info }, () => failed);
    expect(result.diagnostics.map((each) => each.message)).toEqual(['did not validate']);
    // The empty registry differs from BASE in two entries; reporting them would
    // describe a load that failed as a serializer defect.
    expect(result.differences).toEqual([]);
  });

  it('returns the printed text even when the reload rejected it', () => {
    const result = roundTripModule(loadModule(BASE), { info }, () => ({ registry: loadModule('# info base\nversion: 1.0.0\n'), diagnostics: [diagnostic('nope')], modules: [], parsed: [], loadedModules: [], disabledModules: [] }));
    expect(result.printed).toContain('# item bread');
  });

  // Variables are global tuning knobs, so the serializer emits only the ones it
  // is told to carry. Undeclared, the round trip is what notices the loss.
  it('carries the serializer options through, and reports the variable dropped when they are absent', () => {
    const withVariable = loadModule([BASE, '', '# variable travel-seconds-per-unit', 'value: 5'].join('\n'));
    const undeclared = roundTripModule(withVariable, { info }, reloadAlone);
    expect(undeclared.printed).not.toContain('# variable');
    expect(undeclared.differences).toEqual(['  variables: missing travel-seconds-per-unit']);

    const declared = roundTripModule(withVariable, { info, globals: ['travel-seconds-per-unit'] }, reloadAlone);
    expect(declared.printed).toContain('# variable travel-seconds-per-unit');
    expect(declared.differences).toEqual([]);
  });
});

describe('republishModule', () => {
  const renamed = { info: { id: 'again', version: [1, 0, 0] as [number, number, number] } };

  it('prints under the new id once the round trip under the old one came back clean', () => {
    const result = republishModule(loadModule(BASE), { info }, reloadAlone, { registry: loadModule(BASE), options: renamed });
    expect(result.differences).toEqual([]);
    expect(result.printed).toContain('# info again');
  });

  // The refusal a caller acts on: nothing is printed, so publishing a module
  // the serializer could not carry is not a thing a caller can do by ignoring a
  // field.
  it('prints nothing, and says what was lost, when the round trip found a difference', () => {
    const result = republishModule(loadModule(BASE), { info }, (printed) => reloadAlone(without(printed, '# item bread')), {
      registry: loadModule(BASE),
      options: renamed,
    });
    expect(result.printed).toBeNull();
    expect(result.differences).toEqual(['  items: missing base.bread']);
  });

  it('prints nothing when the round trip did not load, and carries the diagnostic', () => {
    const failed: UniverseLoadResult = { registry: loadModule(['# info base', 'version: 1.0.0', ''].join('\n')), diagnostics: [diagnostic('nope')], modules: [], parsed: [], loadedModules: [], disabledModules: [] };
    const result = republishModule(loadModule(BASE), { info }, () => failed, { registry: loadModule(BASE), options: renamed });
    expect(result.printed).toBeNull();
    expect(result.diagnostics.map((each) => each.message)).toEqual(['nope']);
  });
});

describe('declaredGlobalIds', () => {
  it('answers in a stable order, so the serializer prints the same bytes whatever order they were authored in', () => {
    const one = parseUniverse([{ name: 'm', text: '# info m\nversion: 1.0.0\n\n# variable zebra\nvalue: 1\n\n# variable alpha\nvalue: 2\n' }])[0];
    const other = parseUniverse([{ name: 'm', text: '# info m\nversion: 1.0.0\n\n# variable alpha\nvalue: 2\n\n# variable zebra\nvalue: 1\n' }])[0];
    expect(declaredGlobalIds(one)).toEqual(['alpha', 'zebra']);
    expect(declaredGlobalIds(one)).toEqual(declaredGlobalIds(other));
  });

  it('names only variables, not every section that has an id', () => {
    const module = parseUniverse([{ name: 'm', text: '# info m\nversion: 1.0.0\n\n# item rock\n\n# variable pace\nvalue: 3\n' }])[0];
    expect(declaredGlobalIds(module)).toEqual(['pace']);
  });
});

describe('canSerialize', () => {
  it('is false for a source with no # info, whose ids no namespace prefix matches', () => {
    expect(canSerialize(parseUniverse([{ name: 'snippet', text: '# item rock\n' }])[0])).toBe(false);
  });

  it('is true once the source declares one', () => {
    expect(canSerialize(parseUniverse([{ name: 'm', text: '# info m\nversion: 1.0.0\n\n# item rock\n' }])[0])).toBe(true);
  });
});

describe('roundTripUniverse', () => {
  // Every case records what the reload was actually handed. Asserting only on
  // what the closure does to its argument cannot see the argument being wrong,
  // and handing back the original sources makes every round trip report clean.
  let handed: ModuleSource[][] = [];

  beforeEach(() => {
    handed = [];
  });

  const reloading = (transform: (printed: readonly ModuleSource[]) => readonly ModuleSource[] = (printed) => printed) => (printed: readonly ModuleSource[]) => {
    handed.push([...printed]);
    return loadUniverseWithDiagnostics(transform(printed));
  };

  const trip = (sources: ModuleSource[]) => {
    const loaded = loadUniverseWithDiagnostics(sources);
    expect(loaded.diagnostics).toEqual([]);
    return roundTripUniverse(loaded.registry, parseUniverse(sources), reloading());
  };

  it('hands the reload the serializations, never the sources it was given', () => {
    const source: ModuleSource = { name: 'base', text: '// a rope\n# info base\nversion: 1.0.0\n\n# item rope\n' };
    const result = trip([source]);
    expect(handed).toHaveLength(1);
    expect(handed[0]).toEqual(result.sources);
    expect(handed[0]).not.toEqual([source]);
  });

  it('hands over one serialization per module, and no original among them', () => {
    const other: ModuleSource = { name: 'more', text: '# info more\nversion: 1.0.0\ndependencies:\n  base\n\n# item ribbon\ntitle: Ribbon\n' };
    const base: ModuleSource = { name: 'base', text: '// a rope\n# info base\nversion: 1.0.0\n\n# item rope\n' };
    const result = trip([base, other]);
    expect(handed[0]).toHaveLength(2);
    expect(handed[0]).toEqual(result.sources);
    expect(handed[0].map((each) => each.text)).not.toContain(base.text);
  });

  const BASE_TWO: ModuleSource = { name: 'base', text: '# info base\nversion: 1.0.0\n\n# item rope\n\n# item bread\ntitle: Bread\n' };

  it('round-trips a single module clean', () => {
    expect(trip([BASE_TWO]).differences).toEqual([]);
  });

  // The defect this shape exists for. Serializing `base` alone and reloading it
  // beside the original `cut` replays the removal against content that no longer
  // has it, and the loader refuses — blaming `base`, whose serialization is fine.
  it('survives a universe where one module removes another module\'s content', () => {
    const cut: ModuleSource = { name: 'cut', text: '# info cut\nversion: 1.0.0\ndependencies:\n  base\n\n# remove item.base.rope\n' };
    const result = trip([BASE_TWO, cut]);
    expect(result.diagnostics).toEqual([]);
    expect(result.differences).toEqual([]);
  });

  it('survives a universe where one module patches another module\'s content', () => {
    const patch: ModuleSource = { name: 'patch', text: '# info patch\nversion: 1.0.0\ndependencies:\n  base\n\n# item base.bread\ntitle: Toast\n\n# item ribbon\ntitle: Ribbon\n' };
    const result = trip([BASE_TWO, patch]);
    expect(result.differences).toEqual([]);
    // The patched value is carried by base's own serialization, since that is
    // where the merged registry holds it.
    expect(result.sources.find((source) => source.name === 'base')?.text).toContain('Toast');
  });

  // The serializer prints neither an absent hook nor an emptied one, so a reload
  // can return only one of them. They are one value — empty — and this is what
  // says so: a patch that removes a base entity's only hook result round-trips.
  it('carries a hook a patch module emptied', () => {
    const base = { name: 'base', text: '# info base\nversion: 1.0.0\n\n# stat vigor\nbase: 10\n\n# resource rage\nmax: vigor\ndisplay: minimal\n\n# entity rat\nstats: vigor 3\non hit: restore: 1 rage\nwhen hit: restore: 2 rage\n' };
    const patch = { name: 'patch', text: '# info patch\nversion: 1.0.0\ndependencies:\n  base\n\n# entity base.rat\n-on hit: restore: 1 base.rage\n-when hit: restore: 2 base.rage\n' };
    const loaded = loadUniverseWithDiagnostics([base, patch]);
    expect(loaded.registry.entities.get('base.rat')).toMatchObject({ onHit: [], whenHit: [] });
    const result = trip([base, patch]);
    expect(result.diagnostics).toEqual([]);
    expect(result.differences).toEqual([]);
  });

  it('still reports a real loss, so the reframing did not make it blind', () => {
    const loaded = loadUniverseWithDiagnostics([BASE_TWO]);
    const result = roundTripUniverse(loaded.registry, parseUniverse([BASE_TWO]), reloading((printed) => printed.map((source) => ({ ...source, text: source.text.split('\n\n').filter((section) => !section.startsWith('# item rope')).join('\n\n') }))));
    expect(result.differences).toEqual(['  items: missing base.rope']);
  });

  it('stops at diagnostics rather than diffing a universe that never loaded', () => {
    const loaded = loadUniverseWithDiagnostics([BASE_TWO]);
    const result = roundTripUniverse(loaded.registry, parseUniverse([BASE_TWO]), reloading((printed) => printed.map((source) => ({ ...source, text: `${source.text}\n# item \n` }))));
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.differences).toEqual([]);
  });

  it('returns each module\'s serialization under its own name, and no single printed text', () => {
    const result = trip([BASE_TWO]);
    expect(result.sources.map((source) => source.name)).toEqual(['base']);
    expect(result.sources[0].text).toContain('# item rope');
    // A universe has no one reloadable text, so there is no field claiming one.
    expect('printed' in result).toBe(false);
  });
});
