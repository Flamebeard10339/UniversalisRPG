import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS } from '../content/hex';
import { askedOption } from '../runtime/command';
import type { PlayView } from '../runtime/session';
import { App } from './App';
import { createDriver, type Driver } from './driver';
import { planeGraph } from './planeGraph';
import { panelFor, type Choice } from './planePanel';
import { SHIPPED_SOURCES } from './shippedContent';

const OPENING = [
  'load: growing-a-heartwood-blade-start',
  'use: entity.smiths-chest.open',
  'open-modal: carried-items',
  'submit-modal: item=tutorial-island.iron-sword',
  'submit-modal: verb=grow',
];

function opened(...more: string[]): Driver {
  const driver = createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined });
  for (const line of [...OPENING, ...more]) driver.send(line);
  return driver;
}

function grown(): Driver {
  const driver = createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined });
  for (const line of ['load: growing-a-heartwood-blade-end', 'open-modal: carried-items', 'submit-modal: item=1', 'submit-modal: verb=grow']) driver.send(line);
  return driver;
}

// A plane screen is open in every one of these, so what it is reading is a plane.
const planeRead = (view: PlayView): { instance: string; hex: string } => view.focus as { instance: string; hex: string };

const planeOf = (view: PlayView): PlayView['planes'][number] => view.planes.find((each) => each.instance === planeRead(view).instance)!;

const choicesOf = (view: PlayView): readonly Choice[] => askedOption(view.modals)!.values ?? [];

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };

function readable(html: string): string[] {
  return html
    .replace(/aria-label="([^"]*)"/g, '\n$1\n')
    .replace(/<[^>]*>/g, '\n')
    .split('\n')
    .map((run) => run.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity]).trim())
    .filter((run) => run !== '');
}

const A_HEXAGON = /-?\d+\s*,\s*-?\d+/;

describe('the plane a player drags', () => {
  it('opens on a plane, so nothing below is a rule about an empty screen', () => {
    const view = opened().snapshot().view;

    expect(view.focus).not.toBeNull();
    expect(planeOf(view).clusters.length).toBeGreaterThan(0);
    expect(planeGraph(planeOf(view)).nodes.length).toBeGreaterThan(1);
  });

  it('draws no hexagon and no direction, whichever way the plane has been grown', () => {
    for (const driver of [opened(), opened('submit-modal: plane=allocate: slot e', 'submit-modal: plane=slot: e with tutorial-island.crossroads-jewel')]) {
      const runs = readable(renderToStaticMarkup(<App driver={driver} />));

      for (const run of runs) {
        expect(run, `the plane draws the hexagon ${run}`).not.toMatch(A_HEXAGON);
        for (const direction of DIRECTIONS) expect(run.split(/\s+/), `the plane draws the direction ${direction}`).not.toContain(direction);
      }
    }
  });

  it('says what the copy is worth while nothing on it is pressed', () => {
    const view = opened().snapshot().view;
    const runs = readable(renderToStaticMarkup(<App driver={opened()} />));
    const plane = planeOf(view);

    expect(runs.some((run) => run.includes(plane.name as unknown as string))).toBe(true);
    expect(panelFor(planeGraph(plane), null, choicesOf(view)).node).toBeNull();
  });
});

describe('what the panel says about the node that was pressed', () => {
  it('says nothing about a node until one is pressed, and offers the way out', () => {
    const view = opened().snapshot().view;
    const panel = panelFor(planeGraph(planeOf(view)), null, choicesOf(view));

    expect(panel.node).toBeNull();
    expect(panel.acts).toBeNull();
    expect(panel.jewels).toHaveLength(0);
    expect(panel.leaves).not.toBeNull();
  });

  it('offers the allocate the engine published for the node, and nothing for any other node', () => {
    const view = opened().snapshot().view;
    const graph = planeGraph(planeOf(view));
    const ready = graph.nodes.find((node) => node.standing === 'available')!;
    const locked = graph.nodes.find((node) => node.standing === 'unreached');

    expect(panelFor(graph, ready.key, choicesOf(view)).acts).not.toBeNull();
    if (locked) expect(panelFor(graph, locked.key, choicesOf(view)).acts).toBeNull();
  });

  it('names the standing of whatever was pressed, so a node out of reach says so', () => {
    const view = opened().snapshot().view;
    const graph = planeGraph(planeOf(view));

    for (const node of graph.nodes) {
      const panel = panelFor(graph, node.key, choicesOf(view));

      expect(panel.standing, node.key).not.toBeNull();
      expect(panel.node!.key).toBe(node.key);
    }
  });

  it('carries what every position pays straight off the report, without adding anything up', () => {
    const view = grown().snapshot().view;
    const plane = planeOf(view);
    const graph = planeGraph(plane);
    const positions = plane.clusters.flatMap((cluster) => cluster.positions);

    expect(positions.some((position) => position.payloads.length > 0)).toBe(true);
    for (const position of positions) {
      expect(panelFor(graph, position.node, choicesOf(view)).node!.payloads, position.node).toEqual(position.payloads);
    }
  });
});

describe('a socket with nothing through it', () => {
  it('offers the jewels the engine published for it, each named by the copy it brings', () => {
    const driver = opened('submit-modal: plane=allocate: slot e');
    const view = driver.snapshot().view;
    const graph = planeGraph(planeOf(view));
    const socket = graph.nodes.find((node) => node.socket && node.standing === 'allocated' && node.holds === null)!;
    const panel = panelFor(graph, socket.key, choicesOf(view));

    expect(panel.jewels.length).toBeGreaterThan(0);
    for (const jewel of panel.jewels) expect(jewel.subject).toBeDefined();
    expect(panel.acts).toBeNull();
  });

  it('offers no jewels once one has gone through it, and says what it holds instead', () => {
    const driver = opened('submit-modal: plane=allocate: slot e', 'submit-modal: plane=slot: e with tutorial-island.crossroads-jewel');
    const view = driver.snapshot().view;
    const graph = planeGraph(planeOf(view));
    const filled = graph.nodes.find((node) => node.socket && node.holds !== null)!;

    expect(panelFor(graph, filled.key, choicesOf(view)).jewels).toHaveLength(0);
    expect(filled.holds).not.toBeNull();
  });

  it('offers no jewels on a socket no point has been spent on', () => {
    const view = opened().snapshot().view;
    const graph = planeGraph(planeOf(view));
    const unspent = graph.nodes.find((node) => node.socket && node.standing !== 'allocated');

    if (unspent) expect(panelFor(graph, unspent.key, choicesOf(view)).jewels).toHaveLength(0);
  });
});

describe('a node of a cluster the screen is not standing on', () => {
  it('is walked to by a published move, so one press reaches any node the graph draws', () => {
    const driver = opened('submit-modal: plane=allocate: slot e', 'submit-modal: plane=slot: e with tutorial-island.crossroads-jewel');
    const view = driver.snapshot().view;
    const graph = planeGraph(planeOf(view));
    const elsewhere = graph.nodes.filter((node) => node.hex !== planeRead(view).hex);

    expect(elsewhere.length).toBeGreaterThan(0);
    for (const node of elsewhere) expect(panelFor(graph, node.key, choicesOf(view)).walks, node.key).not.toBeNull();
  });

  it('needs no walk for a node of the cluster the screen is already on', () => {
    const view = opened().snapshot().view;
    const graph = planeGraph(planeOf(view));
    const here = graph.nodes.filter((node) => node.hex === planeRead(view).hex);

    expect(here.length).toBeGreaterThan(0);
    for (const node of here) expect(panelFor(graph, node.key, choicesOf(view)).walks, node.key).toBeNull();
  });
});
