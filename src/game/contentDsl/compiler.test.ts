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

// The adjacent: edge (and the upstairs window's discover: tags) target
// tutorial-beach/tutorial-bridge, which in the real game live in a different
// module (tutorial-island-survival) — stub them so reference validation has
// something to resolve against.
const beachStub: ContentModule = {
  id: 'tutorial-island-beach-stub',
  version: '1.0.0',
  universe: 'base',
  author: 'test',
  game_version: '1.0',
  dependencies: ['tutorial-island-foundation'],
  data: {
    locations: [
      { id: 'tutorial-beach', position: { x: 1, y: 0 }, entities: [], actions: [] },
      { id: 'tutorial-bridge', position: { x: 2, y: 0 }, entities: [], actions: [] },
    ],
  },
  locale: {
    en: {
      'location.tutorial-beach.title': 'Beach', 'location.tutorial-beach.description': 'Beach.',
      'location.tutorial-bridge.title': 'Bridge', 'location.tutorial-bridge.description': 'Bridge.',
    },
  },
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
    expect(new Set(location.entities)).toEqual(new Set(['miki', 'front-door', 'mirror', 'drawer', 'bookshelf', 'stairs-up']));
  });

  it('compiles `adjacent: ... while ...` into a pack-scoped, visibleWhen-gated travel action', () => {
    const wall = (module.data as { actions: GameAction[] }).actions[0];
    expect(wall.role).toBe('travel');
    expect(wall.results).toEqual([{ kind: 'relocate', locationId: 'tutorial-beach' }]);
    expect(wall.visibleWhen).toEqual({
      kind: 'state-variable', variable: 'flag:tutorial.miki-cleared', comparison: 'equal', value: true,
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

  it('compiles examine: as timed-on-first-completion-only by default, unlike other instant actions', () => {
    const examine = findEntityAction('miki', 'examine');
    expect(examine.instant).toBeUndefined();
    expect(examine.durationSeconds).toBe(2);
    expect(examine.instantAfterFirstCompletion).toBe(true);
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

describe('content DSL — takes: tag and entity examine auto-synthesis', () => {
  const source = `# info
id: takes-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: takes-proof

# location workshop
x: 0, y: 0
starting

## entity crate
examine: A supply crate.
take net:
  give: small-net
  takes: 2s
  say: You take the net.

## entity mannequin
talk: [[dialogue mannequin]]

# dialogue mannequin
start (mannequin): ...
`;
  const { module } = compileDsl(source);
  const findEntity = (id: string): EntityDefinition => {
    const entity = (module.data as { entities: EntityDefinition[] }).entities.find((candidate) => candidate.id === id);
    if (!entity) throw new Error(`entity not found: ${id}`);
    return entity;
  };
  const findAction = (entityId: string, actionId: string): EntityActionDefinition => {
    const action = findEntity(entityId).actions?.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error(`action not found: ${entityId}.${actionId}`);
    return action;
  };

  it('compiles `takes: <N>s` into a plain (not first-completion-only) timed action', () => {
    const takeNet = findAction('crate', 'take-net');
    expect(takeNet.instant).toBeUndefined();
    expect(takeNet.instantAfterFirstCompletion).toBeUndefined();
    expect(takeNet.durationSeconds).toBe(2);
  });

  it('lets an explicit `takes:` tag override examine\'s default duration while keeping it first-completion-only', () => {
    const source2 = source.replace('examine: A supply crate.', 'examine:\n  say: A supply crate.\n  takes: 5s');
    const { module: module2 } = compileDsl(source2);
    const examine = (module2.data as { entities: EntityDefinition[] }).entities
      .find((entity) => entity.id === 'crate')?.actions?.find((action) => action.id === 'examine');
    expect(examine?.durationSeconds).toBe(5);
    expect(examine?.instantAfterFirstCompletion).toBe(true);
  });

  it('auto-synthesizes a default examine action for an entity that declares none', () => {
    const examine = findAction('mannequin', 'examine');
    expect(examine.durationSeconds).toBe(2);
    expect(examine.instantAfterFirstCompletion).toBe(true);
    expect(module.locale?.en['chat.entity.mannequin.examine']).toBe('Mannequin.');
  });

  it('does not synthesize a duplicate examine for an entity that already declares one', () => {
    const crate = findEntity('crate');
    expect(crate.actions?.filter((action) => action.id === 'examine')).toHaveLength(1);
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
    expect(toOpenRoom.visibleWhen).toBeUndefined();
    expect(toLockedRoom.visibleWhen).toEqual({
      kind: 'state-variable',
      variable: 'flag:adjacent-proof.start-room-key-taken',
      comparison: 'equal',
      value: true,
    });
  });
});

describe('content DSL — discover: tag', () => {
  it('compiles `discover: <locationId>` into a discover-location result, independent of relocate', () => {
    const source = `# info
id: discover-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: discover-proof

# location start-room
x: 0, y: 0
starting

## entity window
look through: discover: far-room, say: You spot a distant room through the window.

# location far-room
x: 5, y: 5
`;
    const { module } = compileDsl(source);
    const window = (module.data as { entities: EntityDefinition[] }).entities.find((entity) => entity.id === 'window')!;
    const look = window.actions!.find((action) => action.id === 'look-through')!;
    expect(look.results).toEqual([
      { kind: 'discover-location', locationId: 'far-room' },
      { kind: 'chat', messageKey: 'chat.entity.window.look-through' },
    ]);
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

describe('content DSL — # patch <targetModuleId>', () => {
  it('compiles a patched entity to a whole-object data-updates.patches replace, identical in shape to a normal ## entity', () => {
    const source = `# info
id: patch-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: patch-proof

# patch other-module
## replace entity front-door
examine: A newly reinforced door.
pick lock:
  requires: lockpick
  xp: thieving 8
`;
    const { module } = compileDsl(source);
    expect(module.data).not.toHaveProperty('entities');
    const patches = module['data-updates'] as { patches: { targetModId: string; objectType: string; objectId: string; ops: unknown[] }[] };
    expect(patches.patches).toHaveLength(1);
    expect(patches.patches[0]).toMatchObject({ targetModId: 'other-module', objectType: 'entity', objectId: 'front-door' });
    const [op] = patches.patches[0].ops as { op: string; path: string; value: { id: string; actions: { id: string }[] } }[];
    expect(op).toMatchObject({ op: 'replace', path: '' });
    expect(op.value.id).toBe('front-door');
    expect(op.value.actions.map((action) => action.id)).toEqual(['examine', 'pick-lock']);
  });

  it('compiles a patched item the same way a normal # item would', () => {
    const source = `# info
id: patch-item-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: patch-item-proof

# patch other-module
## replace item bronze-dagger
tags: mainhand (1 attack), +2 attack
`;
    const { module } = compileDsl(source);
    const patches = module['data-updates'] as { patches: { targetModId: string; objectType: string; objectId: string }[] };
    expect(patches.patches).toHaveLength(1);
    expect(patches.patches[0]).toMatchObject({ targetModId: 'other-module', objectType: 'item', objectId: 'bronze-dagger' });
  });

  it('gives a patched entity the same default examine action a normal ## entity gets when none is authored', () => {
    const source = `# info
id: patch-examine-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: patch-examine-proof

# patch other-module
## upsert entity npc
talk: [[dialogue npc]]
`;
    const { module } = compileDsl(source);
    const patches = module['data-updates'] as { patches: { ops: { value: { actions: { id: string }[] } }[] }[] };
    const actionIds = patches.patches[0].ops[0].value.actions.map((action) => action.id);
    expect(actionIds).toContain('examine');
  });

  it('appends # patch-compiled patches onto whatever # advanced already declared, instead of clobbering either', () => {
    const source = `# info
id: patch-merge-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: patch-merge-proof

# advanced
{
  "data-updates": {
    "remove": { "locations": ["old-place"] },
    "patches": [{ "targetModId": "hand-written-target", "objectType": "flag", "objectId": "x", "ops": [{ "op": "replace", "path": "", "value": true }] }]
  }
}

# patch other-module
## replace entity npc
examine: Someone new.
`;
    const { module } = compileDsl(source);
    const dataUpdates = module['data-updates'] as { remove: { locations: string[] }; patches: { targetModId: string }[] };
    expect(dataUpdates.remove).toEqual({ locations: ['old-place'] });
    expect(dataUpdates.patches.map((patch) => patch.targetModId)).toEqual(['hand-written-target', 'other-module']);
  });

  it('end to end: a patch module edits an entity owned by another module, applied purely at runtime via the real applyModulesToBundle', () => {
    const owner: ContentModule = {
      id: 'owner-module', version: '1.0.0', universe: 'base', author: 'test', game_version: '1.0',
      data: {
        locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true, entities: ['gate-keeper'] }],
        entities: [{ id: 'gate-keeper', actions: [{ id: 'examine', instant: true, rewards: [], results: [] }] }],
      },
    };
    const patchSource = `# info
id: patch-e2e-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: patch-e2e-proof
dependencies: owner-module

# patch owner-module
## replace entity gate-keeper
examine: A gatekeeper, freshly reworked by the community.
wave: say: The gatekeeper waves back.
`;
    const { module: patchModule } = compileDsl(patchSource);

    const result = applyModulesToBundle(emptyBundle(), [owner, patchModule]);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    const gateKeeper = result.bundle.entities?.find((entity) => entity.id === 'gate-keeper');
    if (!gateKeeper?.actions) throw new Error('gate-keeper entity/actions missing from merged bundle');
    expect(gateKeeper.actions.map((action) => action.id)).toEqual(['examine', 'wave']);
  });

  it('compiles "## remove <kind> <id>" to data-updates.remove, pack-scoping bare flag ids like everywhere else', () => {
    const source = `# info
id: patch-remove-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: patch-remove-proof

# patch other-module
## remove location old-place
## remove entity old-guard
## remove item rusty-key
## remove flag other-pack.legacy-flag
## remove flag bare-flag
`;
    const { module } = compileDsl(source);
    const dataUpdates = module['data-updates'] as { remove: { locations: string[]; entities: string[]; items: string[]; flags: string[] } };
    expect(dataUpdates.remove.locations).toEqual(['old-place']);
    expect(dataUpdates.remove.entities).toEqual(['old-guard']);
    expect(dataUpdates.remove.items).toEqual(['rusty-key']);
    // "other-pack.legacy-flag" is dotted, used as-is; "bare-flag" is bare,
    // pack-scoped to *this* module's own pack (patch-remove-proof) — same
    // rule as set:/unset:/# flags everywhere else.
    expect(dataUpdates.remove.flags).toEqual(['other-pack.legacy-flag', 'patch-remove-proof.bare-flag']);
  });

  it('compiles "## upsert location" to per-field position patches plus locale overrides for title/examine', () => {
    const source = `# info
id: patch-location-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: patch-location-proof

# patch other-module
## upsert location town-square
x: 1
title: New Town Square
examine: A freshly cobbled plaza.
entities: fountain, notice-board
`;
    const { module } = compileDsl(source);
    const patches = module['data-updates'] as { patches: { objectType: string; objectId: string; ops: { op: string; path: string; value: unknown }[] }[] };
    expect(patches.patches).toHaveLength(1);
    expect(patches.patches[0]).toMatchObject({ objectType: 'location', objectId: 'town-square' });
    // Only the structural fields become ops; title/examine go to locale.
    expect(patches.patches[0].ops).toEqual([
      { op: 'replace', path: '/position/x', value: 1 },
      { op: 'replace', path: '/entities', value: ['fountain', 'notice-board'] },
    ]);
    expect(module.locale?.en['location.town-square.title']).toBe('New Town Square');
    expect(module.locale?.en['location.town-square.examine']).toBe('A freshly cobbled plaza.');
  });

  it('end to end: a patch module takes over ownership of a flag — removes the owner\'s declaration and redeclares it via # patch\'s own flags:, without a moduleConflictDisabled collision', () => {
    // Reproduces (corrected) the original guide-house flags migration this
    // session's earlier bug fix concerned: declaring the same flag id via
    // plain data.flags in two independent modules is a hard collision
    // (validateModuleDataCollisions runs before any data-updates.remove
    // ever does) — the fix is declaring it through # patch's flags:
    // instead, which compiles through data-updates.patches, not data.flags.
    const owner: ContentModule = {
      id: 'tutorial-island-guide-house', version: '1.0.0', universe: 'base', author: 'test', game_version: '1.0',
      data: {
        locations: [{ id: 'tutorial-guide-house', position: { x: 0, y: 0 }, starting: true, entities: ['bookshelf'] }],
        entities: [{
          id: 'bookshelf',
          actions: [
            { id: 'examine', instant: true, rewards: [], results: [] },
            { id: 'take-note', instant: true, rewards: [], results: [{ kind: 'flag', flagId: 'tutorial-island.bookshelf-note-taken', value: true }] },
          ],
        }],
        flags: [{ id: 'tutorial-island.bookshelf-note-taken', initialValue: false }],
      },
    };
    const patchSource = `# info
id: tutorial-island-guide-house-mod
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: tutorial-island-guide-house-mod
dependencies: tutorial-island-guide-house

# patch tutorial-island-guide-house
## remove flag tutorial-island.bookshelf-note-taken

flags:
  tutorial-island.bookshelf-note-taken
`;
    const { module: patchModule } = compileDsl(patchSource);

    const result = applyModulesToBundle(emptyBundle(), [owner, patchModule]);

    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.issues.filter((issue) => issue.message === 'validation.moduleConflictDisabled')).toEqual([]);
    expect(result.bundle.flags?.filter((flag) => flag.id === 'tutorial-island.bookshelf-note-taken')).toHaveLength(1);
    // The owner's own action referencing the flag still resolves — the
    // flag was relocated, not orphaned.
    const bookshelf = result.bundle.entities?.find((entity) => entity.id === 'bookshelf');
    expect(bookshelf?.actions?.some((action) => action.id === 'take-note')).toBe(true);
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
      { id: 'stat-proof.death-count', initialValue: 0 },
      { id: 'stat-proof.some-flag', initialValue: true },
    ]);
    expect(locale['stat.attack.title']).toBe('Attack');
    expect(locale['stat.attack.examine']).toBe('Power applied to outgoing attacks.');
    expect(locale['stat.movement-speed.title']).toBe('Movement speed');
    expect(locale['skill.regeneration.title']).toBe('Regeneration');
  });

  it('pack-scopes a bare # flags declaration to the exact same id a bare set:/hidden-if reference to it resolves to', () => {
    // Regression for a real crash: a module declaring `# flags\nfoo` while
    // also doing `set: foo`/`hidden if: foo` elsewhere used to compile the
    // *declaration* as bare `foo` but the *reference* as pack-scoped
    // `<pack>.foo` — two different flag ids, one declared-but-unused and one
    // referenced-but-undeclared. The latter trips the undeclared-flag
    // module-conflict-cascade (validateModuleSemanticChanges), which the
    // contribution editor didn't degrade from gracefully.
    const source = `# info
id: flag-scope-proof
version: 1.0.0
universe: base
author: test
game_version: 1.0
pack: flag-scope-proof

# flags
taken

# location proof-location
x: 0, y: 0
starting

## entity chest
examine: A chest.{!taken: It looks untouched.}
open: set: taken, once, say: You open it.
`;
    const { module } = compileDsl(source);
    const data = module.data as {
      flags: { id: string; initialValue: boolean | number }[];
      entities: { id: string; actions: { id: string; results?: { kind: string; flagId?: string }[] }[] }[];
    };

    const declaredFlagId = data.flags[0].id;
    const openAction = data.entities[0].actions.find((action) => action.id === 'open');
    const setResult = openAction?.results?.find((result) => result.kind === 'flag');

    expect(declaredFlagId).toBe('flag-scope-proof.taken');
    expect(setResult?.flagId).toBe(declaredFlagId);
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
