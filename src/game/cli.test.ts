import { describe, expect, it, vi } from 'vitest';
import { executeChatInput, type CliRuntime } from './cli';
import { createInitialPlayState } from './timers';
import type { ActionResolutionContext, ContentBundle, GameAction, ItemDefinition, UniversePlayState } from './types';

const t = (key: string, fallbackOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>) => {
  const interpolation = typeof fallbackOrParams === 'object' ? fallbackOrParams : params;
  const fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : key;
  return interpolation
    ? fallback.replace(/\{([^}]+)\}/g, (match, name) => String(interpolation[name] ?? match))
    : fallback;
};

const cookedShrimp: ItemDefinition = { id: 'cooked-shrimp', tags: 'food, +3 regeneration, 60s' };
const lockpick: ItemDefinition = { id: 'lockpick' };

const lookAction: GameAction = { id: 'entity.door.pick', locationId: 'start', instant: true, rewards: [] };
const travelAction: GameAction = { id: 'travel-start-to-forest', locationId: 'start', role: 'travel', durationSeconds: 5, rewards: [], results: [{ kind: 'relocate', locationId: 'forest' }] };

const bundle: ContentBundle = {
  manifest: { schemaVersion: 1, id: 'test', version: '1', author: 'test', locales: ['en'], files: [] },
  locations: [
    { id: 'start', position: { x: 0, y: 0 }, starting: true, entities: ['door'] },
    { id: 'forest', position: { x: 1, y: 0 } },
  ],
  entities: [{ id: 'door', actionIds: ['entity.door.pick'] }],
  actions: [lookAction, travelAction],
  skills: [],
  stats: [{ id: 'attack', base: 6 }],
  items: [cookedShrimp, lockpick],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  quests: [],
  locales: { en: {} },
};

const context: ActionResolutionContext = {
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
  manifest: bundle.manifest,
};

const buildRuntime = (playState: UniversePlayState, overrides: Partial<CliRuntime> = {}) => {
  const messages: Array<{ text: string; author: 'system' | 'player' }> = [];
  const runtime: CliRuntime = {
    getBundle: () => bundle,
    getPlayState: () => playState,
    getActionContext: () => context,
    getTranslator: () => t,
    isDebugEnabled: () => false,
    appendMessage: (text, author = 'system') => messages.push({ text, author }),
    startAction: vi.fn(),
    chooseDialogueOption: vi.fn(),
    equipItem: vi.fn(),
    unequipSlot: vi.fn(),
    eatItem: vi.fn(),
    dropInventoryItem: vi.fn(),
    pickUpGroundItem: vi.fn(),
    travelTo: vi.fn(),
    changeSetting: vi.fn(() => ({ ok: true, message: '' })),
    debugGiveItem: vi.fn(),
    debugSetFlag: vi.fn(),
    debugSetSkillXp: vi.fn(),
    teleport: vi.fn(),
    ...overrides,
  };
  return { runtime, messages };
};

