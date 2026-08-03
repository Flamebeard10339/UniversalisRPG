import { describe, expect, it } from 'vitest';
import { loadModule, loadUniverseWithDiagnostics, type ModuleDiagnostic, type UniverseLoadResult } from './registry';
import { canSerialize, declaredVariableIds, roundTripModule, roundTripUniverse } from './roundTrip';
import { parseUniverse, type ModuleSource } from './universe';

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

  it('names what the reloaded registry lost, so a dropped section cannot read as clean', () => {
    const result = roundTripModule(loadModule(BASE), { info }, (printed) => reloadAlone(without(printed, '# item bread')));
    expect(result.differences).toEqual(['  items: missing base.bread']);
  });

  it('reports a value the reload changed, not only one it dropped', () => {
    const result = roundTripModule(loadModule(BASE), { info }, (printed) => reloadAlone(printed.replace('title: Bread', 'title: Toast')));
    expect(result.differences).toEqual(['  items: changed base.bread']);
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

    const declared = roundTripModule(withVariable, { info, globalVariables: ['travel-seconds-per-unit'] }, reloadAlone);
    expect(declared.printed).toContain('# variable travel-seconds-per-unit');
    expect(declared.differences).toEqual([]);
  });
});

describe('declaredVariableIds', () => {
  it('answers in a stable order, so the serializer prints the same bytes whatever order they were authored in', () => {
    const one = parseUniverse([{ name: 'm', text: '# info m\nversion: 1.0.0\n\n# variable zebra\nvalue: 1\n\n# variable alpha\nvalue: 2\n' }])[0];
    const other = parseUniverse([{ name: 'm', text: '# info m\nversion: 1.0.0\n\n# variable alpha\nvalue: 2\n\n# variable zebra\nvalue: 1\n' }])[0];
    expect(declaredVariableIds(one)).toEqual(['alpha', 'zebra']);
    expect(declaredVariableIds(one)).toEqual(declaredVariableIds(other));
  });

  it('names only variables, not every section that has an id', () => {
    const module = parseUniverse([{ name: 'm', text: '# info m\nversion: 1.0.0\n\n# item rock\n\n# variable pace\nvalue: 3\n' }])[0];
    expect(declaredVariableIds(module)).toEqual(['pace']);
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
  const trip = (sources: ModuleSource[]) => {
    const loaded = loadUniverseWithDiagnostics(sources);
    expect(loaded.diagnostics).toEqual([]);
    return roundTripUniverse(loaded.registry, parseUniverse(sources), (printed) => loadUniverseWithDiagnostics(printed));
  };

  const BASE_TWO: ModuleSource = { name: 'base', text: '# info base\nversion: 1.0.0\n\n# item rope\ntitle: Rope\n\n# item bread\ntitle: Bread\n' };

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

  it('still reports a real loss, so the reframing did not make it blind', () => {
    const loaded = loadUniverseWithDiagnostics([BASE_TWO]);
    const result = roundTripUniverse(loaded.registry, parseUniverse([BASE_TWO]), (printed) => loadUniverseWithDiagnostics(printed.map((source) => ({ ...source, text: source.text.split('\n\n').filter((section) => !section.startsWith('# item rope')).join('\n\n') }))));
    expect(result.differences).toEqual(['  items: missing base.rope']);
  });

  it('stops at diagnostics rather than diffing a universe that never loaded', () => {
    const loaded = loadUniverseWithDiagnostics([BASE_TWO]);
    const result = roundTripUniverse(loaded.registry, parseUniverse([BASE_TWO]), (printed) => loadUniverseWithDiagnostics(printed.map((source) => ({ ...source, text: `${source.text}\n# item \n` }))));
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.differences).toEqual([]);
  });

  it('returns each module\'s serialization, labelled, so the printed text is readable', () => {
    const result = trip([BASE_TWO]);
    expect(result.sources.map((source) => source.name)).toEqual(['base']);
    expect(result.printed).toContain('// --- base ---');
  });
});
