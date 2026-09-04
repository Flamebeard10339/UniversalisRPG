import type { ModalChoice } from './modalOption';
import { describe, expect, it } from 'vitest';
import { armAction, createGameState, GameState, travelSeconds } from './runtime';
import { Action } from '../grammar/action';
import { entitiesStood } from '../content/sections/location';
import { initialState } from './save';
import { itemInstance, receiveItem } from './itemInstance';
import { Registry } from '../content/registry';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { engineLocale, loadInEnglish, withEngineLocale } from '../content/engineLocale';
import { loadUniverse } from '../content/load';
import type { ModuleSource } from '../content/universe';
import { isMintedAction } from '../content/sections/entity';
import { actionAddress } from '../content/sections/action';
import { SaveDiff, SAVE_VERSION, serializeSave } from './save';
import { secondsToMs } from './units';
import { adoptRegistry, apply, applyDirective, beginAction, cancelAction, choiceToDirective, PlayChoice, PlaySession, PlayView, readRoom, runTest, SAID_HEAD_KEPT, SAID_TAIL_KEPT, serializeSession, sessionStatus, sheetOffers, startSession, submitModal, view, wait } from './session';
import { skillLevel, xpForLevel } from './skills';
import { BASE_LANGUAGE, localizerFor } from './localized';

import { parseDirectiveLine, printDirective, useChoiceId, type UseDirective } from '../content/sections/test';
import { actionLinesWritten } from '../grammar/action';
import { fixtureSources } from '../content/worldFixture';

const tutorial = (): Registry => loadUniverse(withEngineLocale(fixtureSources()));

function primed(registry: Registry, diff: SaveDiff): PlaySession {
  registry.saves.set('primed', { version: SAVE_VERSION, diff });
  const session = startSession(registry);
  applyDirective(session, { kind: 'load', save: 'primed' });
  return session;
}

function ids(v: PlayView): string[] {
  return v.choices.map((c) => c.id);
}

const statValueOf = (v: PlayView, id: string): number | undefined => v.stats.find((row) => row.id === id)?.value;

describe('session', () => {
  it('surfaces a fight as an encounter naming its foes, and clears it once the foe is down', () => {
    const module = `
# stat attack
base: 1

# stat max-health
base: 10

# stat swings-per-minute
base: 60

# resource health
max: max-health

# location arena
x: 0, y: 0
starting
entities:
  rat

# action hit
title: hit
continuous
rate: us.swings-per-minute
damage: us.attack
depletes: them.health

# entity player
stats: attack 1, max-health 10, swings-per-minute 60
uses: hit

# entity rat
title: Giant Rat
stats: attack 0, max-health 10, swings-per-minute 60
`;
    const session = startSession(loadInEnglish(module));

    let v = apply(session, 'fight:hit:rat');
    expect(v.encounter).not.toBeNull();
    expect(v.encounter!.foes.map((foe) => foe.title)).toEqual(['Giant Rat']);

    v = wait(session, 15);
    expect(v.encounter).toBeNull();
  });

  it('throws a clear error on an unavailable or unknown choice id', () => {
    const registry = tutorial();
    const session = startSession(registry);
    expect(() => apply(session, 'use:entity.first-steps.front-door.pick-lock')).toThrow();
    expect(() => apply(session, 'travel:tulsa.market-square')).toThrow();
    expect(() => apply(session, 'nonsense')).toThrow();
  });

  it('dispatches an item action through the choice-list API', () => {
    const module =
      FIXTURE_WORLD +
      `
# item bread
eat: take: 1 bread, say: You eat the bread.
`;
    const session = primed(loadInEnglish(module), { inventory: { bread: 1 } });

    let v = view(session);
    expect(ids(v)).toContain('use:item.bread.eat');

    v = apply(session, 'use:item.bread.eat');
    expect(v.said).toContain('You eat the bread.');
    expect(v.inventory).toEqual({});
    expect(ids(v)).not.toContain('use:item.bread.eat');
  });

  it('publishes a modal from open modal:, and closes it on the answer that completes it', () => {
    const module =
      FIXTURE_WORLD +
      `
# location camp
entities:
  mirror

# flag greeted

# entity mirror
look in:
  instant
  open modal: choose-race
  open modal: choose-name

# race human

# race elf

# race dwarf

# race orc

# dialogue mirror-greeting
owner = mirror

node greeting:
  when: not greeted
  set: greeted
  There you are, {player.name}, {player.race}.
`;
    const registry = loadInEnglish(module);
    const session = startSession(registry);

    let v = apply(session, 'use:entity.mirror.look-in');
    expect(v.modals).toEqual([
      { name: 'choose-race', leaving: null, options: [{ key: 'race', label: 'Race', values: [['human', 'Human'], ['elf', 'Elf'], ['dwarf', 'Dwarf'], ['orc', 'Orc']].map(([value, shown]) => ({ value, shown })) }] },
      { name: 'choose-name', leaving: null, options: [{ key: 'name', label: 'Name', values: null }] },
    ]);
    expect(v.player).toEqual({ name: null, race: null });

    v = submitModal(session, { name: 'Rowan' });
    expect(v.modals.map((modal) => modal.name)).toEqual(['choose-race']);
    expect(v.player).toEqual({ name: { id: 'Rowan', label: 'Name', title: 'Rowan' }, race: null });

    v = submitModal(session, { race: 'elf' });
    expect(v.modals).toEqual([]);
    expect(v.player).toEqual({ name: { id: 'Rowan', label: 'Name', title: 'Rowan' }, race: { id: 'elf', label: 'Race', title: 'Elf' } });

    v = apply(session, 'talk:mirror');
    expect(v.said).toContain('There you are, Rowan, Elf.');
  });

  it('reports a prune to whoever asked for the load and says nothing about it to the player', () => {
    const registry = loadInEnglish(
      FIXTURE_WORLD +
        `
# save stale
{"version":${SAVE_VERSION},"inventory":{"mod.gem":1}}
`);
    const session = startSession(registry);

    const outcome = applyDirective(session, { kind: 'load', save: 'stale' });
    const v = view(session);

    expect((outcome.pruned ?? []).map((warning) => warning.message)).toEqual(['Removed inventory mod.gem because its item is not loaded.']);
    expect(v.said).toEqual([]);
    expect(v.inventory).toEqual({});
  });
});

const ADOPT_BEFORE = ['# location camp', 'x: 0, y: 0', 'starting', '', '# location outpost', 'x: 1, y: 0', 'entities:', '  watcher', '', '# entity watcher', 'title: Watcher', 'poke:', '  say: Nothing here.', '', '# item relic', 'title: Relic', '', '# flag charted'].join('\n');
const ADOPT_AFTER = ['# location camp', 'x: 0, y: 0', 'starting', 'adjacent:', '  tower', '', '# location tower', 'title: Tower', 'x: 0, y: 1'].join('\n');

describe('adoptRegistry: content changed under a live session', () => {
  it('prunes what the new registry cannot resolve, reports every prune, and re-spreads discovery', () => {
    const session = primed(loadInEnglish(ADOPT_BEFORE), { location: 'outpost', inventory: { relic: 1 }, flags: { charted: true } });
    view(session);

    const pruned = adoptRegistry(session, loadInEnglish(ADOPT_AFTER)).map((warning) => warning.message);
    const after = view(session);

    expect(pruned.some((line) => line.includes('outpost'))).toBe(true);
    expect(pruned.some((line) => line.includes('relic'))).toBe(true);
    expect(pruned.some((line) => line.includes('charted'))).toBe(true);
    expect(after.said).toEqual([]);
    expect(after.location.id).toBe('camp');
    expect(session.registry.locations.has(after.location.id)).toBe(true);
    expect(after.inventory.relic).toBeUndefined();

    expect(ids(after)).toContain('travel:tower');
    const flags = (JSON.parse(serializeSession(session)) as { flags: Record<string, boolean> }).flags;
    expect(flags['tower.discovered']).toBe(true);
    expect(flags['outpost.discovered']).toBeUndefined();
  });

  it('drops a line the session had said but nobody had read, and adds none of its own', () => {
    const session = primed(loadInEnglish(ADOPT_BEFORE), { location: 'outpost', inventory: { relic: 1 }, flags: { charted: true } });
    view(session);

    applyDirective(session, { kind: 'use', obj: 'entity', objId: 'watcher', actionId: 'poke' });
    const pruned = adoptRegistry(session, loadInEnglish(ADOPT_AFTER)).map((warning) => warning.message);
    const after = view(session);

    expect(after.said).toEqual([]);
    expect(pruned.some((line) => line.includes('relic'))).toBe(true);
  });

  it('says nothing and moves nothing when the registry resolves everything the state names', () => {
    const session = primed(loadInEnglish(ADOPT_BEFORE), { location: 'outpost', inventory: { relic: 1 }, flags: { charted: true } });
    const before = view(session);

    adoptRegistry(session, loadInEnglish(ADOPT_BEFORE));
    const after = view(session);

    expect(after.said).toEqual([]);
    expect({ ...after, said: [] }).toEqual({ ...before, said: [] });
  });
});

