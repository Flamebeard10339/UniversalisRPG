import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { createGameState, GameState, travelSecondsPerUnit } from './runtime';
import { loadModule, Registry } from '../content/registry';
import { SaveDiff, SAVE_VERSION } from './save';
import { secondsToMs } from './units';
import { apply, applyDirective, beginAction, cancelAction, PlaySession, PlayView, runTest, SAID_HEAD_KEPT, SAID_TAIL_KEPT, sessionStatus, startSession, submitModal, view, wait } from './session';

const source = readFileSync('content/tutorial-island.dsl', 'utf8');

// A save is how a session starts anywhere but the beginning, so it is how a
// test stocks one too.
function primed(registry: Registry, diff: SaveDiff): PlaySession {
  registry.saves.set('primed', { version: SAVE_VERSION, diff });
  const session = startSession(registry);
  applyDirective(session, { kind: 'load', save: 'primed' });
  return session;
}

function ids(v: PlayView): string[] {
  return v.choices.map((c) => c.id);
}

function modalNames(v: PlayView): string[] {
  return v.modals.map((modal) => modal.name);
}

describe('session', () => {
  // Not a second copy of the `# test` that walks the same route: that one
  // asserts flags and an end-state save, this one asserts the choice-list API
  // around them — which ids are offered and withdrawn, `inDialogue`, the
  // encounter readout, `said` — none of which a `# test` directive can reach.
  it('drives the tutorial-island miki route through the choice-list API', () => {
    const registry = loadModule(source);
    const session = startSession(registry);

    let v = view(session);
    expect(v.location.id).toBe('tutorial-island.guide-house');
    expect(v.said).toEqual([]);
    expect(ids(v)).toContain('talk:tutorial-island.miki');
    expect(ids(v)).not.toContain('use:entity.tutorial-island.front-door.pick lock');

    v = apply(session, 'talk:tutorial-island.miki');
    expect(modalNames(v)).toEqual(['dialogue']);
    // The menu arrives as the one option of a dialogue modal, not as a
    // second kind of choice sitting beside the world's.
    expect(v.choices).toEqual([]);
    const menu = v.modals[0].options[0];
    expect(menu.key).toBe('choice');
    expect(menu.values).toHaveLength(2);

    v = submitModal(session, { choice: menu.values![0] });
    expect(modalNames(v)).toEqual([]);
    expect(v.flags['tutorial-island.quest-given']).toBe(true);

    v = apply(session, 'use:entity.tutorial-island.mirror.look in');
    expect(v.said).toContain('modal:character-creation');
    expect(v.flags['tutorial-island.mirror-done']).toBe(true);
    // A modal sits atop the world, so nothing in the room is offered until it
    // is answered — and it takes two answers to be done with.
    expect(v.choices).toEqual([]);
    v = submitModal(session, { name: 'Rowan' });
    expect(modalNames(v)).toEqual(['character-creation']);
    v = submitModal(session, { race: 'Elf' });
    expect(modalNames(v)).toEqual([]);
    expect(ids(v)).not.toContain('use:entity.tutorial-island.mirror.look in');

    v = apply(session, 'talk:tutorial-island.miki');
    expect(modalNames(v)).toEqual([]);
    expect(v.inventory['tutorial-island.jug-of-water']).toBe(1);
    expect(v.inventory['tutorial-island.pot-of-flour']).toBe(1);

    expect(ids(v)).toContain('craft:tutorial-island.dough');
    v = apply(session, 'craft:tutorial-island.dough');
    expect(v.inventory['tutorial-island.dough']).toBe(1);

    expect(ids(v)).toContain('craft:tutorial-island.bread');
    v = apply(session, 'craft:tutorial-island.bread');
    expect(v.inventory['tutorial-island.bread']).toBe(1);

    v = apply(session, 'use:entity.tutorial-island.stairs.ascend');
    expect(v.location.id).toBe('tutorial-island.guide-house-upstairs');
    expect(ids(v)).toContain('use:entity.tutorial-island.dresser.search drawer');

    v = apply(session, 'use:entity.tutorial-island.dresser.search drawer');
    expect(v.inventory['tutorial-island.lockpick']).toBe(1);

    v = apply(session, 'use:entity.tutorial-island.stairs-down.descend');
    expect(v.location.id).toBe('tutorial-island.guide-house');
    expect(ids(v)).toContain('use:entity.tutorial-island.front-door.pick lock');

    v = apply(session, 'talk:tutorial-island.miki');
    expect(modalNames(v)).toEqual([]);
    expect(v.flags['tutorial-island.made-bread']).toBe(true);

    v = apply(session, 'talk:tutorial-island.miki');
    expect(modalNames(v)).toEqual([]);
    expect(v.inventory['tutorial-island.iron-sword']).toBe(1);
    expect(v.inventory['tutorial-island.wooden-shield']).toBe(1);

    v = apply(session, 'use:entity.tutorial-island.stairs.descend');
    expect(v.location.id).toBe('tutorial-island.basement');
    expect(ids(v)).toContain('use:entity.tutorial-island.giant-rat.fight');

    // A real fight: one `use:` is one swing, so each rat needs the clock to run
    // on. 30s is far longer than the ~6s one actually lasts.
    for (let killed = 1; killed <= 3; killed++) {
      v = apply(session, 'use:entity.tutorial-island.giant-rat.fight');
      expect(v.encounter).not.toBeNull();
      expect(v.encounter!.foes.map((foe) => foe.title)).toEqual(['Giant Rat']);

      v = wait(session, 30);
      expect(v.flags['tutorial-island.rats-killed']).toBe(killed);
      expect(v.encounter).toBeNull(); // the fight is over, so is the readout
    }
    expect(ids(v)).not.toContain('use:entity.tutorial-island.giant-rat.fight');

    v = apply(session, 'use:entity.tutorial-island.stairs-up.ascend');
    expect(v.location.id).toBe('tutorial-island.guide-house');
    expect(ids(v)).not.toContain('travel:tutorial-island.beach');

    v = apply(session, 'talk:tutorial-island.miki');
    expect(modalNames(v)).toEqual([]);
    expect(v.flags['tutorial-island.miki-complete']).toBe(true);
    expect(v.flags['tutorial-island.front-door.unlocked']).toBe(true);

    v = view(session);
    expect(ids(v)).toContain('travel:tutorial-island.beach');

    v = apply(session, 'talk:tutorial-island.miki');
    expect(modalNames(v)).toEqual([]);
    expect(v.said).toContain("Still here? The boat to the mainland won't wait forever.");

    v = apply(session, 'travel:tutorial-island.beach');
    expect(v.location.id).toBe('tutorial-island.beach');

    // The route's mechanical sim-time: dough (2s) + bread (3s) + three rat
    // fights + the beach journey (1 unit east × the authored
    // travel-seconds-per-unit). Talking, the mirror and ascend/descend (instant
    // stairs actions) cost nothing. This doubles as a measured-playtime
    // invariant; the beach leg is derived from content so it tracks the authored
    // variable rather than a hardcoded pace.
    //
    // A rat costs the opening swing (60/25 = 2.4s) plus the 30s waited out above
    // — the loop above waits a fixed span rather than exactly as long as the
    // fight, so this measures the route as driven, not the fights themselves.
    const beachJourney = 1 * travelSecondsPerUnit(registry);
    const ratRound = 60 / 25 + 30;
    expect(v.time).toBeCloseTo(2 + 3 + 3 * ratRound + beachJourney, 9);
  });

  it('throws a clear error on an unavailable or unknown choice id', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    expect(() => apply(session, 'use:entity.tutorial-island.front-door.pick lock')).toThrow();
    expect(() => apply(session, 'travel:tutorial-island.beach')).toThrow();
    expect(() => apply(session, 'nonsense')).toThrow();
  });

  it('dispatches an item action through the choice-list API', () => {
    const module = `
# location camp
x: 0, y: 0
starting

# item bread
eat: take: 1 bread, say: You eat the bread.
`;
    const session = primed(loadModule(module), { inventory: { bread: 1 } });

    let v = view(session);
    expect(ids(v)).toContain('use:item.bread.eat');

    v = apply(session, 'use:item.bread.eat');
    expect(v.said).toContain('You eat the bread.');
    // Spent, so it is gone from what is published rather than held at zero.
    expect(v.inventory).toEqual({});
    expect(ids(v)).not.toContain('use:item.bread.eat');
  });

  it('publishes a modal from open modal:, and closes it on the answer that completes it', () => {
    const module = `
# location camp
x: 0, y: 0
starting
entities:
  mirror

# flag greeted

# entity mirror
look in: open modal: character-creation

# dialogue mirror-greeting
owner = mirror

node greeting:
  when: not greeted
  set: greeted
  There you are, {player.name}, {player.race}.
`;
    const registry = loadModule(module);
    const session = startSession(registry);

    let v = apply(session, 'use:entity.mirror.look in');
    expect(v.modals).toEqual([{ name: 'character-creation', options: [
      { key: 'name', label: 'Name', values: null },
      { key: 'race', label: 'Race', values: ['Human', 'Elf', 'Dwarf', 'Orc'] },
    ] }]);
    expect(v.player).toEqual({ name: '', race: '' });

    // Answered one option at a time: the modal stays up, publishing only what
    // is left, until the last answer lands.
    v = submitModal(session, { name: 'Rowan' });
    expect(v.modals[0].options.map((option) => option.key)).toEqual(['race']);
    expect(v.player).toEqual({ name: '', race: '' });

    v = submitModal(session, { race: 'Elf' });
    expect(v.modals).toEqual([]);
    expect(v.player).toEqual({ name: 'Rowan', race: 'Elf' });

    v = apply(session, 'talk:mirror');
    expect(v.said).toContain('There you are, Rowan, Elf.');
  });

  it('shows content-pruning warnings after loading a save with stale ids', () => {
    const registry = loadModule(`
# location camp
x: 0, y: 0
starting

# save stale
{"version":${SAVE_VERSION},"inventory":{"mod.gem":1}}
`);
    const session = startSession(registry);

    applyDirective(session, { kind: 'load', save: 'stale' });
    const v = view(session);

    expect(v.said).toEqual(['Removed inventory mod.gem because its item is not loaded.']);
    expect(v.inventory).toEqual({});
  });
});

