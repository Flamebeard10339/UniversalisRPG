import { describe, expect, it } from 'vitest';
import { normalizeContentBundleStructure } from './contentNormalization';
import type { ContentBundle } from './types';

const bundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: 'test', version: '0.1.0', author: 'test', locales: ['en'], files: [] },
  locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true, entities: ['goblin'] }],
  entities: [{
    id: 'goblin',
    actions: [{ id: 'fight', durationSeconds: 1, rewards: [] }],
  }],
  actions: [],
  skills: [],
  stats: [],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dropTables: [],
  dialogues: [],
  locales: { en: {} },
});

describe('content normalization', () => {
  it('does not duplicate derived entity action ids when normalized repeatedly', () => {
    const once = normalizeContentBundleStructure(bundle());
    const twice = normalizeContentBundleStructure(once);

    expect(once.entities?.find((entity) => entity.id === 'goblin')?.actionIds).toEqual(['entity.goblin.fight']);
    expect(twice.entities?.find((entity) => entity.id === 'goblin')?.actionIds).toEqual(['entity.goblin.fight']);
    expect(twice.actions.filter((action) => action.id === 'entity.goblin.fight')).toHaveLength(1);
  });
});
