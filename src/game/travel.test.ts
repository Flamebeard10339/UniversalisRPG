import { describe, expect, it } from 'vitest';
import { createInitialPlayState, resolveDueTimers, startTravel } from './timers';
import { findTravelPath, getAvailableTravelEdgesForNode, getLocationInDirection, getVisibleTravelGraph } from './travel';
import type { ActionResolutionContext, GameAction, LocationNode, UniverseUiSettings } from './types';

const travelAction = (id: string, source: string, target: string, durationSeconds = 1, patch: Partial<GameAction> = {}): GameAction => ({
  id,
  locationId: source,
  role: 'travel',
  durationSeconds,
  rewards: [],
  results: [{ kind: 'relocate', locationId: target }],
  ...patch,
});

const context = (actions: GameAction[], ui: UniverseUiSettings = {}): ActionResolutionContext => ({
  manifest: {
    schemaVersion: 1,
    id: 'test',
    version: '1',
    author: 'test',
    locales: ['en'],
    files: [],
    ui,
  },
  actions,
  skills: [],
  stats: [],
  locations: [
    { id: 'start', position: { x: 0, y: 0 }, starting: true },
    { id: 'middle', position: { x: 1, y: 0 } },
    { id: 'target', position: { x: 2, y: 0 } },
  ],
  entities: [],
  items: [],
  flags: [{ id: 'unlocked', initialValue: false }],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dropTables: [],
  dialogues: [],
});

describe('travel actions', () => {
  it('returns currently available edges for a node and respects requirements', () => {
    const actions = [
      travelAction('go-middle', 'start', 'middle'),
      travelAction('locked-target', 'start', 'target', 1, {
        requirements: { kind: 'state-variable', variable: 'flag:unlocked', comparison: 'equal', value: true },
      }),
    ];
    const state = createInitialPlayState('test', 'start');
    const edges = getAvailableTravelEdgesForNode(state, context(actions), 'start');

    expect(edges.map((edge) => edge.action.id)).toEqual(['go-middle']);
  });

  it('pathfinds through explored nodes only', () => {
    const actions = [
      travelAction('go-middle', 'start', 'middle'),
      travelAction('go-target', 'middle', 'target'),
    ];
    const state = {
      ...createInitialPlayState('test', 'start'),
      discoveredLocationIds: ['start', 'middle'],
    };
    const path = findTravelPath(state, context(actions), 'target');

    expect(path.status).toBe('found');
    expect(path.status === 'found' ? path.edges.map((edge) => edge.action.id) : []).toEqual(['go-middle', 'go-target']);
  });

  it('shows explored locations plus the currently reachable frontier', () => {
    const actions = [
      travelAction('go-middle', 'start', 'middle'),
      travelAction('go-target', 'middle', 'target'),
    ];
    const playState = createInitialPlayState('test', 'start');
    const testContext = context(actions);
    const graph = getVisibleTravelGraph({
      manifest: testContext.manifest!,
      locations: testContext.locations!,
      actions,
      skills: [],
      stats: [],
      items: [],
      flags: [],
      resourceDefinitions: [],
      effects: [],
      interactionTypes: [],
      enemies: [],
      locales: { en: {} },
    }, playState, testContext);

    expect(graph.locations.map((location) => location.id).sort()).toEqual(['middle', 'start']);
    expect(graph.edges.map((edge) => edge.action.id)).toEqual(['go-middle']);
  });

  it('does not pathfind through relocation actions with other effects', () => {
    const actions = [
      travelAction('charter', 'start', 'target', 1, {
        rewards: [{ kind: 'item', itemId: 'coin', amount: -1 }],
      }),
    ];
    const state = createInitialPlayState('test', 'start');

    expect(findTravelPath(state, context(actions), 'target').status).toBe('not-found');
  });

  it('reports too-far when path limits block a valid route', () => {
    const actions = [
      travelAction('go-middle', 'start', 'middle'),
      travelAction('go-target', 'middle', 'target'),
    ];
    const state = {
      ...createInitialPlayState('test', 'start'),
      discoveredLocationIds: ['start', 'middle'],
    };

    // Each hop is 1 grid unit at the default movement speed (1s/unit), so the
    // full 2-hop route takes 2s; capping the budget at 1s must block it.
    expect(findTravelPath(state, context(actions, { travelPathMaxSeconds: 1 }), 'target').status).toBe('too-far');
  });

  it('explores every arrival while resolving a multi-segment travel path', () => {
    const actions = [
      travelAction('go-middle', 'start', 'middle', 2),
      travelAction('go-target', 'middle', 'target', 3),
    ];
    const state = {
      ...createInitialPlayState('test', 'start'),
      discoveredLocationIds: ['start', 'middle'],
    };
    const testContext = context(actions);
    const path = findTravelPath(state, testContext, 'target');
    expect(path.status).toBe('found');
    if (path.status !== 'found') return;

    const travelling = startTravel(state, path.edges, 1_000);
    const resolved = resolveDueTimers(travelling, testContext, {}, 6_000);

    expect(resolved.currentLocationId).toBe('target');
    expect(resolved.discoveredLocationIds).toEqual(['start', 'middle', 'target']);
    expect(resolved.collectionLog['location:middle:explored']).toBe(1);
    expect(resolved.collectionLog['location:target:explored']).toBe(1);
    expect(resolved.activeTravel).toBeNull();
  });
});

