import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyModulesToBundle } from './contentModules';
import { compileDsl } from './contentDsl/compiler';
import type { ContentBundle, ContentModule, UniverseManifest } from './types';

const contentRoot = join(process.cwd(), 'public', 'content', 'universes', 'base');
const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(join(contentRoot, relativePath), 'utf8').replace(/^﻿/, '')) as unknown;
const readText = (relativePath: string) => readFileSync(join(contentRoot, relativePath), 'utf8').replace(/^﻿/, '');

// A module is authored as either promoted JSON or DSL markdown (see
// src/game/loader.ts's json-then-md fallback) — mirror that here so this
// test keeps reading exactly what the app loads at runtime.
const readModule = (id: string): ContentModule => {
  const jsonPath = `modules/${id}.json`;
  if (existsSync(join(contentRoot, jsonPath))) return readJson(jsonPath) as ContentModule;
  return compileDsl(readText(`modules/${id}.md`)).module;
};

const manifest = readJson('universe.json') as UniverseManifest;
const moduleIds = manifest.modules ?? [];
const modules = moduleIds.map((id) => readModule(id));
const baseLocale = readJson('locales/en.json') as Record<string, string>;

const emptyBundle = (): ContentBundle => ({
  manifest,
  locations: [],
  entities: [],
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
  collectionLogs: [],
  dialogues: [],
  quests: [],
  locales: { en: baseLocale },
  modules,
  modulePacks: [{ id: 'starter', modules: moduleIds }],
});

describe('tutorial island content (as shipped in universe.json)', () => {
  it('resolves every registered module with no errors and replaces the old starter world', () => {
    const result = applyModulesToBundle(emptyBundle(), modules, moduleIds);
    const errors = result.issues.filter((issue) => issue.severity === 'error');

    expect(errors).toEqual([]);
    expect(result.enabledModuleIds).toEqual(moduleIds);
    expect(result.bundle.locations.find((location) => location.starting)?.id).toBe('tutorial-guide-house');
    expect(result.bundle.locations.map((location) => location.id)).not.toContain('crossroads');
  });

  it('never shows more than 5 entities at a location', () => {
    const result = applyModulesToBundle(emptyBundle(), modules, moduleIds);
    for (const location of result.bundle.locations) {
      expect((location.entities ?? []).length, `location ${location.id}`).toBeLessThanOrEqual(5);
    }
  });

  it('includes an NPC, entity, and interactive object from every story beat', () => {
    const result = applyModulesToBundle(emptyBundle(), modules, moduleIds);
    const entityIds = new Set((result.bundle.entities ?? []).map((entity) => entity.id));

    for (const id of ['miki', 'front-door', 'brianna', 'shoals', 'gommi', 'bank-teller', 'denzel', 'locked-chest', 'orloth', 'portal']) {
      expect(entityIds.has(id), `expected entity "${id}"`).toBe(true);
    }
  });

  it('defines the "leave tutorial island" quest with a real derivable status', () => {
    const result = applyModulesToBundle(emptyBundle(), modules, moduleIds);
    const quest = result.bundle.quests?.find((candidate) => candidate.id === 'leave-tutorial-island');
    expect(quest).toBeDefined();
    expect(quest?.stages.length).toBeGreaterThanOrEqual(2);
  });

  it('seeds the tutorial bank with starting gold and caps inventory at 28 slots', () => {
    const result = applyModulesToBundle(emptyBundle(), modules, moduleIds);
    expect(result.bundle.manifest.basePlayer?.bank?.gold).toBe(25);
    expect(result.bundle.manifest.maxInventorySlots).toBe(28);
  });
});