describe('beginAction: arms a spannable action/craft instead of resolving it, but still completes an instant one', () => {
  const module =
    FIXTURE_WORLD +
    `
# location camp
entities:
  oven

# item roasted-chestnut
examine: Split and steaming.

# entity oven
roast:
  continuous
  time: 4
  give: 1 roasted-chestnut

# item bread
eat: take: 1 bread, say: You eat the bread.

# item dough
examine: Springy and pale.

# item mix
examine: Dry flour and salt.

# recipe dough
time: 2
out: 1 dough

# recipe mix
out: 1 mix
`;

  it('leaves a spannable entity action armed — activeAction set, progress 0, time and inventory unchanged', () => {
    const registry = loadInEnglish(module);
    const session = startSession(registry);

    const v = beginAction(session, 'use:entity.oven.roast');
    expect(v.action).not.toBeNull();
    expect(v.action?.progress).toBe(0);
    expect(v.inventory['roasted-chestnut'] ?? 0).toBe(0);
    expect(v.time).toBe(0);
  });

  it('completes an instant item action (no time:) immediately, same as apply', () => {
    const session = primed(loadInEnglish(module), { inventory: { bread: 1 } });

    const v = beginAction(session, 'use:item.bread.eat');
    expect(v.action).toBeNull();
    expect(v.inventory).toEqual({});
    expect(v.said).toContain('You eat the bread.');
  });

  it('leaves a spannable craft (time: 2) armed without resolving it', () => {
    const registry = loadInEnglish(module);
    const session = startSession(registry);

    const v = beginAction(session, 'craft:dough');
    expect(v.action).not.toBeNull();
    expect(v.inventory.dough ?? 0).toBe(0);
    expect(v.time).toBe(0);
  });

  it('completes an instant craft (no time:) immediately, same as apply', () => {
    const registry = loadInEnglish(module);
    const session = startSession(registry);

    const v = beginAction(session, 'craft:mix');
    expect(v.action).toBeNull();
    expect(v.inventory.mix).toBe(1);
  });

  it('throws on an unavailable or unknown choice id, same as apply', () => {
    const registry = loadInEnglish(module);
    const session = startSession(registry);
    expect(() => beginAction(session, 'nonsense')).toThrow();
  });
});

describe('travel is a flat-timed journey', () => {
  const module =
    FIXTURE_WORLD +
    `
# variable travel-seconds
value: 7

# location camp
adjacent:
  beach

# location beach
east of camp
adjacent:
  camp
`;

  it('apply relocates instantly in real time while accruing the journey sim-time', () => {
    const registry = loadInEnglish(module);
    const session = startSession(registry);
    const journey = travelSeconds(registry);

    const v = apply(session, 'travel:beach');
    expect(v.location.id).toBe('beach');
    expect(v.time).toBe(journey);
    expect(v.action).toBeNull();
  });

  it('beginAction arms the journey spannably — location and time unchanged until driven', () => {
    const registry = loadInEnglish(module);
    const session = startSession(registry);
    const journey = travelSeconds(registry);

    const v = beginAction(session, 'travel:beach');
    expect(v.action).not.toBeNull();
    expect(v.location.id).toBe('camp');
    expect(v.time).toBe(0);

    const arrived = wait(session, journey);
    expect(arrived.location.id).toBe('beach');
    expect(arrived.action).toBeNull();
    expect(arrived.time).toBe(journey);
  });
});

describe('travel edges aliased by a free entity relocate are hidden', () => {
  it('hides a travel edge that a stairs-like entity already offers as a free relocate', () => {
    const registry = tutorial();
    const session = primed(registry, { location: 'fixture-town.store' });

    const choiceIds = ids(view(session));
    expect(choiceIds).toContain('use:entity.fixture-town.stair.go-up');
    expect(choiceIds).toContain('use:entity.fixture-town.stair.go-down');
    expect(choiceIds).not.toContain('travel:fixture-town.loft');
    expect(choiceIds).not.toContain('travel:fixture-town.cellar');
  });

  it('hands the road out of the green to the side door once the door will open', () => {
    const registry = tutorial();
    const locked = ids(view(startSession(registry)));

    expect(locked).not.toContain('travel:fixture-town.gate');
    expect(locked).not.toContain('use:entity.fixture-town.side-door.step-through');

    const session = primed(registry, { flags: { 'fixture-town.side-door.unlocked': true } });
    expect(ids(view(session))).toContain('travel:fixture-town.gate');
    readRoom(session);
    const opened = ids(view(session));

    expect(opened).toContain('use:entity.fixture-town.side-door.step-through');
    expect(opened).not.toContain('travel:fixture-town.gate');
  });

  it('keeps an unaliased edge, and one whose relocate is not free (has a cost)', () => {
    const module =
      FIXTURE_WORLD +
      `
# location camp
adjacent:
  cave
  summit
entities:
  gate

# location cave
x: 1, y: 0

# location summit
x: 0, y: 1

# item coin
examine: A worn copper coin.

# entity gate
enter:
  take: 1 coin
  relocate: cave
`;
    const session = primed(loadInEnglish(module), { inventory: { coin: 1 } });

    const choiceIds = ids(view(session));
    expect(choiceIds).toContain('travel:cave');
    expect(choiceIds).toContain('travel:summit');
  });
});

describe('cancelAction', () => {
  it('drops the action in flight, keeping units already completed and un-consumed inputs', () => {
    const session = primed(tutorial(), { inventory: { 'core.rat-tail': 6, 'core.twine': 6 } });
    readRoom(session);

    beginAction(session, 'craft:core.rope-from-tails');
    const made = wait(session, 2);
    expect(made.inventory['core.rope']).toBe(1);
    expect(made.action).not.toBeNull();

    const v = cancelAction(session);
    expect(v.action).toBeNull();
    expect(v.inventory['core.rope']).toBe(1);
    expect(v.inventory['core.rat-tail']).toBe(5);
    expect(v.choices.length).toBeGreaterThan(0);
  });

  it('is a no-op when nothing is active', () => {
    const registry = tutorial();
    const session = startSession(registry);
    expect(() => cancelAction(session)).not.toThrow();
    expect(sessionStatus(session).action).toBeNull();
  });
});

describe('runTest: begin:/wait:/cancel directives', () => {
  const module =
    FIXTURE_WORLD +
    `
# location camp
entities:
  oven

# item roasted-chestnut
examine: Split and steaming.

# entity oven
roast:
  continuous
  time: 4
  give: 1 roasted-chestnut

# test roast-instant
travel: camp
use: entity.oven.roast

# test roast-begin-then-wait
travel: camp
begin: use entity.oven.roast
wait: 4

# test roast-begin-partial-cancel
travel: camp
begin: use entity.oven.roast
wait: 2
cancel
`;

  it('begin: a repeating action then wait: to completion reproduces the same end state as an instant use:', () => {
    const registry = loadInEnglish(module);

    const instantState = createGameState();
    expect(runTest('roast-instant', registry, instantState)).toEqual({ passed: true });

    const armedState = createGameState();
    expect(runTest('roast-begin-then-wait', registry, armedState)).toEqual({ passed: true });

    expect(armedState.time).toBe(instantState.time);
    expect(armedState.inventory).toEqual(instantState.inventory);
    expect(armedState.activeAction).toEqual(instantState.activeAction);
  });

  it('begin: + a partial wait: + cancel leaves the action stopped mid-flight', () => {
    const registry = loadInEnglish(module);
    const state = createGameState();

    expect(runTest('roast-begin-partial-cancel', registry, state)).toEqual({ passed: true });

    expect(state.activeAction).toBeNull();
    expect(state.inventory['roasted-chestnut'] ?? 0).toBe(0);
    expect(state.time).toBe(secondsToMs(2));
  });
});

describe('runTest: a route that ends holding a modal has not been walked to its end', () => {
  const module =
    FIXTURE_WORLD +
    `
# location camp
entities:
  mirror
  sage

# flag greeted

# entity mirror
look in:
  instant
  open modal: choose-race
  open modal: choose-name

# race human

# race elf

# race dwarf

# race orc

# entity sage
title: Sage

# dialogue sage-talk
owner = sage

node greeting:
  when: not greeted
  set: greeted
  -> Nod.

# test leaves-the-modal-open
travel: camp
use: entity.mirror.look-in

# test half-answers-the-modal
travel: camp
use: entity.mirror.look-in
submit-modal: name=Rowan

# test answers-the-modal
travel: camp
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=elf

# test leaves-a-dialogue-open
travel: camp
talk: sage

# test answers-the-dialogue-as-a-modal
travel: camp
talk: sage
submit-modal: choice=0
`;

  it('fails, naming the modal, and passes once every option of it is answered', () => {
    const registry = loadInEnglish(module);

    expect(runTest('leaves-the-modal-open', registry, createGameState())).toEqual({ passed: false, failure: 'modal left open: choose-name' });
    expect(runTest('half-answers-the-modal', registry, createGameState())).toEqual({ passed: false, failure: 'modal left open: choose-race' });

    const answered = createGameState();
    expect(runTest('answers-the-modal', registry, answered)).toEqual({ passed: true });
    expect(answered.player).toEqual({ name: 'Rowan', race: 'elf' });
  });

  it('holds a dialogue to the same standard, since a menu left hanging is the same unfinished route', () => {
    const registry = loadInEnglish(module);

    expect(runTest('leaves-a-dialogue-open', registry, createGameState())).toEqual({ passed: false, failure: 'modal left open: dialogue' });
    expect(runTest('answers-the-dialogue-as-a-modal', registry, createGameState())).toEqual({ passed: true });
  });
});

const PUBLISHED_MODULE = `
# stat might
base: 4

# stat grit
title: Fortitude
base: 2

// A ceiling nothing on a fresh sheet supplies, and one thing that supplies it.
# stat max-ardour

# resource ardour
max: max-ardour
start: 0

# item censer
slot: hand
+9 max-ardour

# skill smithing

# location forge
x: 0, y: 0
starting
title: The Forge
adjacent:
  overlook
  vault while hatch.unlocked
entities:
  window
  bench
  hatch
  ladder

# location overlook
x: 1, y: 0
adjacent:
  forge
  ridge

# location ridge
x: 2, y: 0
adjacent:
  overlook

# location vault
x: 0, y: 1
adjacent:
  forge

# location shipwreck
x: 9, y: 9

# item ore
examine: Streaked with red.

# item ingot
examine: A dull grey bar.

# item gauntlet
title: Gauntlet
slot: hand
+3 might

# entity window
look through:
  discover: shipwreck
  discover: vault

# entity hatch
flags: unlocked
unlock:
  set: unlocked

# entity ladder
flags: kicked
climb down:
  instant
  relocate: vault
  say: You go down the ladder.
kick:
  instant
  relocate: vault
  set: kicked

# station bench

# entity bench
stations: bench

# recipe ingot
station: bench
in: ore
out: ingot
skill: smithing 5

# save stocked
{"version":${SAVE_VERSION},"inventory":{"ore":1,"gauntlet":1}}

# entity ledger
forget:
  unset: forge.discovered
  unset: overlook.discovered

# save at-the-overlook
{"version":${SAVE_VERSION},"location":"overlook"}

# test placed-at-the-forge
travel: forge
`;

