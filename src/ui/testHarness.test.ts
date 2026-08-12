import { describe, expect, it } from 'vitest';
import { createSurfaceRegistry, installTestHarness, testState } from './testHarness';
import type { Driver, DriverSnapshot } from './driver';
import { emptyTranscript } from './transcript';

function snapshot(overrides: Partial<DriverSnapshot> = {}): DriverSnapshot {
  return {
    fault: null,
    live: null,
    transcript: emptyTranscript(),
    view: {
      location: { id: 'start', title: 'Start', description: 'Here' },
      entities: [],
      choices: [
        { id: 'talk:guide', kind: 'talk', label: 'Talk', detail: 'Guide' },
        { id: 'travel:yard', kind: 'travel', label: 'Yard', leadsTo: 'yard' },
      ],
      time: 12,
      resources: [{ id: 'energy', title: 'Energy', current: 3, max: 5, display: 'full' }],
      encounter: null,
      modals: [],
      journey: null,
      inventory: {},
      equipment: {},
      xp: {},
      stats: {},
      flags: {},
      discovered: [{ id: 'start', title: 'Start', x: 0, y: 0, z: 0, adjacent: [{ to: 'yard', open: true }] }],
      player: { name: 'Miri', race: 'human' },
      action: null,
      said: [],
    },
    ...overrides,
  };
}

function driver(current: DriverSnapshot, calls: string[] = []): Driver {
  return {
    subscribe: () => () => undefined,
    snapshot: () => current,
    transient: { play: () => '', notes: () => [], playedSince: () => ({ moments: [], cursor: 0 }), subscribe: () => () => undefined },
    send: (line) => void calls.push(`send:${line}`),
    choose: (position) => void calls.push(`choose:${position}`),
    answer: (key, value) => void calls.push(`answer:${key}=${value}`),
    cancel: () => void calls.push('cancel'),
    serialized: () => null,
  };
}

describe('the browser test harness', () => {
  it('projects the driver snapshot as structured state', () => {
    const state = testState(snapshot());

    expect(state.location).toEqual({ id: 'start', title: 'Start' });
    expect(state.choices.map((choice) => [choice.id, choice.position])).toEqual([
      ['talk:guide', 1],
      ['travel:yard', 2],
    ]);
    expect(state.resources[0].title).toBe('Energy');
    expect(state.player?.name).toBe('Miri');
  });

  it('publishes named actions and batches one result per step', async () => {
    const calls: string[] = [];
    const host: { __test?: ReturnType<typeof installTestHarness> } = {};
    const harness = installTestHarness(driver(snapshot(), calls), host, { settle: async () => undefined });

    expect(host.__test).toBe(harness);
    expect(harness.actions()).toEqual(['answer', 'cancel', 'choice', 'choose', 'send']);

    const results = await harness.batch([
      { target: 'choice', value: 'travel:yard' },
      { target: 'send', value: '/look' },
      { target: 'answer', value: { key: 'name', value: 'Miri' } },
      { target: 'cancel' },
    ]);

    expect(results.map((result) => result.ok)).toEqual([true, true, true, true]);
    expect(calls).toEqual(['choose:2', 'send:/look', 'answer:name=Miri', 'cancel']);
    expect(results).toHaveLength(4);
  });

  it('returns a failed step rather than throwing when a command is not registered', async () => {
    const harness = installTestHarness(driver(snapshot()), {}, { settle: async () => undefined });

    const [result] = await harness.batch([{ target: 'missing' }]);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('action is not registered: missing');
    expect(result.state.location?.id).toBe('start');
  });

  it('reaches what a component registered, by the surface name joined to the action name', async () => {
    const moved: unknown[] = [];
    const surfaces = createSurfaceRegistry();
    surfaces.register('shell', () => ({ actions: { layer: (value) => void moved.push(value) }, state: () => ({ layer: 'home' }) }));
    const harness = installTestHarness(driver(snapshot()), {}, { settle: async () => undefined, surfaces });

    expect(harness.actions()).toEqual(['answer', 'cancel', 'choice', 'choose', 'send', 'shell.layer']);
    const [result] = await harness.batch([{ target: 'shell.layer', value: 'map' }]);

    expect(result.ok).toBe(true);
    expect(moved).toEqual(['map']);
    expect(result.state.surfaces).toEqual({ shell: { layer: 'home' } });
  });

  it('calls the surface as it stands now, not as it stood when it registered', async () => {
    const surfaces = createSurfaceRegistry();
    const taken: string[] = [];
    let generation = 1;
    surfaces.register('shell', () => ({ actions: { layer: () => void taken.push(`generation ${generation}`) } }));
    const harness = installTestHarness(driver(snapshot()), {}, { settle: async () => undefined, surfaces });

    await harness.batch([{ target: 'shell.layer' }]);
    generation = 2;
    await harness.batch([{ target: 'shell.layer' }]);

    expect(taken).toEqual(['generation 1', 'generation 2']);
  });

  it('forgets a surface whose component has gone, rather than driving one that is not there', async () => {
    const surfaces = createSurfaceRegistry();
    const drop = surfaces.register('map', () => ({ actions: { plane: () => undefined }, state: () => ({ plane: 0 }) }));
    const harness = installTestHarness(driver(snapshot()), {}, { settle: async () => undefined, surfaces });

    drop();

    expect(harness.actions()).not.toContain('map.plane');
    expect(harness.state().surfaces).toEqual({});
    const [result] = await harness.batch([{ target: 'map.plane', value: 0 }]);
    expect(result.error).toBe('action is not registered: map.plane');
  });

  it('reports what a component refused rather than throwing out of the batch', async () => {
    const surfaces = createSurfaceRegistry();
    surfaces.register('map', () => ({
      actions: {
        plane: () => {
          throw new Error('no plane is drawn at 4');
        },
      },
    }));
    const harness = installTestHarness(driver(snapshot()), {}, { settle: async () => undefined, surfaces });

    const [refused, taken] = await harness.batch([{ target: 'map.plane', value: 4 }, { target: 'cancel' }]);

    expect([refused.ok, refused.error]).toEqual([false, 'no plane is drawn at 4']);
    expect(taken.ok).toBe(true);
  });

  it('does not let a hidden choice be taken by id', async () => {
    const calls: string[] = [];
    const harness = installTestHarness(driver(snapshot(), calls), {}, { settle: async () => undefined });

    const [result] = await harness.batch([{ target: 'choice', value: 'travel:cellar' }]);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('choice is not visible: travel:cellar');
    expect(calls).toEqual([]);
  });
});
