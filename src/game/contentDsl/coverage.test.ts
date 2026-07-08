// Proves the second round of DSL coverage — items, quests, recipes, chance/
// fail, and station actions — the same way compiler.test.ts proved the core
// grammar: hand-author a slice of real tutorial-island content and merge the
// compiled module through the *real* applyModulesToBundle pipeline.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyModulesToBundle } from '../contentModules';
import type { ContentBundle, ContentModule, DialogueDefinition, EntityDefinition, ItemActionDefinition, ItemDefinition, QuestDefinition, RecipeDefinition } from '../types';
import { compileDsl } from './compiler';

const emptyBundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: 'base', version: '1.0.0', author: 'test', locales: ['en'], files: [] },
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
  locales: { en: {} },
});

const readSample = (name: string) => readFileSync(path.join(__dirname, `../../../scripts/contentDsl/samples/${name}`), 'utf8');

// The full bundle needs exactly one `starting` location; neither proof
// module is a complete world by itself, so every test supplies this stub.
const startingLocationStub: ContentModule = {
  id: 'starting-location-stub',
  version: '1.0.0',
  universe: 'base',
  author: 'test',
  game_version: '1.0',
  data: { locations: [{ id: 'world-anchor', position: { x: 0, y: 0 }, starting: true, entities: [], actions: [] }] },
  locale: { en: { 'location.world-anchor.title': 'Anchor', 'location.world-anchor.description': 'x' } },
};

