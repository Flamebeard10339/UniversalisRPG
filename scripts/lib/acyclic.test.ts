import { describe, expect, it } from 'vitest';
import { findCycles } from './acyclic';
import { checkLayers, importedPaths, resolveModule, shippedModules, sweptFiles } from './layers';
import { trackedFiles } from './sourceFiles';
import { readFileSync } from 'node:fs';

const graph = (edges: Record<string, string[]>) => (node: string) => edges[node] ?? [];

describe('findCycles', () => {
  it('finds nothing in a tree that has an order', () => {
    expect(findCycles(['a', 'b', 'c'], graph({ a: ['b', 'c'], b: ['c'] }))).toEqual([]);
  });

  it('does not read a module importing itself as a cycle between modules', () => {
    expect(findCycles(['a'], graph({ a: ['a'] }))).toEqual([]);
  });

  it('names every module on a cycle, not only the one that closes it', () => {
    const [cycle] = findCycles(['a', 'b', 'c', 'd'], graph({ a: ['b'], b: ['c'], c: ['a'], d: ['a'] }));
    expect(cycle.members).toEqual(['a', 'b', 'c']);
  });

  it('names an import that closes the cycle, and removing what it names leaves an order', () => {
    const edges: Record<string, string[]> = { a: ['b'], b: ['c'], c: ['a'] };
    const [cycle] = findCycles(['a', 'b', 'c'], graph(edges));
    expect(cycle.closedBy.length).toBeGreaterThan(0);
    for (const { from, to } of cycle.closedBy) edges[from] = edges[from].filter((target) => target !== to);
    expect(findCycles(['a', 'b', 'c'], graph(edges))).toEqual([]);
  });

  it('reports two disjoint cycles separately rather than as one finding', () => {
    expect(findCycles(['a', 'b', 'x', 'y'], graph({ a: ['b'], b: ['a'], x: ['y'], y: ['x'] })).map((cycle) => cycle.members)).toEqual([
      ['a', 'b'],
      ['x', 'y'],
    ]);
  });

  it('reports mutually reachable modules as one unit, however many ways round they reach', () => {
    const [cycle] = findCycles(['a', 'b', 'c'], graph({ a: ['b', 'c'], b: ['c'], c: ['a', 'b'] }));
    expect(cycle.members).toEqual(['a', 'b', 'c']);
  });

  it('does not read two cycles sharing no module as one, even when one reaches the other', () => {
    expect(findCycles(['a', 'b', 'x', 'y'], graph({ a: ['b'], b: ['a', 'x'], x: ['y'], y: ['x'] })).map((cycle) => cycle.members.length)).toEqual([2, 2]);
  });
});

describe('the shipped tree', () => {
  const files = sweptFiles(trackedFiles());
  const report = checkLayers(files, (file) => readFileSync(file, 'utf8'));

  it('has an order: no module imports its way back to itself', () => {
    expect(report.cycles.map((cycle) => ({ members: cycle.members, closedBy: cycle.closedBy.map(({ from, to }) => `${from} -> ${to}`) }))).toEqual([]);
  });

  it('sweeps enough of the tree for that to mean something', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  describe('the graph that answer was read off', () => {
    const shipped = shippedModules(files, () => true);
    const inShipped = new Set(shipped);
    const swept = new Set(files);
    const edges = shipped.flatMap((file) => importedPaths(file, readFileSync(file, 'utf8')).map((target) => resolveModule(target, swept))).filter((target) => target !== null && inShipped.has(target));

    it('holds the modules this repository ships', () => {
      expect(shipped.length).toBeGreaterThan(100);
    });

    it('holds the imports between them, resolved to modules', () => {
      expect(edges.length).toBeGreaterThan(500);
    });
  });
});
