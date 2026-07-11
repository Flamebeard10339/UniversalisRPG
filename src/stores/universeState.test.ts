import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentBundle, ContentModule } from '../game/types';

// The real implementation goes through Capacitor Preferences, which isn't
// available under vitest's node environment.
vi.mock('../lib/storage', () => ({
  save: vi.fn(() => Promise.resolve()),
  load: vi.fn(() => Promise.resolve(null)),
  remove: vi.fn(() => Promise.resolve()),
}));

import { applyModulesAndDraft } from './universeState';
import { useContributionState } from './contributionState';
import { useDslEditorState } from './dslEditorState';

const universeId = 'test';

const baseBundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: universeId, version: '0.1.0', author: 'test', locales: ['en'], files: [] },
  locations: [],
  entities: [{ id: 'keeper' }],
  actions: [],
  skills: [],
  stats: [],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dialogues: [],
  locales: { en: { 'location.start.title': 'Start', 'entity.keeper.title': 'Keeper' } },
});

const module = (patch: Partial<ContentModule> & Pick<ContentModule, 'id'>): ContentModule => ({
  version: '1.0.0',
  universe: universeId,
  author: 'test',
  game_version: '1.0',
  ...patch,
});

// A module referencing an entity id that doesn't exist anywhere triggers
// the same moduleConflictDisabled cascade an undeclared flag reference
// does (see contentModules.test.ts) — simpler to construct directly here
// than reproducing the DSL flag-scoping bug at this layer.
const goodModule = module({ id: 'editable', data: { locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true, entities: ['keeper'] }] } });
const brokenModule = module({ id: 'editable', data: { locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true, entities: ['keeper', 'missing-entity'] }] } });

describe('applyModulesAndDraft — module-conflict-disable fallback', () => {
  beforeEach(() => {
    useContributionState.setState({ drafts: {} });
    useDslEditorState.setState({ drafts: {} });
  });

  it('resolves a clean draft normally and records it as playable', () => {
    useDslEditorState.getState().openDraft('editable', '');
    useContributionState.getState().updateDraft(universeId, { modules: [goodModule] });

    const result = applyModulesAndDraft(baseBundle(), {}, 'system');

    expect(result.bundle?.locations[0]?.entities).toEqual(['keeper']);
    expect(result.validationIssues.some((issue) => issue.message === 'validation.moduleConflictDisabled')).toBe(false);
    expect(useDslEditorState.getState().getDraft('editable')?.lastPlayableModule).toEqual(goodModule);
  });

  it('falls back to the last-playable module version when the current draft newly disables it, while still surfacing the real issue', () => {
    useDslEditorState.getState().openDraft('editable', '');
    useContributionState.getState().updateDraft(universeId, { modules: [goodModule] });
    applyModulesAndDraft(baseBundle(), {}, 'system'); // seeds lastPlayableModule with goodModule

    useContributionState.getState().updateDraft(universeId, { modules: [brokenModule] });
    const result = applyModulesAndDraft(baseBundle(), {}, 'system');

    // Gameplay stays on the last-playable (good) version — the missing
    // entity reference from the broken draft never reaches the live bundle.
    expect(result.bundle?.locations[0]?.entities).toEqual(['keeper']);
    // The editor still sees the real problem with the current draft.
    expect(result.validationIssues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.editable',
    }));
    // lastPlayableModule is untouched by the broken attempt — it doesn't
    // advance to a version that's known to break something.
    expect(useDslEditorState.getState().getDraft('editable')?.lastPlayableModule).toEqual(goodModule);
  });

  it('leaves a module that has never resolved cleanly this session as-is (nothing safer to fall back to)', () => {
    useDslEditorState.getState().openDraft('editable', '');
    useContributionState.getState().updateDraft(universeId, { modules: [brokenModule] });

    const result = applyModulesAndDraft(baseBundle(), {}, 'system');

    expect(result.validationIssues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.editable',
    }));
    expect(useDslEditorState.getState().getDraft('editable')?.lastPlayableModule).toBeUndefined();
  });
});
