import { describe, expect, it } from 'vitest';
import { sanitizePlayStateForBundle } from './moduleCleanup';
import { createInitialPlayState } from './timers';
import type { ContentBundle } from './types';

const bundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: 'test', version: '1.0.0', author: 'test', locales: ['en'], files: [] },
  locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true }],
  actions: [],
  skills: [{ id: 'mining', maxLevel: 100 }],
  stats: [{ id: 'strength' }],
  items: [{ id: 'kept-item' }],
  flags: [{ id: 'kept-flag' }],
  resourceDefinitions: [{ id: 'stamina', sourceStat: 'strength' }],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dialogues: [],
  locales: { en: {} },
});

describe('module cleanup', () => {
  it('removes inventory and equipment for missing items', () => {
    const state = {
      ...createInitialPlayState('test', 'start'),
      inventory: { 'kept-item': 1, 'removed-item': 2 },
      equipment: { mainhand: 'removed-item' as const },
    };

    const result = sanitizePlayStateForBundle(state, bundle(), 'start');

    expect(result.state.inventory).toEqual({ 'kept-item': 1 });
    expect(result.state.equipment).toEqual({});
    expect(result.report.removedInventoryIds).toEqual(['removed-item']);
    expect(result.report.removedEquipmentItemIds).toEqual(['removed-item']);
  });

  it('cancels active content that no longer exists', () => {
    const state = {
      ...createInitialPlayState('test', 'start'),
      activeAction: { actionId: 'removed-action', startedAt: 1, completesAt: 2, targetHealth: null },
      actionProgress: { 'removed-action': { elapsedMs: 1, runningSince: 1 } },
      activeDialogue: { dialogueId: 'removed-dialogue', nodeId: 'start' },
    };

    const result = sanitizePlayStateForBundle(state, bundle(), 'start');

    expect(result.state.activeAction).toBeNull();
    expect(result.state.actionProgress).toEqual({});
    expect(result.state.activeDialogue).toBeNull();
    expect(result.report.cancelledActionId).toBe('removed-action');
    expect(result.report.cancelledDialogueId).toBe('removed-dialogue');
  });

  it('cancels an active dialogue when its saved node no longer exists', () => {
    const state = {
      ...createInitialPlayState('test', 'start'),
      activeDialogue: { dialogueId: 'kept-dialogue', nodeId: 'removed-node' },
    };
    const nextBundle = {
      ...bundle(),
      dialogues: [{ id: 'kept-dialogue', startNodeId: 'start', nodes: [{ id: 'start', textKey: 'dialogue.start' }] }],
    };

    const result = sanitizePlayStateForBundle(state, nextBundle, 'start');

    expect(result.state.activeDialogue).toBeNull();
    expect(result.report.cancelledDialogueId).toBeUndefined();
    expect(result.report.cancelledDialogueNodeId).toBe('kept-dialogue.removed-node');
  });

  it('removes saved skill state from skill xp and equipment bonuses', () => {
    const state = {
      ...createInitialPlayState('test', 'start'),
      skillXp: { mining: 10, 'removed-skill': 20 },
      equipmentSkillBonuses: {
        mining: { added: 1 },
        'removed-skill': { added: 5 },
      },
    };

    const result = sanitizePlayStateForBundle(state, bundle(), 'start');

    expect(result.state.skillXp).toEqual({ mining: 10 });
    expect(result.state.equipmentSkillBonuses).toEqual({ mining: { added: 1 } });
    expect(result.report.removedSkillIds).toEqual(['removed-skill']);
  });

  it('relocates the player if the current location is removed', () => {
    const state = {
      ...createInitialPlayState('test', 'removed-location'),
      discoveredLocationIds: ['removed-location', 'start'],
    };

    const result = sanitizePlayStateForBundle(state, bundle(), 'start');

    expect(result.state.currentLocationId).toBe('start');
    expect(result.state.discoveredLocationIds).toEqual(['start']);
    expect(result.report.relocatedToLocationId).toBe('start');
    expect(result.report.removedLocationIds).toEqual(['removed-location']);
  });
});