describe('highly-connected mode', () => {
  const gridContext = (locations: LocationNode[], actions: GameAction[] = [], ui: UniverseUiSettings = {}): ActionResolutionContext => ({
    manifest: {
      schemaVersion: 1,
      id: 'test',
      version: '1',
      author: 'test',
      locales: ['en'],
      files: [],
      ui: { connectivityMode: 'highly-connected', ...ui },
    },
    actions,
    skills: [],
    stats: [],
    locations,
    entities: [],
    items: [],
    flags: [{ id: 'unlocked', initialValue: false }],
    resourceDefinitions: [],
    effects: [],
    interactionTypes: [],
    enemies: [],
    dropTables: [],
    dialogues: [],
  });

  it('auto-connects every grid-adjacent location, including diagonals', () => {
    const locations: LocationNode[] = [
      { id: 'center', position: { x: 0, y: 0 } },
      { id: 'north', position: { x: 0, y: -1 } },
      { id: 'northeast', position: { x: 1, y: -1 } },
      { id: 'far', position: { x: 2, y: 0 } },
    ];
    const state = createInitialPlayState('test', 'center');
    const edges = getAvailableTravelEdgesForNode(state, gridContext(locations), 'center');

    expect(edges.map((edge) => edge.target).sort()).toEqual(['north', 'northeast']);
    expect(edges.find((edge) => edge.target === 'north')?.travelTimeSeconds).toBeCloseTo(1, 5);
    expect(edges.find((edge) => edge.target === 'northeast')?.travelTimeSeconds).toBeCloseTo(Math.sqrt(2), 5);
  });

  it('treats a visible authored travel action between adjacent locations as a wall', () => {
    const locations: LocationNode[] = [
      { id: 'center', position: { x: 0, y: 0 } },
      { id: 'north', position: { x: 0, y: -1 } },
    ];
    const wall: GameAction = {
      id: 'wall-center-to-north',
      locationId: 'center',
      role: 'travel',
      rewards: [],
      results: [{ kind: 'relocate', locationId: 'north' }],
    };
    const state = createInitialPlayState('test', 'center');

    expect(getAvailableTravelEdgesForNode(state, gridContext(locations, [wall]), 'center')).toHaveLength(0);
  });

  it('opens a wall once its visibleWhen condition is met, mirroring conditional gating', () => {
    const locations: LocationNode[] = [
      { id: 'center', position: { x: 0, y: 0 } },
      { id: 'north', position: { x: 0, y: -1 } },
    ];
    const wall: GameAction = {
      id: 'wall-center-to-north',
      locationId: 'center',
      role: 'travel',
      rewards: [],
      results: [{ kind: 'relocate', locationId: 'north' }],
      visibleWhen: { kind: 'not', condition: { kind: 'state-variable', variable: 'flag:unlocked', comparison: 'equal', value: true } },
    };
    const locked = createInitialPlayState('test', 'center');
    const unlocked = { ...locked, flags: { unlocked: true } };

    expect(getAvailableTravelEdgesForNode(locked, gridContext(locations, [wall]), 'center')).toHaveLength(0);
    expect(getAvailableTravelEdgesForNode(unlocked, gridContext(locations, [wall]), 'center').map((edge) => edge.target)).toEqual(['north']);
  });

  it('does not connect adjacent locations on a different z-layer', () => {
    const locations: LocationNode[] = [
      { id: 'surface', position: { x: 0, y: 0, z: 0 } },
      { id: 'basement', position: { x: 0, y: 0, z: -1 } },
    ];
    const state = createInitialPlayState('test', 'surface');

    expect(getAvailableTravelEdgesForNode(state, gridContext(locations), 'surface')).toHaveLength(0);
  });

  it('scales travel time by the movement-speed stat', () => {
    const locations: LocationNode[] = [
      { id: 'center', position: { x: 0, y: 0 } },
      { id: 'north', position: { x: 0, y: -1 } },
    ];
    const fastContext = gridContext(locations);
    fastContext.stats = [{ id: 'movement-speed', base: 120 }];
    const state = createInitialPlayState('test', 'center');

    const edges = getAvailableTravelEdgesForNode(state, fastContext, 'center');
    expect(edges[0]?.travelTimeSeconds).toBeCloseTo(0.5, 5);
  });

  it('only shows locations on the current z-layer on the map', () => {
    const bundle = {
      manifest: { schemaVersion: 1, id: 'test', version: '1', author: 'test', locales: ['en'], files: [], ui: { connectivityMode: 'highly-connected' as const } },
      locations: [
        { id: 'surface', position: { x: 0, y: 0, z: 0 }, starting: true },
        { id: 'basement', position: { x: 1, y: 0, z: -1 } },
      ],
      actions: [],
      skills: [],
      stats: [],
      items: [],
      flags: [],
      resourceDefinitions: [],
      effects: [],
      interactionTypes: [],
      enemies: [],
      locales: { en: {} },
    };
    const playState = { ...createInitialPlayState('test', 'surface'), discoveredLocationIds: ['surface', 'basement'] };
    const graph = getVisibleTravelGraph(bundle, playState, gridContext(bundle.locations));

    expect(graph.locations.map((location) => location.id)).toEqual(['surface']);
  });
});

describe('getLocationInDirection', () => {
  const bundle = {
    locations: [
      { id: 'center', position: { x: 0, y: 0 } },
      { id: 'north', position: { x: 0, y: -1 } },
      { id: 'southeast', position: { x: 1, y: 1 } },
      { id: 'other-layer', position: { x: 1, y: 0, z: -1 } },
    ] as LocationNode[],
  };

  it('finds the neighboring location in a cardinal direction', () => {
    expect(getLocationInDirection(bundle, 'center', 'n')?.id).toBe('north');
    expect(getLocationInDirection(bundle, 'center', 'se')?.id).toBe('southeast');
  });

  it('returns null when there is no location in that direction, including across z-layers', () => {
    expect(getLocationInDirection(bundle, 'center', 's')).toBeNull();
    expect(getLocationInDirection(bundle, 'center', 'e')).toBeNull();
  });
});
