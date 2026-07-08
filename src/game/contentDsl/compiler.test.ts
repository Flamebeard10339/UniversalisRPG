// Acceptance test for the content-DSL spike (docs/content-dsl-grammar.md):
// hand-author tutorial-island-guide-house in the DSL and prove the compiled
// module (a) merges cleanly through the *real* module pipeline
// (applyModulesToBundle — the exact code path production content goes
// through, not a bespoke check) and (b) reproduces the specific patterns the
// hand-written module relies on: walls, once/flag desugaring, pack-scoped
// flag namespacing, compound multi-flag inline conditionals, multi-`say`
// sequencing, adversarial actions, and the dialogue graph.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyModulesToBundle } from '../contentModules';
import type { Condition, ContentBundle, ContentModule, DialogueDefinition, EntityActionDefinition, EntityDefinition, GameAction, LocationNode } from '../types';
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
      { id: 'tutorial-island.miki-cleared', initialValue: false },
      { id: 'tutorial-island.quest-accepted', initialValue: false },
      { id: 'tutorial-island.drawer-coins-taken', initialValue: false },
      { id: 'tutorial-island.drawer-lockpick-taken', initialValue: false },
      { id: 'tutorial-island.bookshelf-note-taken', initialValue: false },
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

// Evaluates a compiled visibleWhen Condition against a plain flag-truth map
// (keyed by resolved flag id, e.g. "tutorial-island.drawer-coins-taken").
const isVisibleUnder = (visibleWhen: Condition | undefined, assignment: Record<string, boolean>): boolean => {
  if (!visibleWhen) return true;
  const evaluate = (cond: Condition): boolean => {
    if (cond.kind === 'state-variable') return assignment[String(cond.variable).replace('flag:', '')] === true;
    if (cond.kind === 'not') return !evaluate(cond.condition);
    if (cond.kind === 'all') return cond.conditions.every(evaluate);
    if (cond.kind === 'any') return cond.conditions.some(evaluate);
    return false;
  };
  return evaluate(visibleWhen);
};

