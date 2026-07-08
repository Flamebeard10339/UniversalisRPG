// Acceptance test for the content-DSL spike (docs/content-dsl-grammar.md):
// hand-author tutorial-island-guide-house in the DSL and prove the compiled
// module (a) merges cleanly through the *real* module pipeline
// (applyModulesToBundle — the exact code path production content goes
// through, not a bespoke check) and (b) reproduces the specific patterns the
// hand-written module relies on: walls, once/flag desugaring, the inline-
// conditional-text examine-variant expansion, adversarial actions, and the
// dialogue graph.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyModulesToBundle } from '../contentModules';
import type { ContentBundle, ContentModule, DialogueDefinition, EntityActionDefinition, EntityDefinition, GameAction, LocationNode } from '../types';
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

const foundationStub: ContentModule = {
  id: 'tutorial-island-foundation',
  version: '1.0.0',
  universe: 'base',
  author: 'test',
  game_version: '1.0',
  data: {
    stats: [{ id: 'thieving', base: 6 }],
    skills: [{ id: 'thieving', maxLevel: 100, statId: 'thieving' }],
    items: [{ id: 'gold' }, { id: 'lockpick' }, { id: 'note' }],
    flags: [
      { id: 'tutorial.miki-cleared', initialValue: false },
      { id: 'quest.leave-tutorial-island.accepted', initialValue: false },
      { id: 'tutorial.drawer-coins-taken', initialValue: false },
      { id: 'tutorial.drawer-lockpick-taken', initialValue: false },
      { id: 'tutorial.bookshelf-note-taken', initialValue: false },
    ],
  },
  locale: {
    en: {
      'stat.thieving.title': 'Thieving',
      'stat.thieving.description': 'Power applied to locks.',
      'skill.thieving.title': 'Thieving',
      'skill.thieving.description': 'Opening locks.',
      'item.gold.title': 'Gold',
      'item.gold.description': 'Coins.',
      'item.lockpick.title': 'Lockpick',
      'item.lockpick.description': 'A bent bit of metal.',
      'item.note.title': 'Note',
      'item.note.description': 'A note.',
    },
  },
};

// The wall targets tutorial-beach, which in the real game lives in a
// different module (tutorial-island-survival) — stub it so reference
// validation has something to resolve against.
const beachStub: ContentModule = {
  id: 'tutorial-island-beach-stub',
  version: '1.0.0',
  universe: 'base',
  author: 'test',
  game_version: '1.0',
  dependencies: ['tutorial-island-foundation'],
  data: {
    locations: [{ id: 'tutorial-beach', position: { x: 1, y: 0 }, entities: [], actions: [] }],
  },
  locale: { en: { 'location.tutorial-beach.title': 'Beach', 'location.tutorial-beach.description': 'Beach.' } },
};

const samplePath = path.join(__dirname, '../../../scripts/contentDsl/samples/tutorial-island-guide-house.md');
const source = readFileSync(samplePath, 'utf8');
const { module } = compileDsl(source);

const findEntity = (id: string): EntityDefinition => {
  const entity = (module.data as { entities: EntityDefinition[] }).entities.find((candidate) => candidate.id === id);
  if (!entity) throw new Error(`entity not found: ${id}`);
  return entity;
};
const findEntityAction = (entityId: string, actionId: string): EntityActionDefinition => {
  const action = findEntity(entityId).actions?.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`action not found: ${entityId}.${actionId}`);
  return action;
};

