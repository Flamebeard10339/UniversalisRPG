import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { formatModuleDiagnostic } from '../content/registry';
import { fixtureSources } from '../content/worldFixture';
import { remarksOn } from './worldRemarks';
import { createGameState } from './state';
import { runTest } from './session';

// The engine's own world, held to what it says of itself. Its routes are engine proofs — that a
// counter sells what it stocks, that a stair relocates for nothing, that a pool fills as blows land
// — so this is where a route's verdict is reported, and it is reported once. The shipped corpus's
// routes are `npm run oracle -- --at content`'s to walk, and no test may read a line of it.
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

  // The same rules `npm run oracle` holds an author's world to. A fixture that broke one of them
  // would be an engine world nobody would ship, and the rules would be proved on nothing.
  it('is a world an author would be told nothing about', () => {
    expect(remarksOn(fixtureSources(), loaded.registry).map((remark) => `${remark.where} ${remark.says}`)).toEqual([]);
  });
});