const GROWN_MODULE =

  FIXTURE_WORLD +
  `
# stat might
base: 4

# entity player
equipment-slots: hand

# item gauntlet
title: Gauntlet
slot: hand
item-level: 4
+3 might

# item mitten
title: Mitten
slot: hand
`;

const ACTION_SHAPES = `
# stat attack
base: 10

# stat dr

# stat attack-rate
base: 25

# stat max-health
base: 30

# resource health
max: max-health

# action strike
title: strike
continuous
rate: us.attack-rate
damage: us.attack vs them.dr
depletes: them.health

# entity player
stats: attack 10, dr 0, max-health 30, attack-rate 25
uses: strike

# item blessing
title: Blessing

# location yard
x: 0, y: 0
starting
entities: dummy, shrine, forge

# entity dummy
title: Dummy
stats: max-health 1000, dr 0

# entity shrine
title: Shrine
chant:
  continuous
  time: 4
  give: 1 blessing

# entity forge
title: Forge
stoke:
  continuous
  time: 3
  attempts: 5
  give: 1 blessing
`;

describe('what the engine publishes', () => {
  it('publishes a completion figure only where one has counted something, and none where it has not', () => {
    const registry = loadInEnglish(ACTION_SHAPES);
    const shapes = view(startSession(registry)).choices.filter((choice) => choice.kind === 'action');
    expect(shapes.some((choice) => choice.id.startsWith('fight:'))).toBe(true);
    expect(shapes.length).toBeGreaterThan(1);

    for (const choice of shapes) {
      const session = startSession(registry);
      applyDirective(session, choiceToDirective(choice));
      for (let step = 0; step < 60; step++) {
        const action = view(session).action;
        const completion = action?.completion ?? null;
        expect(completion === null || completion < 1, `${choice.id} at step ${step} published completion ${completion}`).toBe(true);
        wait(session, 0.3);
      }
    }
  });

  it('names every stat it counts, on the row it counted it on', () => {
    const v = view(startSession(loadInEnglish(PUBLISHED_MODULE)));

    expect(v.stats.map((row) => [row.id, row.title])).toEqual([
      ['might', 'Might'],
      ['grit', 'Fortitude'],
      ['max-ardour', 'Max Ardour'],
    ]);
  });

  it('publishes a pool once something gives the character a ceiling for it, and not before', () => {
    const session = primed(loadInEnglish(PUBLISHED_MODULE), { inventory: { censer: 1 } });
    expect(view(session).resources.map((each) => each.id)).toEqual([]);

    applyDirective(session, { kind: 'equip', item: 'censer' });
    expect(view(session).resources.map((each) => [each.id, each.max])).toEqual([['ardour', 9]]);

    applyDirective(session, { kind: 'unequip', slot: 'hand' });
    expect(view(session).resources.map((each) => each.id)).toEqual([]);
  });

  it('carries stat values, and recomputes them when equipment changes them', () => {
    const session = primed(loadInEnglish(PUBLISHED_MODULE), { inventory: { gauntlet: 1 } });

    expect(statValueOf(view(session), 'might')).toBe(4);

    applyDirective(session, { kind: 'equip', item: 'gauntlet' });
    const armed = view(session);
    expect(armed.equipment).toEqual([{ slot: 'hand', title: 'Hand', item: 'gauntlet', name: 'Gauntlet' }]);
    expect(statValueOf(armed, 'might')).toBe(7);

    applyDirective(session, { kind: 'unequip', slot: 'hand' });
    const bare = view(session);
    expect(bare.equipment).toEqual([]);
    expect(statValueOf(bare, 'might')).toBe(4);
  });

  it('offers no room-level way to wear a carried thing or take a worn one off', () => {
    const session = primed(loadInEnglish(PUBLISHED_MODULE), { inventory: { gauntlet: 1 } });

    expect(ids(view(session)).filter((id) => id.startsWith('equip:'))).toEqual([]);

    applyDirective(session, { kind: 'equip', item: 'gauntlet' });
    expect(ids(view(session)).filter((id) => id.startsWith('unequip:'))).toEqual([]);

    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
    submitModal(session, { item: 'worn:hand' });
    const asked = view(session).modals[0].options;
    expect(asked[asked.length - 1].values?.map((choice) => choice.value)).toContain('unequip');
  });

  it('names a grown copy beside the stacks, and offers it as its own row to wear', () => {
    const registry = loadInEnglish(GROWN_MODULE);
    const grownState = createGameState('camp');
    Object.assign(grownState.inventory, { mitten: 1 });
    receiveItem(grownState, registry, 'gauntlet', 1);
    const grown = { instance: '1' };

    const { version: _version, ...diff } = JSON.parse(serializeSave(grownState, registry)) as SaveDiff & { version: number };
    const session = primed(registry, diff);

    const carried = view(session);
    expect(carried.inventory).toEqual({ mitten: 1 });
    expect(carried.grown).toEqual({ [grown.instance]: 'gauntlet' });
    expect(statValueOf(carried, 'might')).toBe(4);

    expect(carried.carried).toEqual([
      { id: 'mitten', name: 'Mitten', count: 1, shown: 'Mitten x1', grown: false, verbs: ['equip', 'destroy'], sockets: false },
      { id: grown.instance, name: 'Gauntlet', count: 1, shown: 'Gauntlet', grown: true, verbs: ['grow', 'equip', 'destroy'], sockets: false },
    ]);

    applyDirective(session, { kind: 'equip', item: grown.instance });
    const armed = view(session);
    expect(armed.equipment).toEqual([{ slot: 'hand', title: 'Hand', item: grown.instance, name: 'Gauntlet' }]);
    expect(statValueOf(armed, 'might')).toBe(7);
    expect(armed.carried).toEqual([
      { id: 'mitten', name: 'Mitten', count: 1, shown: 'Mitten x1', grown: false, verbs: ['equip', 'destroy'], sockets: false },
      {
        id: grown.instance,
        name: 'Gauntlet',
        count: 1,
        shown: 'Gauntlet (Hand)',
        grown: true,
        worn: { slot: 'hand', title: 'Hand' },
        verbs: ['grow', 'unequip', 'destroy'],
        sockets: false,
      },
    ]);
  });

  it('carries every skill the world declares, earned in or not', () => {
    const registry = loadInEnglish(PUBLISHED_MODULE);
    const session = startSession(registry);
    applyDirective(session, { kind: 'load', save: 'stocked' });

    expect(view(session).xp).toEqual([{ id: 'smithing', title: 'Smithing', value: 0, level: 1, earned: 0, span: xpForLevel(2) }]);

    const forged = apply(session, 'craft:ingot');
    expect(forged.xp).toEqual([{ id: 'smithing', title: 'Smithing', value: 5, level: skillLevel(5), earned: 5 - xpForLevel(skillLevel(5)), span: xpForLevel(skillLevel(5) + 1) - xpForLevel(skillLevel(5)) }]);
    expect(forged.inventory).toEqual({ ingot: 1, gauntlet: 1 });
  });

  it('carries where the player is standing and everywhere they could walk to', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));

    const opening = view(session);

    expect(opening.discovered.map((place) => place.id).sort()).toEqual(['forge', 'overlook']);
  });

  it('fills the map in as the player walks, from wherever they are standing now', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));

    expect(view(session).discovered.map((place) => place.id)).not.toContain('ridge');

    const walked = apply(session, 'travel:overlook');

    expect(walked.discovered.map((place) => place.id).sort()).toEqual(['forge', 'overlook', 'ridge']);
  });

  it('discovers where a player was put down, and not only where they walked to', () => {
    const registry = loadInEnglish(PUBLISHED_MODULE);
    const state = createGameState();

    expect(runTest('placed-at-the-forge', registry, state)).toEqual({ passed: true });

    expect(state.flags['forge.discovered']).toBe(true);
    expect(state.flags['overlook.discovered']).toBe(true);
    expect(state.flags['vault.discovered']).toBeUndefined();
    expect(state.flags['shipwreck.discovered']).toBeUndefined();
  });

  it('cannot be hidden from a player who can reach it, whatever a result asks', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));

    applyDirective(session, { kind: 'use', obj: 'entity', objId: 'ledger', actionId: 'forget' });

    expect(view(session).discovered.map((place) => place.id).sort()).toEqual(['forge', 'overlook']);
  });

  it('works out what a save should have known, since a save carries both its inputs at once', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));

    applyDirective(session, { kind: 'load', save: 'at-the-overlook' });

    expect(view(session).discovered.map((place) => place.id).sort()).toEqual(['forge', 'overlook', 'ridge']);
  });

  it('reveals what a way was shutting the moment it opens, without leaving the room', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));

    const opened = apply(session, 'use:entity.hatch.unlock');

    expect(opened.location.id).toBe('forge');
    expect(opened.discovered.map((place) => place.id)).toContain('vault');
  });

  it('still takes a place it was told about from somewhere else', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));

    const told = apply(session, 'use:entity.window.look-through');

    expect(told.discovered.map((place) => place.id)).toContain('shipwreck');
    expect(told.flags['shipwreck.discovered']).toBe(true);
  });

  it('says a road is shut rather than hiding it, once both of its ends are known', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));

    const scouted = apply(session, 'use:entity.window.look-through');
    const opened = apply(session, 'use:entity.hatch.unlock');

    expect(scouted.discovered.find((place) => place.id === 'forge')?.adjacent).toEqual([
      { to: 'overlook', open: true },
      { to: 'vault', open: false },
    ]);
    expect(opened.discovered.find((place) => place.id === 'forge')?.adjacent).toEqual([
      { to: 'overlook', open: true },
      { to: 'vault', open: true },
    ]);
  });

  it('carries where each place is, since a map is drawn and not listed', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));

    const found = view(session).discovered;

    expect(found.find((place) => place.id === 'forge')).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(found.find((place) => place.id === 'overlook')).toMatchObject({ x: 1, y: 0, z: 0 });
  });

  it('says where a choice leads, so a map can tell which offer is the way to a place', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));
    const leads = (id: string): string | undefined => view(session).choices.find((choice) => choice.id === id)?.leadsTo;

    expect(leads('travel:overlook')).toBe('overlook');
    expect(leads('use:entity.ladder.climb-down')).toBe('vault');
    expect(leads('use:entity.ladder.kick')).toBeUndefined();
    expect(leads('use:entity.hatch.unlock')).toBeUndefined();
  });

  it('names each discovered place with the word its author wrote', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));

    const found = view(session).discovered.find((place) => place.id === 'forge');

    expect(found?.title).toBe('The Forge');
  });

  it('carries how the discovered places connect, which is the other half of a map', () => {
    const session = startSession(loadInEnglish(PUBLISHED_MODULE));
    const before = view(session).discovered;

    const opened = apply(session, 'use:entity.hatch.unlock');

    expect(before.find((place) => place.id === 'forge')?.adjacent).toEqual([{ to: 'overlook', open: true }]);
    expect(opened.discovered.find((place) => place.id === 'forge')?.adjacent).toEqual([
      { to: 'overlook', open: true },
      { to: 'vault', open: true },
    ]);
    expect(opened.discovered.find((place) => place.id === 'vault')?.adjacent).toEqual([{ to: 'forge', open: true }]);
  });
});