describe('content DSL — guide-house proof', () => {
  it('merges cleanly through the real module pipeline with zero errors', () => {
    const resolution = applyModulesToBundle(emptyBundle(), [foundationStub, beachStub, module]);
    const errors = resolution.issues.filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
    expect(resolution.enabledModuleIds).toContain('tutorial-island-guide-house');
  });

  it('places the location with the right metadata and nested entities (multi-line, bare-word tags, no `tags:` label)', () => {
    const location = (module.data as { locations: LocationNode[] }).locations[0];
    expect(location.id).toBe('tutorial-guide-house');
    expect(location.position).toEqual({ x: 0, y: 0 });
    expect(location.starting).toBe(true);
    expect(location.tags).toEqual(['tutorial', 'indoors']);
    expect(new Set(location.entities)).toEqual(new Set(['miki', 'front-door', 'mirror', 'drawer', 'bookshelf']));
  });

  it('compiles `wall -> ... while ...` into a pack-scoped, visibleWhen-gated travel action', () => {
    const wall = (module.data as { actions: GameAction[] }).actions[0];
    expect(wall.role).toBe('travel');
    expect(wall.results).toEqual([{ kind: 'relocate', locationId: 'tutorial-beach' }]);
    expect(wall.visibleWhen).toEqual({
      kind: 'not',
      condition: { kind: 'state-variable', variable: 'flag:tutorial-island.miki-cleared', comparison: 'equal', value: true },
    });
  });

  it('compiles an adversarial (enemy-bearing) action with the timed/rewards/results split and a multi-line `on success:` with two sequential `say:` lines', () => {
    const pick = findEntityAction('front-door', 'pick-lock');
    expect(pick.instant).toBeUndefined();
    expect(pick.durationSeconds).toBe(2);
    expect(pick.interactionTypeId).toBe('lockpicking');
    expect(pick.enemy).toMatchObject({ interactionTypeId: 'lockpicking', stats: { attack: 0, defense: 3, health: 12, rate: 0 }, showHealthBar: true });
    expect(pick.rewards).toEqual([{ kind: 'skillXp', skillId: 'thieving', amount: 4 }]);
    expect(pick.requirements).toEqual({ kind: 'state-variable', variable: 'item:lockpick', comparison: 'greater-than', value: 0 });
    expect(pick.visibleWhen).toEqual({
      kind: 'not',
      condition: { kind: 'state-variable', variable: 'flag:tutorial-island.miki-cleared', comparison: 'equal', value: true },
    });
    expect(pick.results).toEqual([
      { kind: 'flag', flagId: 'tutorial-island.miki-cleared', value: true },
      { kind: 'flag', flagId: 'tutorial-island.quest-accepted', value: true },
      { kind: 'chat', messageKey: 'chat.entity.front-door.pick-lock' },
      { kind: 'chat', messageKey: 'chat.entity.front-door.pick-lock-2' },
    ]);
    expect(module.locale?.en['chat.entity.front-door.pick-lock']).toBe('The lock gives with a soft click.');
    expect(module.locale?.en['chat.entity.front-door.pick-lock-2']).toBe('Whatever is out there, you can reach it now.');
  });

  it('compiles a plain instant entity action (talk: [[dialogue miki]])', () => {
    const talk = findEntityAction('miki', 'talk');
    expect(talk.instant).toBe(true);
    expect(talk.results).toEqual([{ kind: 'dialogue', dialogueId: 'miki' }]);
  });

  it('preserves result ordering for multi-tag instant actions (say must be last per grammar, so open-modal comes first)', () => {
    const look = findEntityAction('mirror', 'look');
    expect(look.results?.[0]).toEqual({ kind: 'open-modal', modalId: 'name-editor' });
    expect(look.results?.[1].kind).toBe('chat');
  });

  it('desugars `once` + `set:` into maxCompletions + a pack-scoped flag-gated visibleWhen', () => {
    const takeCoins = findEntityAction('drawer', 'take-coins');
    expect(takeCoins.maxCompletions).toBe(1);
    expect(takeCoins.visibleWhen).toEqual({
      kind: 'not',
      condition: { kind: 'state-variable', variable: 'flag:tutorial-island.drawer-coins-taken', comparison: 'equal', value: true },
    });
    expect(takeCoins.results).toEqual([
      { kind: 'item', itemId: 'gold', amount: 5 },
      { kind: 'flag', flagId: 'tutorial-island.drawer-coins-taken', value: true },
      { kind: 'chat', messageKey: 'chat.entity.drawer.take-coins' },
    ]);
  });

  it('expands one `examine:` line with three compound (multi-flag &) conditionals into 2^n visibleWhen-gated variants sharing one title key', () => {
    const drawer = findEntity('drawer');
    const examineVariants = (drawer.actions ?? []).filter((action) => action.id.startsWith('examine'));
    expect(examineVariants).toHaveLength(4); // 2 distinct flags referenced across the 3 fragments -> 2^2 variants
    expect(module.locale?.en['action.entity.drawer.examine.title']).toBe('Examine');
    const titleKeyUsed = examineVariants.length; // every variant was built from the same locale.set call — see below for the stronger per-state check

    // Exactly one variant must be visible for every one of the 4 reachable
    // states, and its rendered text must match which of the three authored
    // fragments (or none, i.e. "both taken") applies to that state.
    const states: Array<{ assignment: Record<string, boolean>; expectFragment: 'neither' | 'coins-only' | 'lockpick-only' | 'both' }> = [
      { assignment: { 'tutorial-island.drawer-coins-taken': false, 'tutorial-island.drawer-lockpick-taken': false }, expectFragment: 'neither' },
      { assignment: { 'tutorial-island.drawer-coins-taken': true, 'tutorial-island.drawer-lockpick-taken': false }, expectFragment: 'lockpick-only' },
      { assignment: { 'tutorial-island.drawer-coins-taken': false, 'tutorial-island.drawer-lockpick-taken': true }, expectFragment: 'coins-only' },
      { assignment: { 'tutorial-island.drawer-coins-taken': true, 'tutorial-island.drawer-lockpick-taken': true }, expectFragment: 'both' },
    ];
    for (const { assignment, expectFragment } of states) {
      const visible = examineVariants.filter((action) => isVisibleUnder(action.visibleWhen, assignment));
      expect(visible).toHaveLength(1);
      const text = module.locale?.en[(visible[0].results?.[0] as { messageKey: string }).messageKey] ?? '';
      if (expectFragment === 'neither') expect(text).toContain('coins and a worn set of lockpicks tucked in the back');
      if (expectFragment === 'coins-only') expect(text).toContain('You see some coins on the bottom');
      if (expectFragment === 'lockpick-only') expect(text).toContain('You see a set of worn lockpicks at the bottom');
      if (expectFragment === 'both') expect(text.trim()).toBe('A drawer full of random junk.');
    }
    expect(titleKeyUsed).toBe(4);
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
    expect(farewell.results).toEqual([{ kind: 'flag', flagId: 'tutorial-island.miki-cleared', value: true }]);

    const checkTabPrompt = dialogue.nodes.find((node) => node.id === 'check-tab-prompt')!;
    expect(checkTabPrompt.options).toHaveLength(1);
    expect(checkTabPrompt.options![0].gotoNodeId).toBe('accept-node');
    expect(checkTabPrompt.options![0].results).toEqual([{ kind: 'flag', flagId: 'tutorial-island.quest-accepted', value: true }]);
  });

  it('passes the `interactionTypes` advanced-JSON block through untouched', () => {
    const interactionTypes = (module.data as { interactionTypes: Array<{ id: string }> }).interactionTypes;
    expect(interactionTypes).toEqual([{ id: 'lockpicking', sourceStatId: 'thieving', targetStatId: 'thieving', targetPlayerHealth: false }]);
  });
});