describe('beginAction: arms a spannable action/craft instead of resolving it, but still completes an instant one', () => {
  const module = `
# location camp
x: 0, y: 0
starting
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
    const registry = loadModule(module);
    const session = startSession(registry);

    const v = beginAction(session, 'use:entity.oven.roast');
    expect(v.action).not.toBeNull();
    expect(v.action?.progress).toBe(0);
    expect(v.inventory['roasted-chestnut'] ?? 0).toBe(0);
    expect(v.time).toBe(0);
  });

  it('completes an instant item action (no time:) immediately, same as apply', () => {
    const session = primed(loadModule(module), { inventory: { bread: 1 } });

    const v = beginAction(session, 'use:item.bread.eat');
    expect(v.action).toBeNull();
    expect(v.inventory).toEqual({});
    expect(v.said).toContain('You eat the bread.');
  });

  it('leaves a spannable craft (time: 2) armed without resolving it', () => {
    const registry = loadModule(module);
    const session = startSession(registry);

    const v = beginAction(session, 'craft:dough');
    expect(v.action).not.toBeNull();
    expect(v.inventory.dough ?? 0).toBe(0);
    expect(v.time).toBe(0);
  });

  it('completes an instant craft (no time:) immediately, same as apply', () => {
    const registry = loadModule(module);
    const session = startSession(registry);

    const v = beginAction(session, 'craft:mix');
    expect(v.action).toBeNull();
    expect(v.inventory.mix).toBe(1);
  });

  it('throws on an unavailable or unknown choice id, same as apply', () => {
    const registry = loadModule(module);
    const session = startSession(registry);
    expect(() => beginAction(session, 'nonsense')).toThrow();
  });
});

describe('travel is a distance-timed journey', () => {
  // beach sits one unit east of camp, so a journey between them lasts
  // 1 × the authored travel-seconds-per-unit. A distinctive value (7, not the
  // engine default) proves the journey time is read from content, not baked in.
  const module = `
# variable travel-seconds-per-unit
value: 7

# location camp
x: 0, y: 0
starting
adjacent:
  beach

# location beach
east of camp
adjacent:
  camp
`;

  it('apply relocates instantly in real time while accruing the journey sim-time', () => {
    const registry = loadModule(module);
    const session = startSession(registry);
    const journey = 1 * travelSecondsPerUnit(registry);

    const v = apply(session, 'travel:beach');
    expect(v.location.id).toBe('beach');
    expect(v.time).toBe(journey);
    expect(v.action).toBeNull();
  });

  it('beginAction arms the journey spannably — location and time unchanged until driven', () => {
    const registry = loadModule(module);
    const session = startSession(registry);
    const journey = 1 * travelSecondsPerUnit(registry);

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
    const registry = loadModule(source);
    const session = startSession(registry);

    const choiceIds = ids(view(session));
    // The stairs entity relocates to both floors, so the duplicate vertical
    // travel edges are suppressed in favor of ascend/descend.
    expect(choiceIds).toContain('use:entity.tutorial-island.stairs.ascend');
    expect(choiceIds).toContain('use:entity.tutorial-island.stairs.descend');
    expect(choiceIds).not.toContain('travel:tutorial-island.basement');
    expect(choiceIds).not.toContain('travel:tutorial-island.guide-house-upstairs');
  });

  it('keeps an unaliased edge, and one whose relocate is not free (has a cost)', () => {
    const module = `
# location camp
x: 0, y: 0
starting
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
    const session = primed(loadModule(module), { inventory: { coin: 1 } });

    const choiceIds = ids(view(session));
    // gate.enter relocates to cave but costs a coin, so it is not a free alias —
    // the travel edge to cave stays; and nothing aliases summit.
    expect(choiceIds).toContain('travel:cave');
    expect(choiceIds).toContain('travel:summit');
  });
});

