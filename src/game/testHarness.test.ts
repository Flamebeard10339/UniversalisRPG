import { describe, expect, it, vi } from 'vitest';
import { createTestHarness, type TestHarnessDeps } from './testHarness';
import { createInitialPlayState } from './timers';
import type { ContentBundle, GameAction, UniversePlayState } from './types';

const baseBundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: 'test', version: '0.1.0', author: 'test', locales: ['en'], files: [] },
  locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true, entities: [] }],
  entities: [],
  actions: [
    { id: 'look-around', locationId: 'start', instant: true, rewards: [], results: [] } satisfies GameAction,
  ],
  skills: [{ id: 'mining', maxLevel: 100, statId: 'mining' }],
  stats: [{ id: 'mining', base: 6 }],
  items: [{ id: 'gold' }],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dropTables: [],
  collectionLogs: [],
  dialogues: [],
  quests: [],
  recipes: [],
  statModifiers: [],
  locales: { en: { 'action.look-around.title': 'Look Around' } },
});

const translator = (key: string, fallback?: string | Record<string, unknown>) =>
  (typeof fallback === 'string' ? fallback : undefined) ?? key;

type Overrides = Partial<TestHarnessDeps> & { bundle?: ContentBundle; playState?: UniversePlayState | undefined };

const buildDeps = (overrides: Overrides = {}): TestHarnessDeps => {
  const bundle = overrides.bundle ?? baseBundle();
  const playState = 'playState' in overrides ? overrides.playState : createInitialPlayState('test', 'start', { manifest: bundle.manifest });
  const context = {
    manifest: bundle.manifest,
    actions: bundle.actions,
    skills: bundle.skills,
    stats: bundle.stats,
    locations: bundle.locations,
    entities: bundle.entities,
    items: bundle.items,
    flags: bundle.flags,
    resourceDefinitions: bundle.resourceDefinitions,
    effects: bundle.effects,
    interactionTypes: bundle.interactionTypes,
    enemies: bundle.enemies,
    dropTables: bundle.dropTables,
    dialogues: bundle.dialogues,
    recipes: bundle.recipes,
    statModifiers: bundle.statModifiers,
  };

  return {
    getBundle: () => bundle,
    getPlayState: () => playState,
    getActionContext: () => context,
    getRuntimeUniverseId: () => 'test',
    getStartingLocationId: () => 'start',
    getTranslator: () => translator,
    getTabs: () => ({ activeTab: 'home', homeTab: 'actions', characterTab: 'skills' }),
    dom: {
      listButtons: vi.fn(() => []),
      findActionButton: vi.fn(() => null),
      clickActionButton: vi.fn(() => false),
      findDialogueOptionButton: vi.fn(() => null),
      clickDialogueOptionButton: vi.fn(() => false),
      findDialogueContinueButton: vi.fn(() => null),
      clickDialogueContinueButton: vi.fn(() => false),
      clickNavTab: vi.fn(() => false),
      clickHomeTab: vi.fn(() => false),
      clickCharacterTab: vi.fn(() => false),
      clickUnequip: vi.fn(() => false),
      clickEquip: vi.fn(() => false),
    },
    setTab: vi.fn(),
    setHomeTab: vi.fn(),
    setCharacterTab: vi.fn(),
    startAction: vi.fn(),
    stopAction: vi.fn(),
    chooseDialogueOption: vi.fn(),
    cancelDialogue: vi.fn(),
    resolveIdle: vi.fn(() => ({ kind: 'none' as const })),
    setCurrentLocation: vi.fn(),
    equipItem: vi.fn(),
    unequipSlot: vi.fn(),
    eatItem: vi.fn(),
    dropInventoryItem: vi.fn(),
    pickUpGroundItem: vi.fn(),
    depositToBank: vi.fn(),
    withdrawFromBank: vi.fn(),
    closeModal: vi.fn(),
    replaceUniverseState: vi.fn(async () => undefined),
    resetUniverse: vi.fn(async () => undefined),
    debugSetFlag: vi.fn(),
    debugSetResource: vi.fn(),
    debugSetSkillXp: vi.fn(),
    debugSetInventoryItem: vi.fn(),
    debugGiveItem: vi.fn(),
    debugSetBankItem: vi.fn(),
    listProfileNames: vi.fn(() => ['post-guide-house']),
    loadProfileFixture: vi.fn((name: string) => (name === 'post-guide-house' ? { currentLocationId: 'start', flags: { foo: true } } : null)),
    ...overrides,
  };
};

describe('testHarness state', () => {
  it('setFlag delegates to the store mutator and reports success', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.state.setFlag('tutorial.done', true)).toEqual({ ok: true });
    expect(deps.debugSetFlag).toHaveBeenCalledWith('tutorial.done', true);
  });

  it('setResource rejects unknown resource ids without calling the mutator', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.state.setResource('nonexistent', 5)).toEqual({ ok: false, error: 'unknown-resource' });
    expect(deps.debugSetResource).not.toHaveBeenCalled();
  });

  it('getSkills derives level from skillXp via the bundle skill list', () => {
    const bundle = baseBundle();
    const playState = { ...createInitialPlayState('test', 'start', { manifest: bundle.manifest }), skillXp: { mining: 0 } };
    const deps = buildDeps({ bundle, playState });
    const harness = createTestHarness(deps);
    expect(harness.state.getSkills()).toEqual({ mining: { xp: 0, level: 1 } });
  });
});

