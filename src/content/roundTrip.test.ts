import { describe, expect, it } from 'vitest';
import { loadModule, loadUniverseWithDiagnostics, type ModuleDiagnostic, type UniverseLoadResult } from './registry';
import { roundTripModule } from './roundTrip';

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
    const failed = { registry: loadModule('# info base\nversion: 1.0.0\n'), diagnostics: [diagnostic('did not validate')], modules: [], loadedModules: [], disabledModules: [] };
    const result = roundTripModule(loadModule(BASE), { info }, () => failed);
    expect(result.diagnostics.map((each) => each.message)).toEqual(['did not validate']);
    // The empty registry differs from BASE in two entries; reporting them would
    // describe a load that failed as a serializer defect.
    expect(result.differences).toEqual([]);
  });

  it('returns the printed text even when the reload rejected it', () => {
    const result = roundTripModule(loadModule(BASE), { info }, () => ({ registry: loadModule('# info base\nversion: 1.0.0\n'), diagnostics: [diagnostic('nope')], modules: [], loadedModules: [], disabledModules: [] }));
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