describe('cancelAction', () => {
  it('drops the action in flight, keeping units already completed and un-consumed inputs', () => {
    const session = primed(loadModule(source), { inventory: { 'tutorial-island.dough': 2 } }); // two loaves' worth

    beginAction(session, 'craft:tutorial-island.bread');
    const baked = wait(session, 4); // one full 3s bake done, a second one 1s in
    expect(baked.inventory['tutorial-island.bread']).toBe(1);
    expect(baked.action).not.toBeNull();

    const v = cancelAction(session);
    expect(v.action).toBeNull();
    expect(v.inventory['tutorial-island.bread']).toBe(1); // no partial credit for the aborted bake
    expect(v.inventory['tutorial-island.dough']).toBe(1); // its input was not consumed
    expect(v.choices.length).toBeGreaterThan(0); // back to ordinary choices
  });

  it('is a no-op when nothing is active', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    expect(() => cancelAction(session)).not.toThrow();
    expect(sessionStatus(session).action).toBeNull();
  });
});

describe('runTest: begin:/wait:/cancel directives', () => {
  const module = `
# location workshop
x: 0, y: 0
starting
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
travel: workshop
use: entity.oven.roast

# test roast-begin-then-wait
travel: workshop
begin: use entity.oven.roast
wait: 4

# test roast-begin-partial-cancel
travel: workshop
begin: use entity.oven.roast
wait: 2
cancel
`;

  it('begin: a repeating action then wait: to completion reproduces the same end state as an instant use:', () => {
    const registry = loadModule(module);

    const instantState = createGameState();
    expect(runTest('roast-instant', registry, instantState)).toEqual({ passed: true });

    const armedState = createGameState();
    expect(runTest('roast-begin-then-wait', registry, armedState)).toEqual({ passed: true });

    expect(armedState.time).toBe(instantState.time);
    expect(armedState.inventory).toEqual(instantState.inventory);
    expect(armedState.activeAction).toEqual(instantState.activeAction);
  });

  it('begin: + a partial wait: + cancel leaves the action stopped mid-flight', () => {
    const registry = loadModule(module);
    const state = createGameState();

    expect(runTest('roast-begin-partial-cancel', registry, state)).toEqual({ passed: true });

    expect(state.activeAction).toBeNull();
    expect(state.inventory['roasted-chestnut'] ?? 0).toBe(0);
    expect(state.time).toBe(secondsToMs(2));
  });
});