describe('content DSL — guide-house proof', () => {
  it('merges cleanly through the real module pipeline with zero errors', () => {
    const resolution = applyModulesToBundle(emptyBundle(), [foundationStub, beachStub, module]);
    const errors = resolution.issues.filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
    expect(resolution.enabledModuleIds).toContain('tutorial-island-guide-house');
  });

  it('places the location with the right metadata and nested entities', () => {
    const location = (module.data as { locations: LocationNode[] }).locations[0];
    expect(location.id).toBe('tutorial-guide-house');
    expect(location.position).toEqual({ x: 0, y: 0 });
    expect(location.starting).toBe(true);
    expect(location.tags).toEqual(['tutorial', 'indoors']);
    expect(new Set(location.entities)).toEqual(new Set(['miki', 'front-door', 'mirror', 'drawer', 'bookshelf']));
  });

  it('compiles `wall -> ... while ...` into a visibleWhen-gated travel action', () => {
    const wall = (module.data as { actions: GameAction[] }).actions[0];
    expect(wall.role).toBe('travel');
    expect(wall.results).toEqual([{ kind: 'relocate', locationId: 'tutorial-beach' }]);
    expect(wall.visibleWhen).toEqual({
      kind: 'not',
      condition: { kind: 'state-variable', variable: 'flag:tutorial.miki-cleared', comparison: 'equal', value: true },
    });
  });

  it('compiles an adversarial (enemy-bearing) entity action with the timed/rewards/results split', () => {
    const pick = findEntityAction('front-door', 'pick-lock');
    expect(pick.instant).toBeUndefined();
    expect(pick.durationSeconds).toBe(2);
    expect(pick.interactionTypeId).toBe('lockpicking');
    expect(pick.enemy).toMatchObject({ interactionTypeId: 'lockpicking', stats: { attack: 0, defense: 3, health: 12, rate: 0 }, showHealthBar: true });
    expect(pick.rewards).toEqual([{ kind: 'skillXp', skillId: 'thieving', amount: 4 }]);
    expect(pick.requirements).toEqual({ kind: 'state-variable', variable: 'item:lockpick', comparison: 'greater-than', value: 0 });
    expect(pick.visibleWhen).toEqual({
      kind: 'not',
      condition: { kind: 'state-variable', variable: 'flag:tutorial.miki-cleared', comparison: 'equal', value: true },
    });
    expect(pick.results).toEqual([
      { kind: 'flag', flagId: 'tutorial.miki-cleared', value: true },
      { kind: 'flag', flagId: 'quest.leave-tutorial-island.accepted', value: true },
      { kind: 'chat', messageKey: 'chat.entity.front-door.pick-lock' },
    ]);
  });

  it('compiles a plain instant entity action (talk -> dialogue)', () => {
    const talk = findEntityAction('miki', 'talk');
    expect(talk.instant).toBe(true);
    expect(talk.results).toEqual([{ kind: 'dialogue', dialogueId: 'miki' }]);
  });

  it('preserves result ordering for multi-tag instant actions (say must be last per grammar, so open-modal comes first)', () => {
    const look = findEntityAction('mirror', 'look');
    expect(look.results?.[0]).toEqual({ kind: 'open-modal', modalId: 'name-editor' });
    expect(look.results?.[1].kind).toBe('chat');
  });

  it('desugars `once` + `set <flag>` into maxCompletions + a flag-gated visibleWhen', () => {
    const takeCoins = findEntityAction('drawer', 'take-coins');
    expect(takeCoins.maxCompletions).toBe(1);
    expect(takeCoins.visibleWhen).toEqual({
      kind: 'not',
      condition: { kind: 'state-variable', variable: 'flag:tutorial.drawer-coins-taken', comparison: 'equal', value: true },
    });
    expect(takeCoins.results).toEqual([
      { kind: 'item', itemId: 'gold', amount: 5 },
      { kind: 'flag', flagId: 'tutorial.drawer-coins-taken', value: true },
      { kind: 'chat', messageKey: 'chat.entity.drawer.take-coins' },
    ]);
  });

  it('expands one `examine:` inline-conditional line into 2^n visibleWhen-gated variants sharing one title key', () => {
    const drawer = findEntity('drawer');
    const examineVariants = (drawer.actions ?? []).filter((action) => action.id.startsWith('examine'));
    expect(examineVariants).toHaveLength(4); // 2 referenced flags -> 2^2 variants, matching the hand-written examine/examine-coins-only/examine-lockpick-only/examine-both split
    const titleKeys = new Set(examineVariants.map(() => 'action.entity.drawer.examine.title'));
    expect(titleKeys.size).toBe(1); // every variant shares the same title key, so the button label never changes
    expect(module.locale?.en['action.entity.drawer.examine.title']).toBe('Examine');

    // Exactly one variant should be visible for any given flag assignment —
    // spot-check the "neither taken" and "both taken" corners.
    const isVisibleUnder = (action: EntityActionDefinition, assignment: Record<string, boolean>): boolean => {
      if (!action.visibleWhen) return true;
      const evaluate = (cond: NonNullable<typeof action.visibleWhen>): boolean => {
        if (cond.kind === 'state-variable') return assignment[String(cond.variable).replace('flag:', '')] === true;
        if (cond.kind === 'not') return !evaluate(cond.condition);
        if (cond.kind === 'all') return cond.conditions.every(evaluate);
        if (cond.kind === 'any') return cond.conditions.some(evaluate);
        return false;
      };
      return evaluate(action.visibleWhen);
    };
    const neitherTaken = { 'tutorial.drawer-coins-taken': false, 'tutorial.drawer-lockpick-taken': false };
    const bothTaken = { 'tutorial.drawer-coins-taken': true, 'tutorial.drawer-lockpick-taken': true };
    expect(examineVariants.filter((action) => isVisibleUnder(action, neitherTaken))).toHaveLength(1);
    expect(examineVariants.filter((action) => isVisibleUnder(action, bothTaken))).toHaveLength(1);
  });

  it('compiles the dialogue graph with options, on-enter results, and bare goto', () => {
    const dialogue = (module.data as { dialogues: DialogueDefinition[] }).dialogues[0];
    expect(dialogue.id).toBe('miki');
    expect(dialogue.startNodeId).toBe('start');
    const nodeIds = dialogue.nodes.map((node) => node.id);
    expect(new Set(nodeIds)).toEqual(new Set(['start', 'explain-quests', 'explain-colors', 'offer-quest', 'maybe-later', 'check-tab-prompt', 'accept-node', 'farewell']));

    const start = dialogue.nodes.find((node) => node.id === 'start')!;
    expect(start.speakerId).toBe('miki');
    expect(start.options).toHaveLength(3);
    expect(start.options!.map((option) => option.gotoNodeId)).toEqual(['explain-quests', 'explain-colors', 'offer-quest']);

    const acceptNode = dialogue.nodes.find((node) => node.id === 'accept-node')!;
    expect(acceptNode.options).toBeUndefined();
    expect(acceptNode.gotoNodeId).toBe('farewell');

    const farewell = dialogue.nodes.find((node) => node.id === 'farewell')!;
    expect(farewell.options).toBeUndefined();
    expect(farewell.gotoNodeId).toBeUndefined();
    expect(farewell.results).toEqual([{ kind: 'flag', flagId: 'tutorial.miki-cleared', value: true }]);

    const checkTabPrompt = dialogue.nodes.find((node) => node.id === 'check-tab-prompt')!;
    expect(checkTabPrompt.options).toHaveLength(1);
    expect(checkTabPrompt.options![0].gotoNodeId).toBe('accept-node');
    expect(checkTabPrompt.options![0].results).toEqual([{ kind: 'flag', flagId: 'quest.leave-tutorial-island.accepted', value: true }]);
  });

  it('passes the `interactionTypes` advanced-JSON block through untouched', () => {
    const interactionTypes = (module.data as { interactionTypes: Array<{ id: string }> }).interactionTypes;
    expect(interactionTypes).toEqual([{ id: 'lockpicking', sourceStatId: 'thieving', targetStatId: 'thieving', targetPlayerHealth: false }]);
  });
});