describe('what the engine withholds', () => {
  it('has a standing answer for every GameState field, so a new one cannot arrive unclassified', () => {
    const classified: Record<keyof GameState, 'published' | 'withheld'> = {
      language: 'withheld',
      location: 'published',
      time: 'published',
      cyclesDone: 'withheld',
      spent: 'withheld',
      flags: 'published',
      bundles: 'withheld',
      inventory: 'published',
      packOrder: 'published',
      equipped: 'published',
      xp: 'published',
      resources: 'published',
      modals: 'published',
      player: 'published',
      settings: 'published',
      activeAction: 'published',
      performNext: 'withheld',
      journey: 'published',
      log: 'withheld',
      endedBecause: 'withheld',
      engagedBy: 'withheld',
      carriedTold: 'withheld',
      engagesAt: 'withheld',
      debug: 'withheld',
      rng: 'withheld',
      visits: 'withheld',
      buffs: 'withheld',
      resourceRateRemainders: 'withheld',
      instances: 'published',
      populations: 'withheld',
      shops: 'withheld',
    };

    expect(Object.keys(createGameState()).sort()).toEqual(Object.keys(classified).sort());

    const published = Object.keys(classified).filter((field) => classified[field as keyof GameState] === 'published');
    const carried = new Set(Object.keys(view(startSession(loadInEnglish('# location camp\nx: 0, y: 0\nstarting\n')))));
    const renamed: Record<string, string> = { equipped: 'equipment', activeAction: 'action', instances: 'grown', packOrder: 'carried' };
    for (const field of published) expect(carried.has(renamed[field] ?? field), field).toBe(true);
  });
});

const FIGHT_MODULE = `
# stat attack
base: 2

# stat max-health
base: 12

# stat swings-per-minute
base: 60

# resource health
max: max-health

# location camp
x: 0, y: 0
starting
entities:
  dummy

# action hit
title: hit
continuous
rate: us.swings-per-minute
damage: us.attack
depletes: them.health

# entity player
stats: attack 1, max-health 12, swings-per-minute 60
uses: hit

# entity dummy
title: Dummy
stats: attack 1, max-health 12, swings-per-minute 60
`;

describe('a save is data the engine takes a copy of, not a handle onto it', () => {
  const module =
    FIXTURE_WORLD +
    `
# location camp
entities:
  oven
  mirror

# item bun
examine: Warm.

# entity mirror
look in:
  instant
  open modal: choose-race
  open modal: choose-name

# race human

# race elf

# race dwarf

# race orc

# entity oven
roast:
  continuous
  time: 4
  give: 1 bun
`;

  it('does not leave the author of a save holding the state it loaded', () => {
    const registry = loadInEnglish(module);
    const session = startSession(registry);
    const mine = { name: 'Rowan', race: 'elf' };
    registry.saves.set('forged', { version: SAVE_VERSION, diff: { player: mine } });

    applyDirective(session, { kind: 'load', save: 'forged' });
    expect(sessionStatus(session).player.name?.title).toBe('Rowan');

    mine.name = 'MUTATED';
    expect(sessionStatus(session).player.name?.title).toBe('Rowan');
  });

  it('does not let play rewrite the save it was loaded from', () => {
    const registry = loadInEnglish(module);
    const session = startSession(registry);
    const fixture = { ownerRef: 'entity.oven', actionSlug: 'roast', repeating: true, implicitTarget: 1000, cadences: { player: { progress: 0, attemptsMade: 0 } }, roster: { player: { ownerRef: 'entity.oven', actionSlug: 'roast', target: '' } } };
    registry.saves.set('midbake', { version: SAVE_VERSION, diff: { activeAction: fixture } });

    applyDirective(session, { kind: 'load', save: 'midbake' });
    const v = wait(session, 3);

    expect(v.action!.progress).toBe(0.75);
    expect(fixture.cadences.player.progress).toBe(0);
  });

  it('plays on through every path when a save left an action with no player clock', () => {
    const registry = loadInEnglish(FIGHT_MODULE);
    const session = startSession(registry);
    registry.saves.set('midfight', {
      version: SAVE_VERSION,
      diff: { activeAction: { ownerRef: 'action.hit', actionSlug: 'hit', repeating: true, implicitTarget: 1000, cadences: {}, roster: { player: { ownerRef: 'action.hit', actionSlug: 'hit', target: 'dummy' } }, actors: { dummy: { resources: { health: 12000 }, rateRemainders: {} } } } },
    });

    applyDirective(session, { kind: 'load', save: 'midfight' });

    const v = view(session);
    expect(v.encounter!.cadence).toBe(0);
    expect(v.action!.label).toBe('hit');

    expect(() => wait(session, 3)).not.toThrow();
  });

  it('says who the action under way is aimed at, addressed and named the way a choice says what offers it', () => {
    const session = startSession(loadInEnglish(FIGHT_MODULE));
    view(session);

    const v = apply(session, 'fight:hit:dummy');

    expect(v.action!.of).toBe('entity.dummy');
    expect(v.action!.detail).toBe('Dummy');
  });

  it('is aimed at nobody when what the seat holds is not an entity', () => {
    const road =
      FIXTURE_WORLD +
      `
# location camp
adjacent: hut

# location hut
title: Hut
x: 1, y: 0

# entity player
`;
    const session = startSession(loadInEnglish(road));
    view(session);

    const v = beginAction(session, 'travel:hut');

    expect(v.action!.label).toContain('Hut');
    expect(v.action!.of).toBeUndefined();
    expect(v.action!.detail).toBeUndefined();
  });

  it('publishes an action a save left without a player clock instead of dying on the next look', () => {
    const registry = loadInEnglish(module);
    const session = startSession(registry);
    registry.saves.set('midbake', {
      version: SAVE_VERSION,
      diff: { activeAction: { ownerRef: 'entity.oven', actionSlug: 'roast', repeating: true, implicitTarget: 1000, cadences: {}, roster: { player: { ownerRef: 'entity.oven', actionSlug: 'roast', target: '' } } } },
    });

    applyDirective(session, { kind: 'load', save: 'midbake' });

    const v = view(session);
    expect(v.action).toEqual({ label: 'Roast', progress: 0, attempts: 0, completion: null });
  });
});

describe('the handle a driver obtains', () => {
  it('carries no route to the state it plays, by enumeration or by key', () => {
    const session = startSession(loadInEnglish('# location camp\nx: 0, y: 0\nstarting\n'));

    expect(Object.getOwnPropertySymbols(session)).toEqual([]);
    expect(Object.keys(session)).toEqual(['registry']);
    expect(Object.values(session).some((value) => value instanceof Object && 'inventory' in value)).toBe(false);
  });

  it('refuses to play a handle it did not hand out, rather than reading undefined', () => {
    const registry = loadInEnglish('# location camp\nx: 0, y: 0\nstarting\n');
    const forged = { registry };

    expect(() => view(forged)).toThrow(/not a session startSession handed out/);
  });
});