describe('runTest: a route that ends holding a modal has not been walked to its end', () => {
  const module = `
# location camp
x: 0, y: 0
starting
entities:
  mirror
  sage

# flag greeted

# entity mirror
look in: open modal: character-creation

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
use: entity.mirror.look in

# test half-answers-the-modal
travel: camp
use: entity.mirror.look in
submit-modal: name=Rowan

# test answers-the-modal
travel: camp
use: entity.mirror.look in
submit-modal: name=Rowan
submit-modal: race=Elf

# test leaves-a-dialogue-open
travel: camp
talk: sage

# test answers-the-dialogue-as-a-modal
travel: camp
talk: sage
submit-modal: choice=Nod.
`;

  it('fails, naming the modal, and passes once every option of it is answered', () => {
    const registry = loadModule(module);

    expect(runTest('leaves-the-modal-open', registry, createGameState())).toEqual({ passed: false, failure: 'modal left open: character-creation' });
    expect(runTest('half-answers-the-modal', registry, createGameState())).toEqual({ passed: false, failure: 'modal left open: character-creation' });

    const answered = createGameState();
    expect(runTest('answers-the-modal', registry, answered)).toEqual({ passed: true });
    expect(answered.player).toEqual({ name: 'Rowan', race: 'Elf' });
  });

  it('holds a dialogue to the same standard, since a menu left hanging is the same unfinished route', () => {
    const registry = loadModule(module);

    expect(runTest('leaves-a-dialogue-open', registry, createGameState())).toEqual({ passed: false, failure: 'modal left open: dialogue' });
    expect(runTest('answers-the-dialogue-as-a-modal', registry, createGameState())).toEqual({ passed: true });
  });
});