describe('content DSL — items + quest proof', () => {
  const { module } = compileDsl(readSample('tutorial-island-foundation-proof.md'));

  it('merges cleanly through the real module pipeline with zero errors', () => {
    const resolution = applyModulesToBundle(emptyBundle(), [startingLocationStub, module]);
    const errors = resolution.issues.filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('compiles a plain item with no actions or tags', () => {
    const gold = (module.data as { items: ItemDefinition[] }).items.find((item) => item.id === 'gold')!;
    expect(gold).toEqual({ id: 'gold' });
  });

  it('compiles an item action identically to an entity action (read: [[dialogue note]])', () => {
    const note = (module.data as { items: ItemDefinition[] }).items.find((item) => item.id === 'note')!;
    const readAction = note.actions?.find((action) => action.id === 'read') as ItemActionDefinition;
    expect(readAction.instant).toBe(true);
    expect(readAction.results).toEqual([{ kind: 'dialogue', dialogueId: 'note' }]);
    expect(module.locale?.en['action.item.note.read.title']).toBe('Read');
  });

  it('passes item tag strings through untouched (the existing equipment tag grammar, not this DSL\'s own tags)', () => {
    const items = (module.data as { items: ItemDefinition[] }).items;
    expect(items.find((item) => item.id === 'cooked-shrimp')?.tags).toBe('food, +3 regeneration, 60s');
    expect(items.find((item) => item.id === 'iron-dagger')?.tags).toBe('mainhand (1 attack), +3 attack');
  });

  it('compiles a quest with pack-scoped stage conditions and narrative descriptions', () => {
    const quest = (module.data as { quests: QuestDefinition[] }).quests[0];
    expect(quest.id).toBe('leave-tutorial-island');
    expect(module.locale?.en[quest.titleKey]).toBe('Leave Tutorial Island');
    expect(quest.stages.map((stage) => stage.id)).toEqual(['accept', 'leave-house', 'visit-bank', 'clear-mining', 'clear-combat', 'complete']);
    const leaveHouse = quest.stages.find((stage) => stage.id === 'leave-house')!;
    expect(leaveHouse.condition).toEqual({ kind: 'state-variable', variable: 'flag:tutorial-island.miki-cleared', comparison: 'equal', value: true });
    expect(module.locale?.en[leaveHouse.descriptionKey]).toContain('Miki the tutorial guide has tasked you');
  });

  it('compiles a narrator-only dialogue node', () => {
    const dialogue = (module.data as { dialogues: DialogueDefinition[] }).dialogues[0];
    expect(dialogue.id).toBe('note');
    const start = dialogue.nodes[0];
    expect(start.speakerId).toBeUndefined();
    expect(start.narratorKey).toBeDefined();
    expect(module.locale?.en[start.narratorKey!]).toContain('It reads');
  });
});

describe('content DSL — chance/fail + station + recipe proof', () => {
  const stub: ContentModule = {
    id: 'tutorial-island-mining-proof-stub',
    version: '1.0.0',
    universe: 'base',
    author: 'test',
    game_version: '1.0',
    data: {
      stats: [{ id: 'thieving', base: 6 }, { id: 'smithing', base: 6 }],
      skills: [{ id: 'thieving', maxLevel: 100, statId: 'thieving' }, { id: 'smithing', maxLevel: 100, statId: 'smithing' }],
      items: [{ id: 'lockpick' }, { id: 'iron-dagger' }],
      resourceDefinitions: [{ id: 'health', sourceStat: 'thieving' }],
    },
    locale: {
      en: {
        'stat.thieving.title': 'Thieving', 'stat.thieving.description': 'x',
        'stat.smithing.title': 'Smithing', 'stat.smithing.description': 'x',
        'skill.thieving.title': 'Thieving', 'skill.thieving.description': 'x',
        'skill.smithing.title': 'Smithing', 'skill.smithing.description': 'x',
        'item.lockpick.title': 'Lockpick', 'item.lockpick.description': 'x',
        'item.iron-dagger.title': 'Iron Dagger', 'item.iron-dagger.description': 'x',
        'resource.health.title': 'Health',
      },
    },
  };

  const { module } = compileDsl(readSample('tutorial-island-mining-proof.md'));

  const findEntity = (id: string): EntityDefinition =>
    (module.data as { entities: EntityDefinition[] }).entities.find((entity) => entity.id === id)!;

  it('merges cleanly through the real module pipeline with zero errors', () => {
    const resolution = applyModulesToBundle(emptyBundle(), [startingLocationStub, stub, module]);
    const errors = resolution.issues.filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('compiles a `chance:` + `on fail:` one-shot gamble action', () => {
    const pick = findEntity('locked-chest').actions!.find((action) => action.id === 'pick')!;
    expect(pick.instant).toBe(true);
    expect(pick.chance).toBe(50);
    expect(pick.requirements).toEqual({ kind: 'state-variable', variable: 'item:lockpick', comparison: 'greater-than', value: 0 });
    expect(pick.results).toEqual([
      { kind: 'skill-xp', skillId: 'thieving', amount: 25 },
      { kind: 'item', itemId: 'copper-ore', amount: 2 },
      { kind: 'item', itemId: 'tin-ore', amount: 2 },
      { kind: 'item', itemId: 'iron-dagger', amount: 1 },
      { kind: 'flag', flagId: 'tutorial-island.mining-cleared', value: true },
      { kind: 'chat', messageKey: 'chat.entity.locked-chest.pick' },
    ]);
    expect(pick.failureResults).toEqual([
      { kind: 'resource', resourceId: 'health', amount: -3 },
      { kind: 'chat', messageKey: 'chat.entity.locked-chest.pick-fail' },
    ]);
  });

  it('compiles `station:` into a bare stationId action with no other fields', () => {
    const smelt = findEntity('furnace').actions!.find((action) => action.id === 'smelt')!;
    expect(smelt).toEqual({ id: 'smelt', stationId: 'tutorial-furnace', rewards: [] });
    const smith = findEntity('anvil').actions!.find((action) => action.id === 'smith')!;
    expect(smith).toEqual({ id: 'smith', stationId: 'tutorial-anvil', rewards: [] });
  });

  it('compiles a recipe with multi-line `in:` ingredients', () => {
    const smeltBronze = (module.data as { recipes: RecipeDefinition[] }).recipes.find((recipe) => recipe.id === 'smelt-bronze')!;
    expect(smeltBronze.stationId).toBe('tutorial-furnace');
    expect(smeltBronze.inputs).toEqual([{ itemId: 'copper-ore', amount: 1 }, { itemId: 'tin-ore', amount: 1 }]);
    expect(smeltBronze.outputs).toEqual([{ itemId: 'bronze-bar', amount: 1 }]);
    expect(smeltBronze.skillId).toBe('smithing');
    expect(smeltBronze.xpAmount).toBe(8);
  });

  it('compiles a recipe with `on success:` extraResults', () => {
    const smithDagger = (module.data as { recipes: RecipeDefinition[] }).recipes.find((recipe) => recipe.id === 'smith-dagger')!;
    expect(smithDagger.extraResults).toEqual([{ kind: 'flag', flagId: 'tutorial-island.mining-cleared', value: true }]);
  });
});
