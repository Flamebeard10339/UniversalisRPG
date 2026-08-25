import { describe, expect, it } from 'vitest';
import { DIRECTIONS, hexKey, NEIGHBOR_DELTA, opposite, parseHexKey, type Direction } from '../content/hex';
import { SHAPES, type Shape } from '../content/shapes';
import { asLocalized } from '../runtime/localizedFixture';
import { arrivalDelay, HEX_SPAN, hexAt, newlyDrawn, NODE_CLEARANCE, planeGraph, reachOf, type Plane } from './planeGraph';
import { spanBetween } from './viewport';

type Cluster = Plane['clusters'][number];

const step = (hex: string, direction: Direction): string => {
  const at = parseHexKey(hex)!;
  return hexKey({ q: at.q + NEIGHBOR_DELTA[direction].q, r: at.r + NEIGHBOR_DELTA[direction].r });
};

function clusterOf(shape: Shape, hex: string, over: Partial<Cluster> = {}): Cluster {
  return {
    hex,
    jewel: shape.name,
    title: asLocalized(shape.name),
    examine: null,
    shape: shape.name,
    entry: null,
    effects: [],
    modSlots: 0,
    positions: Array.from({ length: shape.positionCount }, (_, at) => {
      const position = at + 1;
      return {
        position,
        node: `${hex}/${position}`,
        passive: null,
        title: null,
        standing: 'unreached' as const,
        free: false,
        faces: DIRECTIONS.filter((direction) => shape.edges[direction] === position).map((direction) => step(hex, direction)),
        payloads: [],
      };
    }),
    slots: DIRECTIONS.map((direction) => ({
      direction,
      node: `${hex}/${direction}`,
      standing: 'unreached' as const,
      toward: step(hex, direction),
      beyond: null,
    })),
    ...over,
  };
}

function linksOf(shape: Shape, hex: string): Plane['links'] {
  const links = shape.adjacency.map(([one, other]) => ({ from: `${hex}/${one}`, to: `${hex}/${other}` }));
  return [...links, ...DIRECTIONS.map((direction) => ({ from: `${hex}/${direction}`, to: `${hex}/${shape.edges[direction]}` }))];
}

function planeOf(shape: Shape, hex = '0,0'): Plane {
  return {
    instance: 'copy',
    template: 'blade',
    title: asLocalized('Blade'),
    name: asLocalized('Blade'),
    level: 1,
    spent: 0,
    remaining: 3,
    clusters: [clusterOf(shape, hex)],
    links: linksOf(shape, hex),
    contributions: [],
  };
}

function clearances(nodes: ReturnType<typeof planeGraph>['nodes']): { tightest: number; between: string } {
  let tightest = Number.POSITIVE_INFINITY;
  let between = '';
  for (let one = 0; one < nodes.length; one += 1) {
    for (let other = one + 1; other < nodes.length; other += 1) {
      const room = spanBetween(nodes[one].at, nodes[other].at) - reachOf(nodes[one]) - reachOf(nodes[other]) - NODE_CLEARANCE;
      if (room >= tightest) continue;
      tightest = room;
      between = `${nodes[one].key} and ${nodes[other].key}`;
    }
  }
  return { tightest, between };
}

const shapeNamed = (name: string): Shape => SHAPES.find((shape) => shape.name === name)!;

describe('where a hexagon of the plane stands', () => {
  it('puts the origin at the origin', () => {
    expect(hexAt('0,0')).toEqual({ x: 0, y: 0 });
  });

  it('puts every neighbour one span away, in six different directions', () => {
    const spots = DIRECTIONS.map((direction) => hexAt(step('0,0', direction)));

    for (const spot of spots) expect(spanBetween({ x: 0, y: 0 }, spot)).toBeCloseTo(HEX_SPAN, 6);
    expect(new Set(spots.map((spot) => `${Math.round(spot.x)},${Math.round(spot.y)}`)).size).toBe(6);
  });

  it('answers a key that is not one with the origin rather than with NaN', () => {
    expect(hexAt('nowhere')).toEqual({ x: 0, y: 0 });
  });
});

