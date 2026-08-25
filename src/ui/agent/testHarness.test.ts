import { describe, expect, it } from 'vitest';
import { asLocalized } from '../../runtime/localizedFixture';
import { createSurfaceRegistry, installTestHarness, testState } from './testHarness';
import type { Driver, DriverSnapshot } from '../driver';
import { loadInEnglish } from '../../content/engineLocale';
import { localizerFor } from '../../runtime/localized';
import { createTransientChannel, type TransientChannel } from '../transient';
import { emptyTranscript } from '../transcript';

function snapshot(overrides: Partial<DriverSnapshot> = {}): DriverSnapshot {
  return {
    problems: [],
    remedies: [],
    dev: false,
    speed: 1,
    live: null,
    playtest: null,
    replay: null,
    transcript: emptyTranscript(),
    view: {
      location: { id: 'start', title: asLocalized('Start'), description: asLocalized('Here') },
      entities: [],
      choices: [
        { id: 'talk:guide', kind: 'talk', label: asLocalized('Talk'), detail: asLocalized('Guide') },
        { id: 'travel:yard', kind: 'travel', label: asLocalized('Yard'), leadsTo: 'yard' },
      ],
      time: 12,
      resources: [{ id: 'energy', title: asLocalized('Energy'), current: 3, max: 5, display: 'full' }],
      encounter: null,
      modals: [],
      journey: null,
      journal: [],
      inventory: {},
      grown: {},
      carried: [],
      planes: [],
      focus: null,
      equipment: [],
      xp: [],
      stats: [],
        flags: {},
      discovered: [{ id: 'start', title: asLocalized('Start'), x: 0, y: 0, z: 0, adjacent: [{ to: 'yard', open: true }] }],
      locations: [{ id: 'start', title: asLocalized('Start') }, { id: 'yard', title: asLocalized('Yard') }],
      player: { name: { id: 'Miri', label: asLocalized('Name'), title: asLocalized('Miri') }, race: { id: 'human', label: asLocalized('Race'), title: asLocalized('Human') } },
      settings: [],
      action: null,
      said: [],
    },
    ...overrides,
  };
}

function driver(current: DriverSnapshot, calls: string[] = [], transient: TransientChannel = createTransientChannel()): Driver {
  return {
    subscribe: () => () => undefined,
    snapshot: () => current,
    transient,
    send: (line) => void calls.push(`send:${line}`),
    replay: {
      watching: (test) => void calls.push(`replay:watching:${String(test)}`),
      at: (step) => void calls.push(`replay:at:${step}`),
      playing: (on) => void calls.push(`replay:playing:${String(on)}`),
      every: (seconds) => void calls.push(`replay:every:${seconds}`),
    },
    playtest: {
      start: () => void calls.push('playtest:start'),
      stop: () => {
        calls.push('playtest:stop');
        return { filed: true, at: 'local-changes.run', text: '' };
      },
      attach: (turn) => void calls.push(`playtest:attach:${turn}`),
      moved: (where) => void calls.push(`playtest:moved:${where}`),
      written: () => '',
    },
    declared: () => [],
    choose: (position) => void calls.push(`choose:${position}`),
    answer: (key, value) => void calls.push(`answer:${key}=${value}`),
    open: (item) => void calls.push(`open:${item}`),
    readQuest: (quest) => void calls.push(`quest:${quest}`),
    localizer: () => localizerFor(loadInEnglish(''), 'en'),
    cancel: () => void calls.push('cancel'),
    serialized: () => '',
    localChanges: () => null,
    baseSources: () => [],
    editorMemory: { read: () => null, write: (text) => void calls.push(`editorMemory:${text}`) },
    note: (text) => void calls.push(`note:${text}`),
    reopen: () => void calls.push('reopen'),
    clearLocalChanges: () => void calls.push('clearLocalChanges'),
  };
}

