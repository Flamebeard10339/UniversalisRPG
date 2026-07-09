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
    // Guide-house's own local flags (bookshelf/drawer) are declared by the
    // real module itself now (via its `# advanced` block) — not stubbed
    // here, or they'd collide as duplicate ids.
    flags: [
      { id: 'tutorial.miki-cleared', initialValue: false },
      { id: 'quest.leave-tutorial-island.accepted', initialValue: false },
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

// The adjacent: edge targets tutorial-beach, which in the real game lives in
// a different module (tutorial-island-survival) — stub it so reference
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

const samplePath = path.join(__dirname, '../../../public/content/universes/base/modules/tutorial-island-guide-house.md');
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

// Evaluates conditional text fragments against a plain flag-truth map
const renderConditionalTextTest = (fragments: Array<{ kind: string; text?: string; condition?: Condition }> | undefined, assignment: Record<string, boolean>): string => {
  if (!fragments) return '';
  const evaluate = (cond: Condition): boolean => {
    if (cond.kind === 'state-variable') return assignment[String(cond.variable).replace('flag:', '')] === true;
    if (cond.kind === 'not') return !evaluate(cond.condition);
    if (cond.kind === 'all') return cond.conditions.every(evaluate);
    if (cond.kind === 'any') return cond.conditions.some(evaluate);
    return false;
  };
  return fragments
    .filter((fragment) => fragment.kind === 'literal' || (fragment.condition && evaluate(fragment.condition)))
    .map((fragment) => fragment.text ?? '')
    .join('')
    .trim();
};

describe('content DSL — guide-house proof', () => {
  it('merges cleanly through the real module pipeline with zero errors', () => {
    const resolution = applyModulesToBundle(emptyBundle(), [foundationStub, beachStub, module]);
    const errors = resolution.issues.filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
    expect(resolution.enabledModuleIds).toContain('tutorial-island-guide-house');
  });

  it('places the location with the right metadata and nested entities (multi-line, labeled tags:)', () => {
    const location = (module.data as { locations: LocationNode[] }).locations[0];
    expect(location.id).toBe('tutorial-guide-house');
    expect(location.position).toEqual({ x: 0, y: 0 });
    expect(location.starting).toBe(true);
    expect(location.tags).toEqual(['tutorial', 'indoors']);
    expect(new Set(location.entities)).toEqual(new Set(['miki', 'front-door', 'mirror', 'drawer', 'bookshelf']));
  });

  it('compiles `adjacent: ... while ...` into a pack-scoped, visibleWhen-gated travel action', () => {
    const wall = (module.data as { actions: GameAction[] }).actions[0];
    expect(wall.role).toBe('travel');
    expect(wall.results).toEqual([{ kind: 'relocate', locationId: 'tutorial-beach' }]);
    expect(wall.visibleWhen).toEqual({
      kind: 'all',
      conditions: [
        { kind: 'state-variable', variable: 'discovered-location:tutorial-beach', comparison: 'greater-than', value: 0 },
        { kind: 'not', condition: { kind: 'state-variable', variable: 'flag:tutorial.miki-cleared', comparison: 'equal', value: true } },
      ],
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
      condition: { kind: 'state-variable', variable: 'flag:tutorial.miki-cleared', comparison: 'equal', value: true },
    });
    expect(pick.results).toEqual([
      { kind: 'flag', flagId: 'tutorial.miki-cleared', value: true },
      { kind: 'flag', flagId: 'quest.leave-tutorial-island.accepted', value: true },
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

  it('evaluates inline conditionals in say: tags at runtime via conditional-chat ActionResult', () => {
    const drawer = findEntity('drawer');
    const examineAction = (drawer.actions ?? []).find((action) => action.id === 'examine');
    expect(examineAction).toBeDefined();

    // With inline conditionals now evaluated at runtime, there should be only 1 action
    // instead of 2^n variants, and it should contain a conditional-chat result.
    const conditionalChatResult = examineAction?.results?.find((r) => r.kind === 'conditional-chat');
    expect(conditionalChatResult).toBeDefined();
    expect(conditionalChatResult?.kind).toBe('conditional-chat');

    // Verify the conditional-chat result renders correctly for each state
    const states: Array<{ assignment: Record<string, boolean>; expectFragment: 'neither' | 'coins-only' | 'lockpick-only' | 'both' }> = [
      { assignment: { 'tutorial-island.drawer-coins-taken': false, 'tutorial-island.drawer-lockpick-taken': false }, expectFragment: 'neither' },
      { assignment: { 'tutorial-island.drawer-coins-taken': true, 'tutorial-island.drawer-lockpick-taken': false }, expectFragment: 'lockpick-only' },
      { assignment: { 'tutorial-island.drawer-coins-taken': false, 'tutorial-island.drawer-lockpick-taken': true }, expectFragment: 'coins-only' },
      { assignment: { 'tutorial-island.drawer-coins-taken': true, 'tutorial-island.drawer-lockpick-taken': true }, expectFragment: 'both' },
    ];
    for (const { assignment, expectFragment } of states) {
      const fragments = (conditionalChatResult as any)?.fragments;
      const text = renderConditionalTextTest(fragments, assignment);
      if (expectFragment === 'neither') expect(text).toContain('coins and a worn set of lockpicks tucked in the back');
      if (expectFragment === 'coins-only') expect(text).toContain('You see some coins on the bottom');
      if (expectFragment === 'lockpick-only') expect(text).toContain('You see a set of worn lockpicks at the bottom');
      if (expectFragment === 'both') expect(text.trim()).toBe('A drawer full of random junk.');
    }
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

  it('compiles the `# interaction lockpicking` section into an InteractionTypeDefinition', () => {
    const interactionTypes = (module.data as { interactionTypes: Array<{ id: string }> }).interactionTypes;
    expect(interactionTypes).toEqual([{ id: 'lockpicking', sourceStatId: 'thieving', targetStatId: 'thieving', targetPlayerHealth: false }]);
  });

  it('backfills a generic default for interaction message fields the author left unwritten (player hit/miss, all entity.*)', () => {
    expect(module.locale?.en['interaction.lockpicking.player.hit']).toBeTruthy();
    expect(module.locale?.en['interaction.lockpicking.player.miss']).toBeTruthy();
    expect(module.locale?.en['interaction.lockpicking.entity.hit']).toBeTruthy();
    expect(module.locale?.en['interaction.lockpicking.entity.miss']).toBeTruthy();
    expect(module.locale?.en['interaction.lockpicking.entity.kill']).toBeTruthy();
    // The one outcome that's actually meaningful (the lock opening) keeps
    // its hand-authored text, not the generic default.
    expect(module.locale?.en['interaction.lockpicking.player.kill']).toBe('The lock gives with a soft click.');
  });
});

describe('content DSL — location/entity title, examine, exhausted text', () => {
  const source = `# info
id: title-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: title-proof

# location fancy-place
x: 0, y: 0
title: The Fancy Place
examine: A place with real flavor text.
exhausted: The fancy place settles down.
starting

## entity plain-thing
examine: Nothing special.

## entity named-thing
title: A Very Named Thing
examine: Something special.
`;
  const { module } = compileDsl(source);

  it('uses explicit location title/examine/exhausted text when given', () => {
    expect(module.locale?.en['location.fancy-place.title']).toBe('The Fancy Place');
    expect(module.locale?.en['location.fancy-place.examine']).toBe('A place with real flavor text.');
    expect(module.locale?.en['location.fancy-place.exhausted']).toBe('The fancy place settles down.');
  });

  it('falls back to a humanized title, generic examine text, and generic exhausted text otherwise', () => {
    const source2 = `# info
id: title-proof-2
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: title-proof-2

# location plain-place
x: 0, y: 0
starting
`;
    const { module: module2 } = compileDsl(source2);
    expect(module2.locale?.en['location.plain-place.title']).toBe('Plain place');
    expect(module2.locale?.en['location.plain-place.examine']).toBe('Plain place.');
    expect(module2.locale?.en['location.plain-place.exhausted']).toBe('It is quiet now.');
  });

  it('uses an explicit entity title when given, and a humanized fallback otherwise', () => {
    expect(module.locale?.en['entity.plain-thing.title']).toBe('Plain thing');
    expect(module.locale?.en['entity.named-thing.title']).toBe('A Very Named Thing');
  });
});

describe('content DSL — location tags:', () => {
  it('parses a labeled tags: field into location.tags', () => {
    const source = `# info
id: tags-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: tags-proof

# location tagged-place
x: 0, y: 0
tags: tutorial indoors
starting
`;
    const { module } = compileDsl(source);
    const location = (module.data as { locations: { tags?: string[] }[] }).locations[0];
    expect(location.tags).toEqual(['tutorial', 'indoors']);
  });

  it('rejects an unrecognized bare word instead of silently treating it as a tag', () => {
    const source = `# info
id: bad-tags-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: bad-tags-proof

# location bad-place
x: 0, y: 0
tutorial indoors
starting
`;
    expect(() => compileDsl(source)).toThrow(/tags:/);
  });
});

describe('content DSL — adjacent: location grammar', () => {
  it('compiles a bare (unconditional) entry and a gated entry, both as travel actions', () => {
    const source = `# info
id: adjacent-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: adjacent-proof

# location start-room
x: 0, y: 0
starting
adjacent:
  open-room
  locked-room while start-room-key-taken

# location open-room
x: 1, y: 0

# location locked-room
x: 0, y: 1
`;
    const { module } = compileDsl(source);
    const actions = (module.data as { actions: GameAction[] }).actions;
    const toOpenRoom = actions.find((action) => action.results?.[0].kind === 'relocate' && (action.results[0] as { locationId: string }).locationId === 'open-room')!;
    const toLockedRoom = actions.find((action) => action.results?.[0].kind === 'relocate' && (action.results[0] as { locationId: string }).locationId === 'locked-room')!;
    expect(toOpenRoom.role).toBe('travel');
    expect(toOpenRoom.visibleWhen).toEqual({
      kind: 'state-variable',
      variable: 'discovered-location:open-room',
      comparison: 'greater-than',
      value: 0,
    });
    expect(toLockedRoom.visibleWhen).toEqual({
      kind: 'all',
      conditions: [
        { kind: 'state-variable', variable: 'discovered-location:locked-room', comparison: 'greater-than', value: 0 },
        { kind: 'state-variable', variable: 'flag:adjacent-proof.start-room-key-taken', comparison: 'equal', value: true },
      ],
    });
  });
});

describe('content DSL — # advanced data-updates escape hatch', () => {
  it('attaches # advanced\'s "data-updates" key to the module\'s own data-updates field, not data', () => {
    const source = `# info
id: data-updates-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: data-updates-proof
dependencies: +some-other-module

# advanced
{
  "data-updates": {
    "remove": { "locations": ["old-place"] }
  }
}
`;
    const { module } = compileDsl(source);
    expect(module['data-updates']).toEqual({ remove: { locations: ['old-place'] } });
    expect(module.data).not.toHaveProperty('data-updates');
  });
});

describe('content DSL — item-tag / equipped-item-tag requires:', () => {
  it('parses "requires: tag:X" as an item-tag condition and "requires: equipped tag:X" as equipped-item-tag', () => {
    const source = `# info
id: item-tag-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: item-tag-proof

# location somewhere
x: 0, y: 0
starting

## entity rock
mine:
  requires: tag:pickaxe
  xp: mining 5

## entity anvil
smith:
  requires: equipped tag:mainhand
  xp: smithing 5
`;
    const { module } = compileDsl(source);
    const entities = (module.data as { entities: EntityDefinition[] }).entities;
    const mine = entities.find((entity) => entity.id === 'rock')!.actions!.find((action) => action.id === 'mine')!;
    expect(mine.requirements).toEqual({ kind: 'item-tag', tag: 'pickaxe' });
    const smith = entities.find((entity) => entity.id === 'anvil')!.actions!.find((action) => action.id === 'smith')!;
    expect(smith.requirements).toEqual({ kind: 'equipped-item-tag', tag: 'mainhand' });
  });
});

describe('content DSL — relocate: tag', () => {
  it('produces an unconditional relocate result on an entity action', () => {
    const source = `# info
id: relocate-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: relocate-proof

# location start-room
x: 0, y: 0
starting

## entity tunnel
enter: relocate: end-room
`;
    const { module } = compileDsl(source);
    const entities = (module.data as { entities: EntityDefinition[] }).entities;
    const enter = entities.find((entity) => entity.id === 'tunnel')!.actions!.find((action) => action.id === 'enter')!;
    expect(enter.results).toEqual([{ kind: 'relocate', locationId: 'end-room' }]);
  });
});

describe('content DSL — set spawn: tag', () => {
  it('produces a set-spawn result, independent of relocate:', () => {
    const source = `# info
id: set-spawn-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: set-spawn-proof

# location start-room
x: 0, y: 0
starting

## entity portal
step through:
  set spawn: mainland
  relocate: mainland
`;
    const { module } = compileDsl(source);
    const entities = (module.data as { entities: EntityDefinition[] }).entities;
    const step = entities.find((entity) => entity.id === 'portal')!.actions!.find((action) => action.id === 'step-through')!;
    expect(step.results).toEqual([{ kind: 'set-spawn', locationId: 'mainland' }, { kind: 'relocate', locationId: 'mainland' }]);
  });
});

describe('content DSL — max: N tag', () => {
  it('sets maxCompletions without an auto visibleWhen guard', () => {
    const source = `# info
id: max-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: max-proof

# location start-room
x: 0, y: 0
starting

## entity dummy
fight:
  max: 3
`;
    const { module } = compileDsl(source);
    const entities = (module.data as { entities: EntityDefinition[] }).entities;
    const fight = entities.find((entity) => entity.id === 'dummy')!.actions!.find((action) => action.id === 'fight')!;
    expect(fight.maxCompletions).toBe(3);
    expect(fight.visibleWhen).toBeUndefined();
  });
});

describe('content DSL — # stat / # skill / # flags sections', () => {
  it('compiles stats/skills with defaults and locale, and flags with default/explicit initial values', () => {
    const source = `# info
id: stat-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: stat-proof

# stat attack
base: 6
title: Attack
examine: Power applied to outgoing attacks.

# stat movement-speed
base: 60

# skill attack
title: Attack
examine: Accuracy, timing, and pressure in direct conflict.

# skill regeneration
stat: attack
max level: 50

# flags
tutorial.miki-cleared
death-count: 0
some-flag: true
`;
    const { module, locale } = compileDsl(source);
    const data = module.data as {
      stats: { id: string; base: number }[];
      skills: { id: string; maxLevel: number; statId?: string }[];
      flags: { id: string; initialValue: boolean | number }[];
    };
    expect(data.stats).toEqual([{ id: 'attack', base: 6 }, { id: 'movement-speed', base: 60 }]);
    expect(data.skills).toEqual([
      { id: 'attack', maxLevel: 100, statId: 'attack' },
      { id: 'regeneration', maxLevel: 50, statId: 'attack' },
    ]);
    expect(data.flags).toEqual([
      { id: 'tutorial.miki-cleared', initialValue: false },
      { id: 'death-count', initialValue: 0 },
      { id: 'some-flag', initialValue: true },
    ]);
    expect(locale['stat.attack.title']).toBe('Attack');
    expect(locale['stat.attack.examine']).toBe('Power applied to outgoing attacks.');
    expect(locale['stat.movement-speed.title']).toBe('Movement speed');
    expect(locale['skill.regeneration.title']).toBe('Regeneration');
  });
});

describe('content DSL — droptable: tag and # droptable sections', () => {
  it('reproduces a nested independent/dependent dropTable reward exactly', () => {
    // Matches the shape base-core's original hand-written goblin fight
    // reward used: always drop bones, 1/3 chance of a dependent sub-table
    // choosing between tin-ore and a copper-ore range.
    const source = `# info
id: droptable-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: droptable-proof

# item bones
# item tin-ore
# item copper-ore

# location start-room
x: 0, y: 0
starting

## entity goblin
fight:
  enemy: melee-combat, health 10
  droptable:
    bones (1)
    dependent droptable (3):
      1 tin-ore (4)
      3-5 copper-ore (3)
`;
    const { module } = compileDsl(source);
    const entities = (module.data as { entities: EntityDefinition[] }).entities;
    const fight = entities.find((entity) => entity.id === 'goblin')!.actions!.find((action) => action.id === 'fight')!;
    const dropReward = fight.rewards!.find((reward) => reward.kind === 'dropTable')!;
    expect(dropReward).toEqual({
      kind: 'dropTable',
      mode: 'independent',
      drops: [
        { weight: 1, reward: { kind: 'item', itemId: 'bones', amount: 1 } },
        {
          weight: 3,
          drops: [
            { weight: 4, reward: { kind: 'item', itemId: 'tin-ore', amount: 1 } },
            { weight: 3, reward: { kind: 'item', itemId: 'copper-ore', amount: { min: 3, max: 5 } } },
          ],
        },
      ],
    });
  });

  it('resolves a bare id against a named # droptable section instead of treating it as an item', () => {
    const source = `# info
id: droptable-ref-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: droptable-ref-proof

# item bones
# item rare-sword

# droptable rare-weapon-table
rare-sword (128)

# location start-room
x: 0, y: 0
starting

## entity foobar
fight:
  enemy: melee-combat, health 10
  droptable:
    bones
    rare-weapon-table (2)
`;
    const { module } = compileDsl(source);
    const data = module.data as { entities: EntityDefinition[]; dropTables: { id: string; mode: string; drops: unknown[] }[] };
    const fight = data.entities.find((entity) => entity.id === 'foobar')!.actions!.find((action) => action.id === 'fight')!;
    const dropReward = fight.rewards!.find((reward) => reward.kind === 'dropTable')!;
    expect(dropReward).toEqual({
      kind: 'dropTable',
      mode: 'independent',
      drops: [
        { weight: 1, reward: { kind: 'item', itemId: 'bones', amount: 1 } },
        { weight: 2, dropTableId: 'rare-weapon-table' },
      ],
    });
    expect(data.dropTables).toEqual([
      { id: 'rare-weapon-table', mode: 'independent', drops: [{ weight: 128, reward: { kind: 'item', itemId: 'rare-sword', amount: 1 } }] },
    ]);
  });
});