// Everything c4 names, in one world: a stat with a base and an item that raises
// it, a skill that earns xp, a slot to fill, and a location reached only by
// being told about it.
const PUBLISHED_MODULE = `
# stat might
base: 4

# skill smithing

# location forge
x: 0, y: 0
starting
entities:
  window
  bench

# location overlook
x: 1, y: 0

# item ore
examine: Streaked with red.

# item ingot
examine: A dull grey bar.

# item gauntlet
title: Gauntlet
slot: hand
+3 might

# entity window
look through: discover: overlook

# entity bench
stations: bench

# recipe ingot
station: bench
in: ore
out: ingot
skill: smithing 5

# save stocked
{"version":${SAVE_VERSION},"inventory":{"ore":1,"gauntlet":1}}
`;

describe('what the engine publishes', () => {
  it('carries stat values, and recomputes them when equipment changes them', () => {
    const session = primed(loadModule(PUBLISHED_MODULE), { inventory: { gauntlet: 1 } });

    expect(view(session).stats.might).toBe(4);

    const armed = apply(session, 'equip:gauntlet');
    expect(armed.equipment).toEqual({ hand: 'gauntlet' });
    expect(armed.stats.might).toBe(7);

    const bare = apply(session, 'unequip:hand');
    expect(bare.equipment).toEqual({});
    expect(bare.stats.might).toBe(4);
  });

  it('carries skill xp as it is earned', () => {
    const registry = loadModule(PUBLISHED_MODULE);
    const session = startSession(registry);
    applyDirective(session, { kind: 'load', save: 'stocked' });

    expect(view(session).xp).toEqual({});

    const forged = apply(session, 'craft:ingot');
    expect(forged.xp).toEqual({ smithing: 5 });
    expect(forged.inventory).toEqual({ ingot: 1, gauntlet: 1 });
  });

  it('carries the locations discovery has revealed, and nothing it has not', () => {
    const session = startSession(loadModule(PUBLISHED_MODULE));

    expect(view(session).discovered).toEqual([]);

    const told = apply(session, 'use:entity.window.look through');
    expect(told.discovered).toEqual(['overlook']);
    expect(told.flags).toEqual({ 'overlook.discovered': true });
  });
});

describe('what the engine withholds', () => {
  it('has a standing answer for every GameState field, so a new one cannot arrive unclassified', () => {
    // The Record is the guard, not the assertion: adding a field to GameState
    // stops compiling here until somebody says whether a driver sees it.
    // `instances` reached this repo unpublished with nothing noticing, which is
    // what this exists to stop happening twice.
    const classified: Record<keyof GameState, 'published' | 'withheld'> = {
      location: 'published',
      time: 'published',
      flags: 'published',
      inventory: 'published',
      equipped: 'published',
      xp: 'published',
      resources: 'published',
      modals: 'published',
      player: 'published',
      activeAction: 'published',
      // `said` is this drained, so the array itself never leaves the engine.
      log: 'withheld',
      // Bookkeeping the engine reasons with and no driver renders. Each stays
      // withheld until something asks: a field published before anything reads
      // it is how `discovered` became a list that is always empty.
      rng: 'withheld',
      visits: 'withheld',
      activeBuffs: 'withheld',
      resourceRateRemainders: 'withheld',
      instances: 'withheld',
    };

    // The constructor, not the type: the two drift only if a field is built
    // without being declared, which the type above cannot see.
    expect(Object.keys(createGameState()).sort()).toEqual(Object.keys(classified).sort());

    const published = Object.keys(classified).filter((field) => classified[field as keyof GameState] === 'published');
    const carried = new Set(Object.keys(view(startSession(loadModule('# location camp\nx: 0, y: 0\nstarting\n')))));
    // Two of them are renamed on the way out and one is drained into `said`.
    const renamed: Record<string, string> = { equipped: 'equipment', activeAction: 'action' };
    for (const field of published) expect(carried.has(renamed[field] ?? field), field).toBe(true);
  });
});