describe('the browser test harness', () => {
  it('carries the published view itself, so a field the runtime adds needs no edit here', () => {
    const held = snapshot();

    expect(testState(held).view).toBe(held.view);
  });

  it('works the driver conveniences out beside the view rather than in place of a field of it', () => {
    const state = testState(snapshot());

    expect(state.choices.map((choice) => [choice.id, choice.position])).toEqual([
      ['talk:guide', 1],
      ['travel:yard', 2],
    ]);
    expect(state.view.resources[0].title).toBe('Energy');
    expect(state.view.player.name?.title).toBe('Miri');
    expect(state.view.journey).toBeNull();
    expect(state.view.inventory).toEqual({});
  });

  it('publishes named actions and batches one result per step', async () => {
    const calls: string[] = [];
    const host: { __test?: ReturnType<typeof installTestHarness> } = {};
    const harness = installTestHarness(driver(snapshot(), calls), host, { settle: async () => undefined });

    expect(host.__test).toBe(harness);
    expect(harness.actions()).toEqual(['answer', 'cancel', 'choice', 'choose', 'clear-local', 'reopen', 'send']);

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
    expect(result.state.view.location.id).toBe('start');
  });

  it('reaches what a component registered, by the surface name joined to the action name', async () => {
    const moved: unknown[] = [];
    const surfaces = createSurfaceRegistry();
    surfaces.register('shell', () => ({ actions: { layer: (value) => void moved.push(value) }, state: () => ({ layer: 'home' }) }));
    const harness = installTestHarness(driver(snapshot()), {}, { settle: async () => undefined, surfaces });

    expect(harness.actions()).toEqual(['answer', 'cancel', 'choice', 'choose', 'clear-local', 'reopen', 'send', 'shell.layer']);
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

  it('reports a moment that began and ended between two steps, which a read of the state cannot see', async () => {
    const expiring: Array<() => void> = [];
    const channel = createTransientChannel({ schedule: (expire) => void expiring.push(expire) });
    const surfaces = createSurfaceRegistry();
    surfaces.register('shell', () => ({ actions: { layer: () => void channel.note({ key: 'brief', count: 0, words: asLocalized('briefer than the settle') }) } }));
    const harness = installTestHarness(driver(snapshot(), [], channel), {}, {
      settle: async () => void expiring.splice(0).forEach((expire) => expire()),
      surfaces,
    });

    const [result] = await harness.batch([{ target: 'shell.layer', value: 'map' }]);

    expect(channel.notices()).toEqual([]);
    expect(result.played.map((moment) => [moment.kind, moment.subject])).toEqual([['note', 'briefer than the settle']]);
  });

  it("never reports one step's moments as the next step's", async () => {
    const channel = createTransientChannel();
    const surfaces = createSurfaceRegistry();
    let place = 'first';
    surfaces.register('shell', () => ({ actions: { layer: () => void channel.play('arrival', place) } }));
    const harness = installTestHarness(driver(snapshot(), [], channel), {}, { settle: async () => undefined, surfaces });

    const [one] = await harness.batch([{ target: 'shell.layer' }]);
    place = 'second';
    const [two] = await harness.batch([{ target: 'shell.layer' }]);

    expect(one.played.map((moment) => moment.subject)).toEqual(['first']);
    expect(two.played.map((moment) => moment.subject)).toEqual(['second']);
  });

  it("moves the cursor over a refused step, so its moments are not replayed as the next one's", async () => {
    const channel = createTransientChannel();
    const surfaces = createSurfaceRegistry();
    surfaces.register('map', () => ({
      actions: {
        plane: () => {
          channel.play('arrival', 'got as far as here');
          throw new Error('no plane is drawn at 4');
        },
      },
    }));
    const harness = installTestHarness(driver(snapshot(), [], channel), {}, { settle: async () => undefined, surfaces });

    const [refused, after] = await harness.batch([{ target: 'map.plane', value: 4 }, { target: 'cancel' }]);

    expect(refused.played.map((moment) => moment.subject)).toEqual(['got as far as here']);
    expect(after.played).toEqual([]);
  });

  it('starts its cursor where the session already is, not at the beginning of it', async () => {
    const channel = createTransientChannel();
    channel.play('arrival', 'before the harness was installed');
    const harness = installTestHarness(driver(snapshot(), [], channel), {}, { settle: async () => undefined });

    const [result] = await harness.batch([{ target: 'cancel' }]);

    expect(result.played).toEqual([]);
  });
});
