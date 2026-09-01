import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { formatModuleDiagnostic } from '../content/registry';
import { fixtureSources } from '../content/worldFixture';
import { remarksOn } from './worldRemarks';
import { createGameState } from './state';
import { runTest } from './session';

const loaded = loadUniverseWithDiagnostics(fixtureSources());

describe('the world the suite stands in', () => {
  it('loads clean', () => {
    expect(loaded.diagnostics.map(formatModuleDiagnostic)).toEqual([]);
  });

  it('holds routes to walk, so nothing below is vacuous', () => {
    expect(loaded.registry.tests.size).toBeGreaterThan(10);
  });

  it.each([...loaded.registry.tests.keys()])('%s walks', (id) => {
    expect(runTest(id, loaded.registry, createGameState())).toEqual({ passed: true });
  });

  it('is a world an author would be told nothing about', () => {
    expect(remarksOn(fixtureSources(), loaded.registry).map((remark) => `${remark.where} ${remark.says}`)).toEqual([]);
  });
});