describe('executeChatInput', () => {
  it('treats plain text as a player chat message', () => {
    const { runtime, messages } = buildRuntime(createInitialPlayState('test', 'start'));
    executeChatInput('hello there', runtime);
    expect(messages).toEqual([{ text: 'hello there', author: 'player' }]);
  });

  it('reports unknown commands', () => {
    const { runtime, messages } = buildRuntime(createInitialPlayState('test', 'start'));
    executeChatInput('/bogus', runtime);
    expect(messages[1].text).toContain('Unknown command');
  });

  it('/help lists commands and /help <command> shows usage', () => {
    const { runtime, messages } = buildRuntime(createInitialPlayState('test', 'start'));
    executeChatInput('/help', runtime);
    expect(messages[1].text).toContain('/inventory');

    executeChatInput('/help eat', runtime);
    expect(messages[3].text).toBe('/eat <item> - Eat a food item from your inventory.');
  });

  it('/inventory lists carried items', () => {
    const state = { ...createInitialPlayState('test', 'start'), inventory: { 'cooked-shrimp': 2 } };
    const { runtime, messages } = buildRuntime(state);
    executeChatInput('/inventory', runtime);
    expect(messages[1].text).toContain('cooked-shrimp x2');
  });

  it('/eat delegates to rt.eatItem when the item is food and held', () => {
    const state = { ...createInitialPlayState('test', 'start'), inventory: { 'cooked-shrimp': 1 } };
    const { runtime } = buildRuntime(state);
    executeChatInput('/eat cooked-shrimp', runtime);
    expect(runtime.eatItem).toHaveBeenCalledWith('cooked-shrimp');
  });

  it('/eat refuses an item that is not food', () => {
    const state = { ...createInitialPlayState('test', 'start'), inventory: { lockpick: 1 } };
    const { runtime, messages } = buildRuntime(state);
    executeChatInput('/eat lockpick', runtime);
    expect(runtime.eatItem).not.toHaveBeenCalled();
    expect(messages[1].text).toContain("can't eat");
  });

  it('/examine shows the item title (description falls back to empty)', () => {
    const { runtime, messages } = buildRuntime(createInitialPlayState('test', 'start'));
    executeChatInput('/examine cooked-shrimp', runtime);
    expect(messages[1].text).toContain('cooked-shrimp');
  });

  it('/do dispatches the numbered action from the most recent /look', () => {
    // Only 1 item: `travelAction` is a pure travel action (no cost, single
    // relocate result), which the choice list never surfaces as a numbered
    // action — travel happens via the map/pathfinding instead.
    const { runtime } = buildRuntime(createInitialPlayState('test', 'start'));
    executeChatInput('/do 1', runtime);
    expect(runtime.startAction).toHaveBeenCalledWith('entity.door.pick', undefined);
  });

  it('/do reports an out-of-range index without dispatching', () => {
    const { runtime, messages } = buildRuntime(createInitialPlayState('test', 'start'));
    executeChatInput('/do 99', runtime);
    expect(runtime.startAction).not.toHaveBeenCalled();
    expect(messages[1].text).toContain("no action #99");
  });

  it('/goto travels along the found path', () => {
    const { runtime } = buildRuntime(createInitialPlayState('test', 'start'));
    executeChatInput('/goto forest', runtime);
    expect(runtime.travelTo).toHaveBeenCalledTimes(1);
    const path = (runtime.travelTo as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(path).toHaveLength(1);
    expect(path[0].action.id).toBe('travel-start-to-forest');
  });

  it('/goto reports an unknown location by name', () => {
    const { runtime, messages } = buildRuntime(createInitialPlayState('test', 'start'));
    executeChatInput('/goto nowhereville', runtime);
    expect(runtime.travelTo).not.toHaveBeenCalled();
    expect(messages[1].text).toContain("don't know a place");
  });

  it('/change-setting delegates to rt.changeSetting', () => {
    const { runtime } = buildRuntime(createInitialPlayState('test', 'start'));
    executeChatInput('/change-setting show-gui false', runtime);
    expect(runtime.changeSetting).toHaveBeenCalledWith('show-gui', 'false');
  });

  it('blocks cheat commands when debug mode is disabled', () => {
    const { runtime, messages } = buildRuntime(createInitialPlayState('test', 'start'), { isDebugEnabled: () => false });
    executeChatInput('/cheat give cooked-shrimp 5', runtime);
    expect(runtime.debugGiveItem).not.toHaveBeenCalled();
    expect(messages[1].text).toContain('debug mode');
  });

  it('allows cheat commands when debug mode is enabled', () => {
    const { runtime } = buildRuntime(createInitialPlayState('test', 'start'), { isDebugEnabled: () => true });
    executeChatInput('/cheat give cooked-shrimp 5', runtime);
    expect(runtime.debugGiveItem).toHaveBeenCalledWith('cooked-shrimp', 5);
  });

  it('/help omits cheat commands unless debug mode is enabled', () => {
    const disabled = buildRuntime(createInitialPlayState('test', 'start'), { isDebugEnabled: () => false });
    executeChatInput('/help', disabled.runtime);
    expect(disabled.messages[1].text).not.toContain('/cheat');

    const enabled = buildRuntime(createInitialPlayState('test', 'start'), { isDebugEnabled: () => true });
    executeChatInput('/help', enabled.runtime);
    expect(enabled.messages[1].text).toContain('/cheat');
  });
});