describe('starting a session with nowhere to begin', () => {
  it('says so instead of failing later with an empty location id', () => {
    expect(() => startSession(loadInEnglish('# location camp\nx: 0, y: 0'))).toThrow(/no # location is marked starting/);
  });
});

describe('view: what a long span hands back', () => {
  const arena = `
# stat attack
base: 1

# stat accuracy
base: 100

# stat evasion
base: 0

# stat swings-per-minute
base: 60

# stat max-health
base: 1000000

# resource health
max: max-health
start: 1000000

# location arena
starting
entities: dummy

# action hit
title: hit
continuous
rate: us.swings-per-minute
accuracy: us.accuracy vs them.evasion
damage: us.attack
depletes: them.health

# entity player
stats: attack 0, max-health 1000000, accuracy 100, evasion 0, swings-per-minute 60
uses: hit

# entity dummy
title: Dummy
stats: attack 0, max-health 1000000, accuracy 100, evasion 0, swings-per-minute 60
`;

  function swinging(): ReturnType<typeof startSession> {
    const session = startSession(loadInEnglish(arena));
    view(session);
    apply(session, 'fight:hit:dummy');
    return session;
  }

  it('elides the middle of a span too long to read instead of handing back every line', () => {
    const session = swinging();

    const said = wait(session, 3600).said;

    expect(said).toHaveLength(SAID_HEAD_KEPT + 1 + SAID_TAIL_KEPT);
    expect(said[SAID_HEAD_KEPT]).toMatch(/^… \d+ more lines$/);
    expect(said[0]).toMatch(/^You hit the Dummy/);
    expect(said[said.length - 1]).toMatch(/^You hit the Dummy/);
  });

  it('keeps nothing it has already handed back, so a session that idles forever does not grow', () => {
    const session = swinging();

    wait(session, 3600);
    expect(view(session).said).toEqual([]);

    wait(session, 3600);
    expect(view(session).said).toEqual([]);
  });

  it('hands back a short span whole', () => {
    const session = swinging();

    const said = wait(session, 5).said;

    expect(said).toHaveLength(5);
    expect(said.every((line) => line.startsWith('You hit the Dummy'))).toBe(true);
  });
});

const GROWTH_MODULE =

  FIXTURE_WORLD +
  `
# cluster-jewel node
shape: point
open-connections: e
passives: 1 hale

# item blade
title: Blade
slot: hand
origin-cluster: node
item-level: 2

# item node-jewel
cluster-jewel: node

# item lesser-orb
cluster-effect: +25% max-health

# test grow-a-blade
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with node-jewel
allocate: 1 at 1,0 position 1
apply: 1 at 1,0 with lesser-orb
refuse: allocate 1 at 0,0 slot e
refuse: slot 1 at 0,0 e with node-jewel
refuse: apply 1 at 1,0 with lesser-orb
assert: has lesser-orb

# test refusal-is-not-a-pass
refuse: apply 1 at 0,0 with lesser-orb
`;

describe('the three growth verbs through the directive surface', () => {
  const registry = loadInEnglish(GROWTH_MODULE);

  function stocked(): GameState {
    const state = createGameState('camp');
    receiveItem(state, registry, 'blade', 1);
    Object.assign(state.inventory, { 'node-jewel': 1, 'lesser-orb': 2 });
    return state;
  }

  it('replays a whole growth, and each refusal, out of an authored # test', () => {
    const state = stocked();
    expect(runTest('grow-a-blade', registry, state)).toEqual({ passed: true });

    expect(state.inventory).toEqual({ 'node-jewel': 0, 'lesser-orb': 1 });
    const grown = itemInstance(state, '1');
    expect(grown?.plane['1,0']).toEqual({ jewel: 'node', entry: 'e', roll: expect.any(Number), allocatedPositions: [1], allocatedSlots: [], effects: ['lesser-orb'] });
  });

  it('fails a refuse: whose growth the plane allowed', () => {
    const state = stocked();
    expect(runTest('grow-a-blade', registry, state)).toEqual({ passed: true });
    expect(runTest('refusal-is-not-a-pass', registry, state)).toEqual({
      passed: false,
      failure: 'apply: 1 at 0,0 with lesser-orb was not refused',
    });
  });

  it('hands a refusal back as the failure and says it where the player reads', () => {
    const session = primed(registry, { inventory: { blade: 1 } });
    const before = view(session).said.length;

    expect(applyDirective(session, { kind: 'slot', target: 'blade', hex: { q: 0, r: 0 }, direction: 'e', jewel: 'node-jewel' })).toEqual({
      failure: 'blade is not a base: only an item you can wear has a plane to grow',
    });
    expect(view(session).said.slice(before)).toContain('blade is not a base: only an item you can wear has a plane to grow');
    expect(sessionStatus(session).grown).toEqual({});
  });

  it('mints once a base, however much is grown on it afterwards', () => {
    const state = stocked();
    expect(runTest('grow-a-blade', registry, state)).toEqual({ passed: true });
    expect(Object.keys(state.instances.byId)).toEqual(['1']);
    expect(state.instances.next).toBe(2);
  });
});

describe('a missing translation shows its key, in every direction', () => {
  const ISLAND = ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', 'examine: Shingle and a drawn-up boat.', 'entities:', '  crab', 'adjacent:', '  cove', '', '# entity crab', 'title: Giant Crab', 'examine: It sidles, and keeps one eye on you.', '', '# location cove', 'x: 1, y: 0'].join('\n');
  const SPANISH = ['# info island-es', 'version: 1.0.0', 'dependencies:', '  island', '', '# locale es', 'island.location.shore.title: Orilla', 'engine.travel.to: Viaja a {destination}'].join('\n');

  const played = (language: string, ...extra: ModuleSource[]): PlayView => {
    const session = startSession(loadUniverse([engineLocale(), { name: 'island', text: ISLAND }, ...extra]), language);
    readRoom(session);
    return view(session);
  };

  it('plays the language the module declared with the text the module authored', () => {
    const v = played('en');

    expect(v.location.title).toBe('Shore');
    expect(v.location.description).toBe('Shingle and a drawn-up boat.');
    expect(v.entities[0].title).toBe('Giant Crab');
    expect(v.choices.map((choice) => choice.label)).toContain('Travel to Cove');
  });

  it('shows the key for every string the played language has no entry for', () => {
    const v = played('es');

    expect(v.location.title).toBe('island.location.shore.title');
    expect(v.location.description).toBe('island.location.shore.examine');
    expect(v.entities[0].title).toBe('island.entity.crab.title');
    expect(v.choices.map((choice) => choice.label)).toContain('engine.travel.to');
    expect(v.choices.map((choice) => choice.label)).toContain('action.examine.examine');
  });

  it('shows what the locale does translate, and the key for what it does not', () => {
    const v = played('es', { name: 'island-es', text: SPANISH });

    expect(v.location.title).toBe('Orilla');
    expect(v.location.description).toBe('island.location.shore.examine');
    expect(v.choices.map((choice) => choice.label)).toContain('Viaja a island.location.cove.title');
  });

  it('never renders the module’s own language to a player of another one', () => {
    const spanishModule = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location orilla', 'x: 0, y: 0', 'starting', '', '# entity rata-gigante', 'title: Rata Gigante'].join('\n');
    const v = view(startSession(loadUniverse([engineLocale(), { name: 'isla', text: spanishModule }]), 'en'));

    expect(v.location.title).toBe('isla.location.orilla.title');
    expect(view(startSession(loadUniverse([engineLocale(), { name: 'isla', text: spanishModule }]), 'es')).location.title).toBe('isla.location.orilla.title');
  });

  it('leaves a readable screen when no locale file loaded at all', () => {
    const v = view(startSession(loadUniverse([{ name: 'island', text: ISLAND }]), 'en'));

    expect(v.location.title).toBe('Shore');
    expect(v.choices.map((choice) => choice.label)).toEqual(['Examine', 'engine.travel.to']);
  });

  it('shows the key on what a refused growth says, and the translation where a locale supplies one', () => {
    const ISLA = ['# info isla', 'version: 1.0.0', 'language: es', '', '# location playa', 'x: 0, y: 0', 'starting', '', '# item cuerda-larga', 'slot: hand', 'item-level: 1', '', '# item miga'].join('\n');
    const saidOnRefusal = (...extra: ModuleSource[]): string[] => {
      const registry = loadUniverse([engineLocale(), { name: 'isla', text: ISLA }, ...extra]);
      registry.saves.set('carried', { version: SAVE_VERSION, diff: { inventory: { 'isla.miga': 2 } } });
      const session = startSession(registry, 'es');
      applyDirective(session, { kind: 'load', save: 'carried' });
      applyDirective(session, { kind: 'allocate', target: 'isla.cuerda-larga', node: { hex: { q: 0, r: 0 }, kind: 'slot', direction: 'e' } });
      return view(session).said;
    };

    expect(saidOnRefusal()).toEqual(['engine.growth.not-a-base']);
    expect(saidOnRefusal({ name: 'isla-es', text: ['# info isla-es', 'version: 1.0.0', 'dependencies:', '  isla', '', '# locale es', 'isla.item.cuerda-larga.title: Cuerda Larga', 'engine.growth.not-a-base: {item} no es una base'].join('\n') })).toEqual(['isla.cuerda-larga no es una base']);
  });
});

describe('a craft is one string with one key', () => {
  const KITCHEN = ['# info kitchen', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting', '', '# item flour', '', '# item bread', '', '# recipe bread', 'in: flour', 'out: bread', 'time: 4'].join('\n');
  const SPANISH = ['# info kitchen-es', 'version: 1.0.0', 'dependencies:', '  kitchen', '', '# locale es', 'engine.craft.label: Prepara {recipe}', 'kitchen.recipe.bread.title: Pan'].join('\n');

  const cooking = (language: string): PlayView => {
    const registry = loadUniverse([engineLocale(), { name: 'kitchen', text: KITCHEN }, { name: 'kitchen-es', text: SPANISH }]);
    registry.saves.set('stocked', { version: SAVE_VERSION, diff: { inventory: { 'kitchen.flour': 2 } } });
    const session = startSession(registry, language);
    applyDirective(session, { kind: 'load', save: 'stocked' });
    return beginAction(session, 'craft:kitchen.bread');
  };

  it('labels the offer and the action under way with the same words', () => {
    expect(cooking('en').action?.label).toBe('Craft Bread');
    expect(cooking('es').action?.label).toBe('Prepara Pan');
  });

  it('offers it under those words too, so one translation moves both', () => {
    const registry = loadUniverse([engineLocale(), { name: 'kitchen', text: KITCHEN }, { name: 'kitchen-es', text: SPANISH }]);
    registry.saves.set('stocked', { version: SAVE_VERSION, diff: { inventory: { 'kitchen.flour': 2 } } });
    const session = startSession(registry, 'es');
    applyDirective(session, { kind: 'load', save: 'stocked' });

    expect(view(session).choices.map((choice) => choice.label)).toContain('Prepara Pan');
  });
});

const aCopyOf = (template: string, jewel: string | null): Record<string, unknown> => ({
  kind: 'item',
  template,
  payload: { roll: 0.5, plane: { '0,0': { jewel, entry: null, roll: 0.5, allocatedPositions: [], allocatedSlots: [], effects: [] } } },
});

const oneCopy = (template: string, jewel: string | null): Record<string, unknown> => ({ instances: { next: 2, byId: { '1': aCopyOf(template, jewel) } } });

describe('every screen a title reaches is played in one language', () => {
  const FORGE = ['# info forge', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting', '', '# cluster-jewel core', 'shape: point', 'open-connections: e', '', '# item blade', 'title: Blade', 'slot: mainhand', 'item-level: 1', 'origin-cluster: core'].join('\n');
  const FORGE_ES = ['# info forge-es', 'version: 1.0.0', 'dependencies:', '  forge', '', '# locale es', 'forge.item.blade.title: Espada'].join('\n');

  const carrying = (language: string): PlayView => {
    const registry = loadUniverse([engineLocale(), { name: 'forge', text: FORGE }, { name: 'forge-es', text: FORGE_ES }]);
    registry.saves.set('armed', { version: SAVE_VERSION, diff: oneCopy('forge.blade', 'forge.core') as never });
    const session = startSession(registry, language);
    applyDirective(session, { kind: 'load', save: 'armed' });
    return view(session);
  };

  it('names what the player carries in the language being played', () => {
    expect(carrying('en').carried.map((entry) => entry.name)).toEqual(['Blade']);
    expect(carrying('es').carried.map((entry) => entry.name)).toEqual(['Espada']);
  });

  it('names the plane that copy carries the same way, and every title it reports', () => {
    expect(carrying('en').planes.map((plane) => [plane.title, plane.clusters[0].title])).toEqual([['Blade', 'Core']]);
    expect(carrying('es').planes.map((plane) => [plane.title, plane.clusters[0].title])).toEqual([['Espada', 'forge.cluster-jewel.core.title']]);
  });

  it('shows the key on those screens too where the played language has none', () => {
    expect(carrying('fr').planes.map((plane) => plane.title)).toEqual(['forge.item.blade.title']);
  });
});

describe('a modal names what it is about in the language being played', () => {
  const FORGE = ['# info forge', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting', '', '# cluster-jewel core', 'shape: point', 'open-connections: e', '', '# item blade', 'title: Blade', 'slot: mainhand', 'item-level: 1', 'origin-cluster: core'].join('\n');
  const FORGE_ES = ['# info forge-es', 'version: 1.0.0', 'dependencies:', '  forge', '', '# locale es', 'forge.item.blade.title: Espada', 'engine.plane.heading: {plane} en {hex}', 'engine.modal.item: Objeto'].join('\n');

  const carrying = (language: string): PlaySession => {
    const registry = loadUniverse([engineLocale(), { name: 'forge', text: FORGE }, { name: 'forge-es', text: FORGE_ES }]);
    registry.saves.set('armed', { version: SAVE_VERSION, diff: oneCopy('forge.blade', 'forge.core') as never });
    const session = startSession(registry, language);
    applyDirective(session, { kind: 'load', save: 'armed' });
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
    return session;
  };

  const grown = (language: string): PlayView => {
    const session = carrying(language);
    submitModal(session, { item: view(session).modals[0].options[0].values![0].value });
    return submitModal(session, { verb: 'grow' });
  };

  it('labels the carried screen in it', () => {
    expect(view(carrying('en')).modals[0].options[0].label).toBe('Item');
    expect(view(carrying('es')).modals[0].options[0].label).toBe('Objeto');
  });

  it('heads the plane screen with the copy it is of, named in it', () => {
    expect(grown('en').modals[0].options[0].label).toBe('Blade at 0,0');
    expect(grown('es').modals[0].options[0].label).toBe('Espada en 0,0');
  });
});

describe('an answer is spelled once and read in the language being played', () => {
  const FORGE = ['# info forge', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting', 'entities:', '  smith', '', '# item blade', 'title: Blade', 'slot: mainhand', '', '# flag greeted', '', '# entity smith', 'title: Smith', '', '# dialogue smith', 'owner = smith', 'node greeting:', '  when: not greeted', '  say: Well met.', '  -> Ask the way.', '  -> Say nothing.'].join('\n');
  const FORGE_ES = ['# info forge-es', 'version: 1.0.0', 'dependencies:', '  forge', '', '# locale es', 'forge.item.blade.title: Espada', 'engine.carried.stack: {item} x{count}', 'forge.dialogue.smith.greeting.choice.0: Pregunta el camino.'].join('\n');

  const carried = (language: string): PlaySession => {
    const registry = loadUniverse([engineLocale(), { name: 'forge', text: FORGE }, { name: 'forge-es', text: FORGE_ES }]);
    registry.saves.set('armed', { version: SAVE_VERSION, diff: { inventory: { 'forge.blade': 1 } } });
    const session = startSession(registry, language);
    applyDirective(session, { kind: 'load', save: 'armed' });
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
    return session;
  };

  const offered = (session: PlaySession) => view(session).modals[0].options[0].values!;

  it('reads a carried row in the played language and answers it in the base one', () => {
    expect(offered(carried('es')).map((choice) => choice.shown)).toEqual(['Espada x1', 'engine.carried.close']);
    expect(offered(carried('en')).map((choice) => choice.shown)).toEqual(['Blade x1', 'Close']);
    expect(offered(carried('es')).map((choice) => choice.value)).toEqual(offered(carried('en')).map((choice) => choice.value));
  });

  it('takes the answer a session in another language recorded, because the answer did not move', () => {
    const spanish = carried('es');

    expect(() => submitModal(spanish, { item: 'forge.blade' })).not.toThrow();
    expect(view(spanish).modals[0].options.map((option) => option.key)).toEqual(['verb']);
  });

  it('reads a dialogue menu in the played language, and shows the key for the choice nobody translated (c6)', () => {
    const registry = loadUniverse([engineLocale(), { name: 'forge', text: FORGE }, { name: 'forge-es', text: FORGE_ES }]);
    const spanish = startSession(registry, 'es');
    applyDirective(spanish, { kind: 'talk', entity: 'forge.smith' });
    const menu = view(spanish).modals[0].options[0].values!;

    expect(menu.map((choice) => choice.shown)).toEqual(['Pregunta el camino.', 'forge.dialogue.smith.greeting.choice.1']);
    expect(menu.map((choice) => choice.value)).toEqual(['0', '1']);
  });
});

describe('a modal answer is spelled in the base language on every screen, and only the words move', () => {
  const FORGE = [
    '# info forge',
    'version: 1.0.0',
    '',
    '# location camp',
    'x: 0, y: 0',
    'starting',
    '',
    '# stat attack',
    'base: 4',
    '',
    '# passive keen',
    '+4 attack',
    '',
    '# cluster-jewel core',
    'shape: point',
    'open-connections: e, ne',
    'passives: 1 keen',
    '',
    '# item blade',
    'title: Blade',
    'slot: mainhand',
    'item-level: 20',
    'origin-cluster: core',
    '',
    '# race human',
    '',
    '# race elf',
    '',
    '# race dwarf',
    '',
    '# race orc',
  ].join('\n');
  const FORGE_ES = [
    '# info forge-es',
    'version: 1.0.0',
    'dependencies:',
    '  forge',
    '',
    '# locale es',
    'engine.carried.verb.grow: Cultiva',
    'forge.race.elf.title: Elfo',
    'engine.plane.allocate.slot: asigna: ranura {direction}',
  ].join('\n');

  const opened = (language: string): PlaySession => {
    const registry = loadUniverse([engineLocale(), { name: 'forge', text: FORGE }, { name: 'forge-es', text: FORGE_ES }]);
    registry.saves.set('armed', { version: SAVE_VERSION, diff: oneCopy('forge.blade', 'forge.core') as never });
    const session = startSession(registry, language);
    applyDirective(session, { kind: 'load', save: 'armed' });
    return session;
  };

  const choices = (session: PlaySession): readonly ModalChoice[] => {
    const options = view(session).modals[0].options;
    return options[options.length - 1].values!;
  };

  const races = (language: string): readonly ModalChoice[] => {
    const session = opened(language);
    applyDirective(session, { kind: 'open-modal', modal: 'choose-race' });
    return choices(session);
  };

  const verbs = (language: string): readonly ModalChoice[] => {
    const session = opened(language);
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
    submitModal(session, { item: choices(session)[0]!.value });
    return choices(session);
  };

  const moves = (language: string): readonly ModalChoice[] => {
    const session = opened(language);
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
    submitModal(session, { item: choices(session)[0]!.value });
    submitModal(session, { verb: 'grow' });
    return choices(session);
  };

  const answers = (offered: readonly ModalChoice[]): string[] => offered.map((choice) => choice.value);
  const words = (offered: readonly ModalChoice[]): string[] => offered.map((choice) => choice.shown);

  it('offers the same answers in every language, on every screen', () => {
    expect(answers(races('es'))).toEqual(answers(races('en')));
    expect(answers(verbs('es'))).toEqual(answers(verbs('en')));
    expect(answers(moves('es'))).toEqual(answers(moves('en')));
    expect(answers(moves('en'))).toContain('allocate: slot e');
  });

  it('reads them as the words the engine says in the played language', () => {
    expect(words(races('en'))).toEqual(['Human', 'Elf', 'Dwarf', 'Orc']);
    expect(words(verbs('en'))).toEqual(['Skill Tree', 'Equip', 'Destroy', 'Close']);
    expect(words(moves('en'))).toContain('allocate: slot e');
  });

  it('shows the key for every word the played language has no entry for', () => {
    expect(words(races('es'))).toEqual(['forge.race.human.title', 'Elfo', 'forge.race.dwarf.title', 'forge.race.orc.title']);
    expect(words(verbs('es'))).toEqual(['Cultiva', 'engine.carried.verb.equip', 'engine.carried.verb.destroy', 'engine.carried.close']);
    expect(words(moves('es'))).toContain('asigna: ranura e');
    expect(words(moves('es'))).toContain('engine.plane.back');
  });
});

describe('a use: choice id and a use: directive are one shape', () => {
  const useChoices = (v: PlayView) => v.choices.filter((choice) => choice.kind === 'action' && choice.id.startsWith('use:'));

  it('offers no action choice the directive parser cannot read back', () => {
    const session = startSession(tutorial());
    const offered = useChoices(view(session));

    expect(offered.length).toBeGreaterThan(0);
    for (const choice of offered) {
      const directive = choiceToDirective(choice) as UseDirective;
      expect(directive.kind).toBe('use');
      expect(useChoiceId(directive)).toBe(choice.id);
    }
  });

  it('prints a line the parser reads back as the directive the choice was', () => {
    const session = startSession(tutorial());

    for (const choice of useChoices(view(session))) {
      const directive = choiceToDirective(choice);
      expect(parseDirectiveLine(printDirective(directive))).toEqual(directive);
    }
  });
});

describe('an entity puts the offer it mints second', () => {
  interface Group {
    at: string;
    entity: string;
    offers: PlayChoice[];
    minted: string | undefined;
  }

  const world = (): Registry => loadUniverse(withEngineLocale(fixtureSources()));

  function groups(registry: Registry): Group[] {
    const found: Group[] = [];
    for (const location of registry.locations.values()) {
      const session = startSession(registry);
      applyDirective(session, { kind: 'goto', location: location.id });
      readRoom(session);
      const status = sessionStatus(session);
      if (status.location.id !== location.id) continue;
      for (const standing of status.entities) {
        const minted = registry.entities.get(standing.id)?.actions.find(isMintedAction);
        found.push({
          at: location.id,
          entity: standing.id,
          offers: status.choices.filter((choice) => choice.of === `entity.${standing.id}`),
          minted: minted && useChoiceId({ kind: 'use', obj: 'entity', objId: standing.id, actionId: actionAddress(minted) }),
        });
      }
    }
    return found;
  }

  const speaking = (registry: Registry): Group[] => groups(registry).filter((group) => group.minted !== undefined && group.offers.length > 1);

  it('offers examine second wherever the entity offers anything else', () => {
    const subjects = speaking(world());
    expect(subjects.length).toBeGreaterThan(0);

    for (const group of subjects) {
      const at = `${group.at} / ${group.entity}: ${group.offers.map((offer) => String(offer.label)).join(' | ')}`;
      expect(group.offers.map((offer) => offer.id).indexOf(group.minted!), at).toBe(1);
    }
  });

  it('holds over something fought as well as something only acted on', () => {
    const registry = world();
    const subjects = speaking(registry);
    const fought = subjects.filter((group) => Object.keys(registry.entities.get(group.entity)!.stats).length > 0);

    expect(fought.length).toBeGreaterThan(0);
    expect(subjects.length).toBeGreaterThan(fought.length);
    for (const group of fought) expect(group.offers.map((offer) => offer.id).indexOf(group.minted!), `${group.at} / ${group.entity}`).toBe(1);
  });
});

const OFFERED_WHEN = actionLinesWritten()
  .filter((line) => line.family === 'offered when')
  .map((line) => line.form.slice(0, line.form.indexOf(':')));

const GATED = (field: string, condition: string): string =>
  FIXTURE_WORLD +
  `
# location camp
entities:
  thing

# entity thing
title: Thing
poke:
  instant
  ${field}: ${condition}
  say: The thing is poked.
`;

const STANDS = 'time < 100';
const FAILS = 'time > 100';
const POKE = 'use:entity.thing.poke';
const POKED = 'The thing is poked.';

describe('what takes an action off the list', () => {
  const gated = (field: string, condition: string): PlaySession => startSession(loadInEnglish(GATED(field, condition)));
  const offers = (field: string, condition: string): boolean => ids(view(gated(field, condition))).includes(POKE);

  it('is `hidden if:` and nothing else, over every gate the grammar declares', () => {
    expect(OFFERED_WHEN.length).toBeGreaterThan(1);
    expect(OFFERED_WHEN.filter((field) => offers(field, STANDS) !== offers(field, FAILS))).toEqual(['hidden if']);
  });

  it('leaves every other gate offered in both worlds, and refuses it in the one where it bites', () => {
    const others = OFFERED_WHEN.filter((field) => field !== 'hidden if');
    expect(others.length).toBeGreaterThan(0);

    for (const field of others) {
      const taken = [STANDS, FAILS].map((condition) => {
        const session = gated(field, condition);
        expect(ids(view(session)), `${field}: ${condition}`).toContain(POKE);
        return apply(session, POKE).said.map(String);
      });
      const refused = taken.filter((said) => !said.includes(POKED));
      expect(taken.filter((said) => said.includes(POKED)), field).toHaveLength(1);
      expect(refused, field).toHaveLength(1);
      expect(refused[0]!.join(' '), field).not.toBe('');
      expect(refused[0]!.join(' '), field).not.toContain('time');
    }
  });
});

const OVEN =
  FIXTURE_WORLD +
  `
# item raw-chestnut
title: Raw Chestnut
examine: Green in the husk.

# location camp
entities:
  oven

# entity oven
title: Oven
roast chestnuts:
  instant
  requires: has raw-chestnut
  say: A chestnut pops from the embers.

# entity shrine
title: Shrine
flags: blessed
pray:
  instant
  requires: blessed
  say: Nothing answers.

# entity altar
title: Altar
flags: blessed
kneel:
  instant
  requires: blessed
  say: Nothing answers.
  on refused:
    say: The stone is cold, and you are not ready for it.
`;

describe('the words an unmet requires: refuses in', () => {
  const kitchen = (): PlaySession => startSession(loadInEnglish(OVEN.replace('entities:\n  oven', 'entities:\n  oven\n  shrine\n  altar')));

  it('names the item the player is short of, by the title the world gives it', () => {
    expect(apply(kitchen(), 'use:entity.oven.roast-chestnuts').said.map(String)).toEqual(['You need Raw Chestnut for that.']);
  });

  it('says nothing about the condition where the condition is not an item', () => {
    expect(apply(kitchen(), 'use:entity.shrine.pray').said.map(String)).toEqual(['You cannot do that yet.']);
  });

  it('stands aside for an author who wrote `on refused:`', () => {
    expect(apply(kitchen(), 'use:entity.altar.kneel').said.map(String)).toEqual(['The stone is cold, and you are not ready for it.']);
  });

  it('leaves the world alone: a refused action arms nothing and takes no time', () => {
    const session = kitchen();
    const refused = apply(session, 'use:entity.oven.roast-chestnuts');
    expect(refused.action).toBeNull();
    expect(refused.time).toBe(0);
  });
});

const YARD =
  FIXTURE_WORLD +
  `
# stat dr

# resource health
max: max-health

# event death
resource: health
trigger: on empty

# action swing
title: swing
continuous
time: 1
damage: us.attack vs them.dr
depletes: them.health

# entity player
stats: max-health 30, attack 10
uses: swing

# entity scarecrow
title: Scarecrow
stats: max-health 1, dr 0
straighten:
  instant
  say: You set the scarecrow straight on its pole.

# flag paid

# entity gate-troll
title: Gate Troll
stats: max-health 1, dr 0
haggle:
  instant
  say: The troll names a price and waits.
cross:
  hidden if: not paid
  instant
  say: The troll stands aside.

# entity winch
title: Winch
crank:
  instant
  say: Something far off clunks and gives.

# entity straw-man
title: Straw Man
stats: max-health 1, dr 0

# location camp
entities: scarecrow

# location bridge
title: Bridge
x: 1, y: 0
adjacent: camp
entities: gate-troll
hoist:
  instant
  say: The gate grinds up.
`;

describe('a fight named on a foe that is not standing here', () => {
  const yard = (): PlaySession => startSession(loadInEnglish(YARD));

  const cleared = (): PlaySession => {
    const session = yard();
    applyDirective(session, { kind: 'use-on', action: 'swing', target: 'scarecrow' });
    applyDirective(session, { kind: 'wait-out', until: 'done' });
    return session;
  };

  const fightsOffered = (session: PlaySession): string[] => view(session).choices.filter((choice) => choice.id.startsWith('fight:')).map((choice) => choice.id);

  it('offers the fight while the foe stands, and stops offering it once it falls', () => {
    const session = yard();
    expect(fightsOffered(session)).toEqual(['fight:swing:scarecrow']);

    applyDirective(session, { kind: 'use-on', action: 'swing', target: 'scarecrow' });
    applyDirective(session, { kind: 'wait-out', until: 'done' });
    expect(fightsOffered(session)).toEqual([]);
  });

  it('refuses a directive that names the felled foe, in the words a player reads', () => {
    const session = cleared();
    view(session);
    applyDirective(session, { kind: 'use-on', action: 'swing', target: 'scarecrow' });

    expect(view(session).said.map(String)).toEqual(['There is no Scarecrow here.']);
  });

  it('refuses one standing in another room by the same words', () => {
    const session = yard();
    view(session);
    applyDirective(session, { kind: 'use-on', action: 'swing', target: 'gate-troll' });

    expect(view(session).said.map(String)).toEqual(['There is no Gate Troll here.']);
  });

  it('leaves the world alone: it arms nothing and spends no time', () => {
    const session = cleared();
    const before = view(session).time;
    applyDirective(session, { kind: 'use-on', action: 'swing', target: 'scarecrow' });

    const after = view(session);
    expect(after.action).toBeNull();
    expect(after.time).toBe(before);
  });
});

describe('an entity action named on an entity that is not standing here', () => {
  const yard = (): PlaySession => startSession(loadInEnglish(YARD));

  const use = (session: PlaySession, entity: string, action: string): PlayView => {
    view(session);
    applyDirective(session, { kind: 'use', obj: 'entity', objId: entity, actionId: action });
    return view(session);
  };

  const offered = (session: PlaySession): string[] => view(session).choices.filter((choice) => choice.id.startsWith('use:entity.')).map((choice) => choice.id);

  it('offers it while the entity stands, and stops offering it once the entity falls', () => {
    const session = yard();
    expect(offered(session)).toContain('use:entity.scarecrow.straighten');

    applyDirective(session, { kind: 'use-on', action: 'swing', target: 'scarecrow' });
    applyDirective(session, { kind: 'wait-out', until: 'done' });
    expect(offered(session)).toEqual([]);
  });

  it('refuses a directive that names the felled entity, in the words a player reads', () => {
    const session = yard();
    applyDirective(session, { kind: 'use-on', action: 'swing', target: 'scarecrow' });
    applyDirective(session, { kind: 'wait-out', until: 'done' });

    expect(use(session, 'scarecrow', 'straighten').said.map(String)).toEqual(['There is no Scarecrow here.']);
  });

  it('refuses one standing in another room by the same words', () => {
    expect(use(yard(), 'gate-troll', 'haggle').said.map(String)).toEqual(['There is no Gate Troll here.']);
  });

  it('leaves the world alone: it arms nothing and spends no time', () => {
    const session = yard();
    const before = view(session).time;
    const after = use(session, 'gate-troll', 'haggle');

    expect(after.action).toBeNull();
    expect(after.time).toBe(before);
  });

  it('says nothing about where an entity no room stands is, and does what it was asked', () => {
    expect(use(yard(), 'winch', 'crank').said.map(String)).toEqual(['Something far off clunks and gives.']);
  });

  it('refuses a hidden action of an entity in another room in the player words, rather than raising', () => {
    expect(use(yard(), 'gate-troll', 'cross').said.map(String)).toEqual(['There is no Gate Troll here.']);
  });

  it('raises for the same hidden action once the player is standing where the entity stands', () => {
    const session = yard();
    applyDirective(session, { kind: 'travel', location: 'bridge' });
    applyDirective(session, { kind: 'wait-out', until: 'done' });
    expect(() => applyDirective(session, { kind: 'use', obj: 'entity', objId: 'gate-troll', actionId: 'cross' })).toThrow(/action hidden/);
  });
});

describe('an action named on a room the player is not standing in', () => {
  const yard = (): PlaySession => startSession(loadInEnglish(YARD));

  const raise = (session: PlaySession, room: string): PlayView => {
    view(session);
    applyDirective(session, { kind: 'use', obj: 'location', objId: room, actionId: 'hoist' });
    return view(session);
  };

  it('refuses it in the words a player reads, and arms nothing', () => {
    const session = yard();
    const before = view(session).time;
    const after = raise(session, 'bridge');

    expect(after.said.map(String)).toEqual(['There is no Bridge here.']);
    expect(after.action).toBeNull();
    expect(after.time).toBe(before);
  });

  it('takes once the player is standing there, which is what makes the refusal about where they are', () => {
    const session = yard();
    applyDirective(session, { kind: 'travel', location: 'bridge' });
    applyDirective(session, { kind: 'wait-out', until: 'done' });
    expect(raise(session, 'bridge').said.map(String)).toContain('The gate grinds up.');
  });
});

describe('a fight named on a foe no room stands', () => {
  it('goes on once the clock moves, rather than stopping the moment it is asked to run', () => {
    const session = startSession(loadInEnglish(YARD));
    applyDirective(session, { kind: 'use-on', action: 'swing', target: 'straw-man' });
    expect(view(session).action).not.toBeNull();

    const before = view(session).time;
    applyDirective(session, { kind: 'wait-out', until: 'done' });
    expect(view(session).time).toBeGreaterThan(before);
  });
});

describe('every entity the shipped world places, named by a directive from a room that does not stand it', () => {
  const registry = loadUniverse(fixtureSources());
  const placed = entitiesStood(registry.locations);
  const rooms = [...registry.locations.values()];
  const away = (entityId: string): string => rooms.find((room) => !room.entities.some((entry) => entry.entity === entityId))!.id;

  const armedFrom = (entityId: string, action: Action, locationId: string): { armed: boolean; said: string } | undefined => {
    const state = initialState(registry);
    state.location = locationId;
    try {
      const armed = armAction('entity', entityId, actionAddress(action), registry, state).armed;
      return { armed, said: state.log.length === 0 ? '' : String(state.log[state.log.length - 1]) };
    } catch {
      return undefined;
    }
  };

  const doors = [...placed.keys()].flatMap((entityId) => (registry.entities.get(entityId)?.actions ?? []).map((action) => ({ entityId, action })));

  it('arms nothing, and says there is no such thing here', () => {
    const armed: string[] = [];
    const unsaid: string[] = [];
    const told: string[] = [];
    const hidden: string[] = [];
    for (const { entityId, action } of doors) {
      const written = `${entityId}.${actionAddress(action)}`;
      const attempt = armedFrom(entityId, action, away(entityId));
      if (attempt === undefined) hidden.push(written);
      else if (attempt.armed) armed.push(written);
      else if (action.onRefused || /^There is no .+ here\.$/.test(attempt.said)) told.push(written);
      else unsaid.push(`${written}: ${attempt.said}`);
    }
    expect(armed).toEqual([]);
    expect(unsaid).toEqual([]);
    expect(hidden, 'a door `hidden if:` from the far room is still a door the player cannot see from here, and is told so').toEqual([]);
    expect(told.length).toBe(doors.length);
  });

  it('arms just the same for an entity no room stands anywhere, which is what a directive-only lever is', () => {
    const nowhere = [...registry.entities.keys()].filter((entityId) => !placed.has(entityId));
    const refused: string[] = [];

    expect(nowhere.length).toBeGreaterThan(0);
    for (const entityId of nowhere) {
      for (const action of registry.entities.get(entityId)!.actions) {
        const attempt = armedFrom(entityId, action, rooms[0]!.id);
        if (attempt && !attempt.armed && attempt.said.startsWith('There is no ')) refused.push(`${entityId}.${actionAddress(action)}: ${attempt.said}`);
      }
    }
    expect(refused).toEqual([]);
  });
});

const A_ROW = `
# variable travel-seconds
value: 1

# location near-gate
x: 0, y: 0
starting
title: Near Gate
adjacent:
  middle-yard

# location middle-yard
x: 1, y: 0
title: Middle Yard
adjacent:
  near-gate
  far-well

# location far-well
x: 2, y: 0
title: Far Well
adjacent:
  middle-yard
`;

describe('what a page of offers draws, and what belongs to the map', () => {
  const backAtTheGate = (): PlaySession => {
    const session = startSession(loadInEnglish(A_ROW));
    apply(session, 'travel:middle-yard');
    apply(session, 'travel:near-gate');
    return session;
  };

  const travels = (choices: readonly { id: string }[]): string[] => choices.map((choice) => choice.id).filter((id) => id.startsWith('travel:'));

  it('keeps every place a road reaches answerable, however far off it is', () => {
    const status = sessionStatus(backAtTheGate());

    expect(travels(status.choices)).toEqual(['travel:middle-yard', 'travel:far-well']);
    expect(status.choices.find((choice) => choice.id === 'travel:far-well')?.legs).toBe(2);
  });

  it('offers the page here and the one step out of it, and leaves the rest to the map', () => {
    const status = sessionStatus(backAtTheGate());

    expect(travels(sheetOffers(status))).toEqual(['travel:middle-yard']);
  });

  it('carries the answer a filtered offer is still taken by, since counting a shorter list would lose it', () => {
    const status = sessionStatus(backAtTheGate());

    for (const offer of sheetOffers(status)) expect(status.choices[offer.position - 1]!.id, offer.id).toBe(offer.id);
  });
});

describe('runTest: an until block goes round its lines', () => {
  const module =
    FIXTURE_WORLD +
    `
# stat regeneration

# resource health
max: max-health
rate: regeneration

# event death
resource: health
trigger: on empty

# location camp
entities:
  oven

# item roasted-chestnut
examine: Split and steaming.

# stat nimble
base: 0

# stat guard
base: 1000

# entity oven
stats: guard 1000
roast:
  time: 4
  give: 1 roasted-chestnut
scald:
  time: 1
  drain: 100 health
pilfer:
  time: 1
  attempts: 1
  accuracy: us.nimble vs them.guard
  on success:
    give: 1 roasted-chestnut

# entity player
on death:
  restore: health
  stop

# test five-pilfers-sure
travel: camp
succeed-checks
until 5 times:
  use: entity.oven.pilfer until done
assert: inventory.roasted-chestnut = 5

# test five-pilfers-thumbed
travel: camp
fail-checks
until 5 times:
  use: entity.oven.pilfer until done
assert: inventory.roasted-chestnut = 0

# test three-chestnuts
travel: camp
until inventory.roasted-chestnut >= 3:
  use: entity.oven.roast until done
assert: inventory.roasted-chestnut = 3

# test twice-round
travel: camp
until 2 times:
  use: entity.oven.roast until done
assert: inventory.roasted-chestnut = 2

# test a-death-ends-the-pass
travel: camp
until inventory.roasted-chestnut >= 2:
  use: entity.oven.scald until done
  use: entity.oven.roast until done

# test a-pass-that-moves-nothing
travel: camp
until inventory.roasted-chestnut >= 1:
  assert: not has roasted-chestnut

# test the-failing-pass-is-named
travel: camp
until inventory.roasted-chestnut >= 3:
  use: entity.oven.roast until done
  assert: inventory.roasted-chestnut < 2
`;

  it('stops the moment the condition holds, or after the passes asked for', () => {
    const registry = loadInEnglish(module);
    expect(runTest('three-chestnuts', registry, createGameState())).toEqual({ passed: true });
    expect(runTest('twice-round', registry, createGameState())).toEqual({ passed: true });
  });

  it('lets a death end the pass rather than the route, so the next pass starts where the world put the player', () => {
    const registry = loadInEnglish(module);
    const state = createGameState();
    expect(runTest('a-death-ends-the-pass', registry, state)).toEqual({ passed: true });
    expect(state.inventory['roasted-chestnut']).toBe(2);
  });

  it('settles an action\'s accuracy roll the way succeed-checks and fail-checks say, since a roll the player is weighed by is a contest', () => {
    const registry = loadInEnglish(module);
    expect(runTest('five-pilfers-sure', registry, createGameState())).toEqual({ passed: true });
    expect(runTest('five-pilfers-thumbed', registry, createGameState())).toEqual({ passed: true });
  });

  it('tallies what the player\'s pools lost along the way, capped at what each held, whatever restored them after', () => {
    const registry = loadInEnglish(module);
    const state = createGameState();
    runTest('a-death-ends-the-pass', registry, state);
    const [pool, full] = Object.entries(state.resources)[0]!;
    expect(full).toBeGreaterThan(0);
    expect(state.spent[pool]).toBe(2 * full);
  });

  it('refuses a pass that leaves the world as it found it, in the engine\'s own words', () => {
    const registry = loadInEnglish(module);
    const state = createGameState();
    const { failure } = runTest('a-pass-that-moves-nothing', registry, state);
    expect(failure).toContain(localizerFor(registry, BASE_LANGUAGE).engine('engine.stopped.round'));
  });

  it('names the pass a failing line was on', () => {
    const registry = loadInEnglish(module);
    const { failure } = runTest('the-failing-pass-is-named', registry, createGameState());
    expect(failure).toMatch(/^until inventory\.roasted-chestnut >= 3: — pass 2: /);
  });
});