describe('laying out every shape the catalogue declares', () => {
  it('has shapes to walk, so none of the rules below is vacuous', () => {
    expect(SHAPES.length).toBeGreaterThan(3);
  });

  for (const shape of SHAPES) {
    it(`draws every node of a ${shape.name} exactly once, and no two on one point`, () => {
      const graph = planeGraph(planeOf(shape));
      const spots = graph.nodes.map((node) => `${node.at.x.toFixed(3)},${node.at.y.toFixed(3)}`);

      expect(graph.nodes.filter((node) => !node.socket)).toHaveLength(shape.positionCount);
      expect(graph.nodes.filter((node) => node.socket)).toHaveLength(DIRECTIONS.length);
      expect(new Set(spots).size).toBe(graph.nodes.length);
    });

    it(`leaves room between every pair of nodes a ${shape.name} draws`, () => {
      expect(clearances(planeGraph(planeOf(shape)).nodes).tightest).toBeGreaterThanOrEqual(0);
    });

    it(`joins a ${shape.name} up with every pair the engine published, and invents none`, () => {
      const plane = planeOf(shape);
      const graph = planeGraph(plane);

      expect(graph.edges).toHaveLength(plane.links.length);
      for (const edge of graph.edges) {
        expect(graph.nodes.some((node) => node.at.x === edge.from.x && node.at.y === edge.from.y)).toBe(true);
        expect(graph.nodes.some((node) => node.at.x === edge.to.x && node.at.y === edge.to.y)).toBe(true);
      }
    });

    it(`keeps every node of a ${shape.name} inside its own hexagon, so two clusters never overlap`, () => {
      for (const node of planeGraph(planeOf(shape)).nodes) {
        if (node.socket) continue;
        expect(spanBetween({ x: 0, y: 0 }, node.at)).toBeLessThan(HEX_SPAN / 2);
      }
    });
  }
});

describe('where a node goes inside its cluster', () => {
  it('puts a position that faces one edge out toward that edge, and its socket beyond it', () => {
    const graph = planeGraph(planeOf(shapeNamed('ring')));
    const east = graph.nodes.find((node) => node.key === '0,0/4')!;
    const socket = graph.nodes.find((node) => node.key === '0,0/e')!;

    expect(east.at.y).toBeCloseTo(0, 6);
    expect(east.at.x).toBeGreaterThan(0);
    expect(socket.at.x).toBeGreaterThan(east.at.x);
    expect(socket.at.x).toBeCloseTo(HEX_SPAN / 2, 6);
  });

  it('puts a position that faces every edge in the middle, since it faces nowhere', () => {
    const graph = planeGraph(planeOf(shapeNamed('point')));

    expect(graph.nodes.find((node) => !node.socket)!.at).toEqual({ x: 0, y: 0 });
  });

  it('puts the middle of a spindle in the middle, between the two that face outward', () => {
    const graph = planeGraph(planeOf(shapeNamed('spindle')));
    const [west, middle, east] = [1, 2, 3].map((position) => graph.nodes.find((node) => node.key === `0,0/${position}`)!);

    expect(middle.at).toEqual({ x: 0, y: 0 });
    expect(west.at.x).toBeLessThan(0);
    expect(east.at.x).toBeGreaterThan(0);
  });

  it('puts the hub of a wheel in the middle, since it hangs off all six', () => {
    const graph = planeGraph(planeOf(shapeNamed('wheel')));

    expect(graph.nodes.find((node) => node.key === '0,0/7')!.at).toEqual({ x: 0, y: 0 });
  });

  it('draws the inner ring of a double ring inside the outer one, on the same six ways out', () => {
    const graph = planeGraph(planeOf(shapeNamed('double-ring')));
    const middle = { x: 0, y: 0 };

    for (let outer = 1; outer <= 6; outer += 1) {
      const out = graph.nodes.find((node) => node.key === `0,0/${outer}`)!;
      const inner = graph.nodes.find((node) => node.key === `0,0/${outer + 6}`)!;

      expect(spanBetween(middle, inner.at)).toBeLessThan(spanBetween(middle, out.at));
      expect(spanBetween(middle, inner.at)).toBeGreaterThan(0);
      expect(out.at.x * inner.at.y - out.at.y * inner.at.x).toBeCloseTo(0, 3);
    }
  });
});