describe('testHarness inventory/bank/equipment', () => {
  it('bank.deposit refuses when the item is not held', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.bank.deposit('gold', 5)).toEqual({ ok: false, error: 'item-not-held' });
    expect(deps.depositToBank).not.toHaveBeenCalled();
  });

  it('bank.withdraw refuses when the item is not in the bank', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.bank.withdraw('gold', 5)).toEqual({ ok: false, error: 'item-not-in-bank' });
    expect(deps.withdrawFromBank).not.toHaveBeenCalled();
  });

  it('equipment.equip rejects unknown items before touching the store', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.equipment.equip('not-an-item', 'mainhand')).toEqual({ ok: false, error: 'unknown-item' });
    expect(deps.equipItem).not.toHaveBeenCalled();
  });

  it('equipment.equip prefers a real DOM click when one is available', () => {
    const deps = buildDeps({ dom: { ...buildDeps().dom, clickEquip: vi.fn(() => true) } });
    const harness = createTestHarness(deps);
    expect(harness.equipment.equip('gold', 'mainhand')).toEqual({ ok: true, viaDom: true });
    expect(deps.equipItem).not.toHaveBeenCalled();
  });

  it('equipment.equip falls back to the store dispatch when no DOM button is found', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.equipment.equip('gold', 'mainhand')).toEqual({ ok: true, viaDom: false });
    expect(deps.equipItem).toHaveBeenCalledWith('gold', 'mainhand', deps.getActionContext());
  });
});

describe('testHarness location', () => {
  it('teleport rejects unknown location ids', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.location.teleport('nowhere')).toEqual({ ok: false, error: 'unknown-location' });
    expect(deps.setCurrentLocation).not.toHaveBeenCalled();
  });

  it('teleport calls setCurrentLocation for a known location', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.location.teleport('start')).toEqual({ ok: true });
    expect(deps.setCurrentLocation).toHaveBeenCalledWith('start');
  });
});

describe('testHarness choices', () => {
  it('list() surfaces the bundle action visible at the current location', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    const choices = harness.choices.list();
    expect(choices).toEqual([
      expect.objectContaining({ id: 'action:look-around', kind: 'action', requirementsMet: true }),
    ]);
  });

  it('click() on an unknown id returns choice-not-visible with the available list', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.choices.click('action:not-real')).toEqual({
      ok: false,
      error: 'choice-not-visible',
      available: ['action:look-around'],
    });
  });

  it('click() prefers a real DOM click when the button is rendered', () => {
    const deps = buildDeps({
      dom: {
        ...buildDeps().dom,
        findActionButton: vi.fn(() => ({ disabled: false })),
        clickActionButton: vi.fn(() => true),
      },
    });
    const harness = createTestHarness(deps);
    expect(harness.choices.click('action:look-around')).toEqual({ ok: true, startedActionId: 'look-around', viaDom: true });
    expect(deps.startAction).not.toHaveBeenCalled();
  });

  it('click() falls back to a direct store dispatch when no DOM button is found', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.choices.click('action:look-around')).toEqual({ ok: true, startedActionId: 'look-around', viaDom: false });
    expect(deps.startAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'look-around' }),
      deps.getActionContext(),
      undefined,
    );
  });
});

describe('testHarness dialogue', () => {
  it('get() reports inactive when there is no active dialogue', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.dialogue.get()).toEqual({ active: false });
  });

  it('choose() refuses when there is no active dialogue', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    expect(harness.dialogue.choose('anything')).toEqual({ ok: false, error: 'no-active-dialogue' });
    expect(deps.chooseDialogueOption).not.toHaveBeenCalled();
  });

  it('choose() rejects an option id that does not exist on the active node', () => {
    const bundle = baseBundle();
    bundle.dialogues = [{
      id: 'greeter',
      startNodeId: 'start',
      nodes: [{ id: 'start', textKey: 'x', options: [{ id: 'yes', labelKey: 'y' }] }],
    }];
    const playState = {
      ...createInitialPlayState('test', 'start', { manifest: bundle.manifest }),
      activeDialogue: { dialogueId: 'greeter', nodeId: 'start' },
    };
    const deps = buildDeps({ bundle, playState });
    const harness = createTestHarness(deps);
    expect(harness.dialogue.choose('not-a-real-option')).toEqual({ ok: false, error: 'invalid-option' });
    expect(deps.chooseDialogueOption).not.toHaveBeenCalled();
  });
});

describe('testHarness profile', () => {
  it('load() reports unknown-profile for a missing fixture', async () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    await expect(harness.profile.load('does-not-exist')).resolves.toEqual({ ok: false, error: 'unknown-profile' });
    expect(deps.replaceUniverseState).not.toHaveBeenCalled();
  });

  it('load() replaces universe state with the fixture spread onto a fresh initial state', async () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    await expect(harness.profile.load('post-guide-house')).resolves.toEqual({ ok: true });
    expect(deps.replaceUniverseState).toHaveBeenCalledWith(
      expect.objectContaining({ currentLocationId: 'start', flags: { foo: true }, universeId: 'test' }),
    );
  });
});

describe('testHarness time', () => {
  it('skip() resolves idle timers at now + seconds*1000, not real time', () => {
    const deps = buildDeps();
    const harness = createTestHarness(deps);
    const before = Date.now();
    harness.time.skip(30);
    const [, , calledNow] = (deps.resolveIdle as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledNow).toBeGreaterThanOrEqual(before + 30_000);
  });
});
