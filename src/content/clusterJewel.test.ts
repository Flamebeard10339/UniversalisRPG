import { describe, expect, it } from 'vitest';
import { clusterJewelProblem, DEFAULT_MOD_SLOTS } from './sections/clusterJewel';
import { loadModule } from './load';
import { getShape } from './shapes';

const PASSIVES = '# stat max-health\n# passive hale\n# passive mending';

const load =
  (...lines: string[]) =>
  () =>
    loadModule([PASSIVES, ...lines].join('\n'));

// c4: # cluster-jewel names a shape, says which edges are open, and fills
// numbered positions with passives authored as <position> <passive> pairs.
describe('# cluster-jewel', () => {
  it('reads a shape, open-connections and passives inline', () => {
    const registry = loadModule([PASSIVES, '# cluster-jewel keen-edge', 'shape: ring', 'open-connections: e', 'passives: 1 hale, 3 mending'].join('\n'));
    const jewel = registry.clusterJewels.get('keen-edge')!;
    expect(jewel.shape).toBe('ring');
    expect(jewel.openConnections).toEqual(['e']);
    expect(jewel.positions).toEqual({ 1: 'hale', 3: 'mending' });
  });

  it('reads passives one pair to a line, the way # entity reads stats: as a block', () => {
    const registry = loadModule([PASSIVES, '# cluster-jewel blood-frenzy', 'shape: double-ring', 'open-connections: e', 'passives:', '  1 hale', '  10 mending'].join('\n'));
    expect(registry.clusterJewels.get('blood-frenzy')!.positions).toEqual({
      1: 'hale',
      10: 'mending',
    });
  });

  it('defaults mod-slots to 2, and reads an explicit override', () => {
    const registry = loadModule([PASSIVES, '# cluster-jewel a', 'shape: point', 'open-connections: e', '# cluster-jewel b', 'shape: point', 'open-connections: e', 'mod-slots: 3'].join('\n'));
    expect(registry.clusterJewels.get('a')!.modSlots).toBe(DEFAULT_MOD_SLOTS);
    expect(registry.clusterJewels.get('b')!.modSlots).toBe(3);
  });

  it('defaults positions to empty, since a jewel may open slots without any passives', () => {
    const registry = loadModule([PASSIVES, '# cluster-jewel crossroads', 'shape: point', 'open-connections: ne, e, se, sw, nw'].join('\n'));
    expect(registry.clusterJewels.get('crossroads')!.positions).toEqual({});
  });

  it('rejects a shape that does not exist, listing the ones that do', () => {
    expect(load('# cluster-jewel a', 'shape: hexagram', 'open-connections: e')).toThrow(/point, spindle, ring, wheel, double-ring/);
  });

  it("rejects a position outside the shape's range", () => {
    expect(load('# cluster-jewel a', 'shape: spindle', 'open-connections: e', 'passives: 4 hale')).toThrow(/# cluster-jewel a.*position 4 is outside spindle's 1-3 range/s);
  });

  it('rejects a position filled twice', () => {
    expect(load('# cluster-jewel a', 'shape: spindle', 'open-connections: e', 'passives: 1 hale, 1 mending')).toThrow(/# cluster-jewel a.*position 1 is filled twice/s);
  });

  it('rejects a passive that does not resolve, as an ordinary load-time reference error', () => {
    expect(load('# cluster-jewel a', 'shape: spindle', 'open-connections: e', 'passives: 1 nope')).toThrow(/# cluster-jewel a passives: names an unknown passive: nope/);
  });
});

// c6: open-connections names between one and five of the five non-root
// edges, each at most once; the west edge and a repeat are both refused.
describe('open-connections', () => {
  it('accepts all five non-root edges at once', () => {
    const registry = loadModule([PASSIVES, '# cluster-jewel a', 'shape: point', 'open-connections: ne, nw, e, sw, se'].join('\n'));
    expect(registry.clusterJewels.get('a')!.openConnections).toEqual(['ne', 'nw', 'e', 'sw', 'se']);
  });

  it('rejects the west edge, which the root occupies', () => {
    expect(load('# cluster-jewel a', 'shape: point', 'open-connections: w')).toThrow(/# cluster-jewel a.*west edge/s);
  });

  it('rejects the same edge named twice', () => {
    expect(load('# cluster-jewel a', 'shape: point', 'open-connections: e, e')).toThrow(/# cluster-jewel a.*names e more than once/s);
  });

  it('rejects zero open connections, the structural non-termination guarantee', () => {
    expect(load('# cluster-jewel a', 'shape: point')).toThrow(/# cluster-jewel a.*at least one edge/s);
  });

  it('rejects a direction that is not one of the six', () => {
    expect(load('# cluster-jewel a', 'shape: point', 'open-connections: north')).toThrow(/# cluster-jewel a.*unknown direction: north/s);
  });
});

describe('clusterJewelProblem', () => {
  const shape = getShape('spindle');

  it("finds nothing wrong with a jewel inside its shape's range", () => {
    expect(
      clusterJewelProblem(
        {
          id: 'a',
          title: 'A',
          shape: 'spindle',
          openConnections: ['e'],
          positions: { 1: 'hale' },
          modSlots: 2,
        },
        shape,
      ),
    ).toBeUndefined();
  });

  it('reports a position outside the shape', () => {
    expect(
      clusterJewelProblem(
        {
          id: 'a',
          title: 'A',
          shape: 'spindle',
          openConnections: ['e'],
          positions: { 9: 'hale' },
          modSlots: 2,
        },
        shape,
      ),
    ).toMatch(/position 9 is outside spindle's 1-3 range/);
  });
});
