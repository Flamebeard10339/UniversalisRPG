import { describe, expect, it } from 'vitest';
import { installTestHarness, testState } from './testHarness';
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
    transient: { announce: () => undefined, notes: () => [], subscribe: () => () => undefined },
    send: (line) => void calls.push(`send:${line}`),
    choose: (position) => void calls.push(`choose:${position}`),
    answer: (key, value) => void calls.push(`answer:${key}=${value}`),
    cancel: () => void calls.push('cancel'),
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

  it('does not let a hidden choice be taken by id', async () => {
    const calls: string[] = [];
    const harness = installTestHarness(driver(snapshot(), calls), {}, { settle: async () => undefined });

    const [result] = await harness.batch([{ target: 'choice', value: 'travel:cellar' }]);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('choice is not visible: travel:cellar');
    expect(calls).toEqual([]);
  });
});