describe('a save is data the engine takes a copy of, not a handle onto it', () => {
  const module = `
# location camp
x: 0, y: 0
starting
entities:
  oven
  mirror

# item bun
examine: Warm.

# entity mirror
look in: open modal: character-creation

# entity oven
roast:
  continuous
  time: 4
  give: 1 bun
`;

  // `registry.saves` is writable and is the only route a driver has to load
  // one, so what a save carries has to stop being the state once it lands.
  it('does not leave the author of a save holding the state it loaded', () => {
    const registry = loadModule(module);
    const session = startSession(registry);
    const mine = { name: 'Rowan', race: 'Elf' };
    registry.saves.set('forged', { version: SAVE_VERSION, diff: { player: mine } });

    applyDirective(session, { kind: 'load', save: 'forged' });
    expect(sessionStatus(session).player.name).toBe('Rowan');

    mine.name = 'MUTATED';
    expect(sessionStatus(session).player.name).toBe('Rowan');
  });

  it('does not let play rewrite the save it was loaded from', () => {
    const registry = loadModule(module);
    const session = startSession(registry);
    registry.saves.set('start', { version: SAVE_VERSION, diff: { inventory: { bun: 1 }, player: { name: 'Rowan', race: 'Elf' } } });

    applyDirective(session, { kind: 'load', save: 'start' });
    apply(session, 'use:entity.mirror.look in');
    submitModal(session, { name: 'Wren' });

    expect(registry.saves.get('start')!.diff.player).toEqual({ name: 'Rowan', race: 'Elf' });
  });

  it('publishes an action a save left without a player clock instead of dying on the next look', () => {
    const registry = loadModule(module);
    const session = startSession(registry);
    // checkSave takes any object here, and pruneStateForRegistry keeps it: the
    // owner and the label both resolve. Only the clock is missing.
    registry.saves.set('midbake', {
      version: SAVE_VERSION,
      diff: { activeAction: { ownerRef: 'entity.oven', actionLabel: 'roast', repeating: true, implicitTarget: 1000, cadences: {} } },
    });

    applyDirective(session, { kind: 'load', save: 'midbake' });

    const v = view(session);
    expect(v.action).toEqual({ label: 'roast', progress: 0, attempts: 0, targeted: false, completion: 1 });
  });
});

describe('the handle a driver obtains', () => {
  it('carries no route to the state it plays, by enumeration or by key', () => {
    const session = startSession(loadModule('# location camp\nx: 0, y: 0\nstarting\n'));

    // `session.state` is the compile-time half and tsc owns it. This is the
    // runtime half: a symbol member satisfied the type and handed the live
    // GameState back out of getOwnPropertySymbols.
    expect(Object.getOwnPropertySymbols(session)).toEqual([]);
    expect(Object.keys(session)).toEqual(['registry']);
    expect(Object.values(session).some((value) => value instanceof Object && 'inventory' in value)).toBe(false);
  });

  it('refuses to play a handle it did not hand out, rather than reading undefined', () => {
    const registry = loadModule('# location camp\nx: 0, y: 0\nstarting\n');
    const forged = { registry };

    expect(() => view(forged)).toThrow(/not a session startSession handed out/);
  });
});

describe('starting a session with nowhere to begin', () => {
  it('says so instead of failing later with an empty location id', () => {
    expect(() => startSession(loadModule('# location camp\nx: 0, y: 0'))).toThrow(/no # location is marked starting/);
  });
});

describe('view: what a long span hands back', () => {
  // An unkillable dummy at one swing a second: the big-jump path resolve() exists
  // for, logging one line per swing for as long as the span lasts.
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

# entity dummy
title: Dummy
stats: attack 0, max-health 1000000, accuracy 100, evasion 0, swings-per-minute 60
hit:
  continuous
  rate: swings-per-minute
  accuracy: accuracy
  evasion: evasion
  ability: attack
  target: health
`;

  function swinging(): ReturnType<typeof startSession> {
    const session = startSession(loadModule(arena));
    view(session);
    apply(session, 'use:entity.dummy.hit');
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