describe('two clusters either side of one edge', () => {
  const ring = shapeNamed('ring');

  function joined(): Plane {
    const plane = planeOf(ring);
    const beyond = clusterOf(ring, '1,0', { entry: { hex: '0,0', direction: 'e' } });
    const here = plane.clusters[0];
    return {
      ...plane,
      clusters: [
        { ...here, slots: here.slots.map((slot) => (slot.direction === 'e' ? { ...slot, standing: 'allocated' as const, beyond: '1,0' } : slot)) },
        { ...beyond, slots: beyond.slots.map((slot) => (slot.direction === 'w' ? { ...slot, standing: 'blocked' as const, beyond: '0,0' } : slot)) },
      ],
      links: [...plane.links, ...linksOf(ring, '1,0'), { from: '0,0/e', to: `1,0/${ring.edges[opposite('e')]}` }],
    };
  }

  it('draws one socket on the shared edge, not one per side', () => {
    const graph = planeGraph(joined());
    const onEdge = graph.nodes.filter((node) => node.socket && Math.abs(node.at.x - HEX_SPAN / 2) < 1e-6 && Math.abs(node.at.y) < 1e-6);

    expect(onEdge).toHaveLength(1);
    expect(onEdge[0].key).toBe('0,0/e');
    expect(onEdge[0].standing).toBe('allocated');
  });

  it('joins both clusters to that one socket, and draws no edge onto the one it replaced', () => {
    const graph = planeGraph(joined());
    const touching = graph.edges.filter((edge) => spanBetween(edge.from, { x: HEX_SPAN / 2, y: 0 }) < 1e-6 || spanBetween(edge.to, { x: HEX_SPAN / 2, y: 0 }) < 1e-6);

    expect(touching.length).toBe(2);
    expect(graph.nodes.every((node) => node.key !== '1,0/w')).toBe(true);
  });

  it('says what a filled socket holds, so the player reads the jewel and not the hexagon', () => {
    const graph = planeGraph(joined());

    expect(graph.nodes.find((node) => node.key === '0,0/e')!.holds).toBe(asLocalized('ring'));
  });

  it('keeps two clusters apart, so no node of one lands on a node of the other', () => {
    const spots = planeGraph(joined()).nodes.map((node) => `${node.at.x.toFixed(3)},${node.at.y.toFixed(3)}`);

    expect(new Set(spots).size).toBe(spots.length);
  });

  it('leaves room between every pair across the two, not only within each', () => {
    const room = clearances(planeGraph(joined()).nodes);

    expect(room.tightest, `${room.between} are too close`).toBeGreaterThanOrEqual(0);
  });
});

describe('what has just arrived', () => {
  const ring = shapeNamed('ring');

  it('is everything, the first time the plane is drawn', () => {
    const graph = planeGraph(planeOf(ring));
    const arrived = newlyDrawn(null, graph);

    expect(arrived.nodes).toHaveLength(graph.nodes.length);
    expect(arrived.edges).toHaveLength(graph.edges.length);
  });

  it('is nothing when the plane has not changed', () => {
    const graph = planeGraph(planeOf(ring));

    expect(newlyDrawn(graph, planeGraph(planeOf(ring)))).toEqual({ nodes: [], edges: [] });
  });

  it('is the cluster a jewel just brought, and only it', () => {
    const before = planeGraph(planeOf(ring));
    const plane = planeOf(ring);
    const after = planeGraph({ ...plane, clusters: [...plane.clusters, clusterOf(ring, '1,0')], links: [...plane.links, ...linksOf(ring, '1,0')] });
    const arrived = newlyDrawn(before, after);

    expect(arrived.nodes.every((key) => key.startsWith('1,0/'))).toBe(true);
    expect(arrived.nodes.length).toBeGreaterThan(0);
    expect(arrived.edges.length).toBeGreaterThan(0);
  });

  it('lands one node after another rather than all at once', () => {
    expect(arrivalDelay(0)).toBe(0);
    expect(arrivalDelay(3)).toBeGreaterThan(arrivalDelay(2));
  });
});
