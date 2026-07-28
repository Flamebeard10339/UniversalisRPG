import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { createGameState, PLAYER, travelSecondsPerUnit } from './runtime';
import { loadModule } from '../content/registry';
import { apply, beginAction, cancelAction, PlayView, runTest, startSession, submitModal, view, wait } from './session';

const source = readFileSync('content/tutorial-island.dsl', 'utf8');

function ids(v: PlayView): string[] {
  return v.choices.map((c) => c.id);
}

describe('session', () => {
  it('drives the tutorial-island miki route through the choice-list API', () => {
    const registry = loadModule(source);
    const session = startSession(registry);

    let v = view(session);
    expect(v.location.id).toBe('guide-house');
    expect(v.said).toEqual([]);
    expect(ids(v)).toContain('talk:miki');
    expect(ids(v)).not.toContain('use:entity.front-door.pick lock');

    v = apply(session, 'talk:miki');
    expect(v.inDialogue).toBe(true);
    expect(ids(v)).toEqual(expect.arrayContaining(['dialogue:0', 'dialogue:1']));

    v = apply(session, 'dialogue:0');
    expect(v.inDialogue).toBe(false);
    expect(session.state.flags['tutorial.quest-given']).toBe(true);

    v = apply(session, 'use:entity.mirror.look in');
    expect(v.said).toContain('modal:character-creation');
    expect(session.state.flags['tutorial.mirror-done']).toBe(true);
    expect(ids(v)).not.toContain('use:entity.mirror.look in');

    v = apply(session, 'talk:miki');
    expect(v.inDialogue).toBe(false);
    expect(session.state.inventory['jug-of-water']).toBe(1);
    expect(session.state.inventory['pot-of-flour']).toBe(1);

    expect(ids(v)).toContain('craft:dough');
    v = apply(session, 'craft:dough');
    expect(session.state.inventory.dough).toBe(1);

    expect(ids(v)).toContain('craft:bread');
    v = apply(session, 'craft:bread');
    expect(session.state.inventory.bread).toBe(1);

    v = apply(session, 'use:entity.stairs.ascend');
    expect(v.location.id).toBe('guide-house-upstairs');
    expect(ids(v)).toContain('use:entity.dresser.search drawer');

    v = apply(session, 'use:entity.dresser.search drawer');
    expect(session.state.inventory.lockpick).toBe(1);

    v = apply(session, 'use:entity.stairs-down.descend');
    expect(v.location.id).toBe('guide-house');
    expect(ids(v)).toContain('use:entity.front-door.pick lock');

    v = apply(session, 'talk:miki');
    expect(v.inDialogue).toBe(false);
    expect(session.state.flags['tutorial.made-bread']).toBe(true);

    v = apply(session, 'talk:miki');
    expect(v.inDialogue).toBe(false);
    expect(session.state.inventory['iron-sword']).toBe(1);
    expect(session.state.inventory['wooden-shield']).toBe(1);

    v = apply(session, 'use:entity.stairs.descend');
    expect(v.location.id).toBe('basement');
    expect(ids(v)).toContain('use:entity.giant-rat.fight');

    // A real fight: one `use:` is one swing, so each rat needs the clock to run
    // on. 30s is far longer than the ~6s one actually lasts.
    for (let killed = 1; killed <= 3; killed++) {
      v = apply(session, 'use:entity.giant-rat.fight');
      expect(v.encounter).not.toBeNull();
      expect(v.encounter!.foes.map((foe) => foe.title)).toEqual(['Giant Rat']);

      v = wait(session, 30);
      expect(session.state.flags['tutorial.rats-killed']).toBe(killed);
      expect(v.encounter).toBeNull(); // the fight is over, so is the readout
    }
    expect(ids(v)).not.toContain('use:entity.giant-rat.fight');

    v = apply(session, 'use:entity.stairs-up.ascend');
    expect(v.location.id).toBe('guide-house');
    expect(ids(v)).not.toContain('travel:beach');

    v = apply(session, 'talk:miki');
    expect(v.inDialogue).toBe(false);
    expect(session.state.flags['tutorial.miki-complete']).toBe(true);
    expect(session.state.flags['front-door.unlocked']).toBe(true);

    v = view(session);
    expect(ids(v)).toContain('travel:beach');

    v = apply(session, 'talk:miki');
    expect(v.inDialogue).toBe(false);
    expect(v.said).toContain("Still here? The boat to the mainland won't wait forever.");

    v = apply(session, 'travel:beach');
    expect(v.location.id).toBe('beach');

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
    expect(() => apply(session, 'use:entity.front-door.pick lock')).toThrow();
    expect(() => apply(session, 'travel:beach')).toThrow();
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
    const registry = loadModule(module);
    const session = startSession(registry);
    session.state.inventory.bread = 1;

    let v = view(session);
    expect(ids(v)).toContain('use:item.bread.eat');

    v = apply(session, 'use:item.bread.eat');
    expect(v.said).toContain('You eat the bread.');
    expect(session.state.inventory.bread).toBe(0);
    expect(ids(v)).not.toContain('use:item.bread.eat');
  });

  it('surfaces a pending modal from open modal:, and submitModal captures player name/race and clears it', () => {
    const module = `
# location camp
x: 0, y: 0
starting
entities:
  mirror

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
    expect(v.pendingModal).toBe('character-creation');
    expect(session.state.player).toEqual({ name: '', race: '' });

    v = submitModal(session, { name: 'Rowan', race: 'Elf' });
    expect(v.pendingModal).toBeUndefined();
    expect(session.state.player).toEqual({ name: 'Rowan', race: 'Elf' });

    v = apply(session, 'talk:mirror');
    expect(v.said).toContain('There you are, Rowan, Elf.');
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
  repeating
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
    expect(session.state.activeAction).not.toBeNull();
    expect(session.state.activeAction?.cadences[PLAYER].progress).toBe(0);
    expect(session.state.time).toBe(0);
    expect(session.state.inventory['roasted-chestnut'] ?? 0).toBe(0);
    expect(v.time).toBe(0);
  });

  it('completes an instant item action (no time:) immediately, same as apply', () => {
    const registry = loadModule(module);
    const session = startSession(registry);
    session.state.inventory.bread = 1;

    const v = beginAction(session, 'use:item.bread.eat');
    expect(session.state.activeAction).toBeNull();
    expect(session.state.inventory.bread).toBe(0);
    expect(v.said).toContain('You eat the bread.');
  });

  it('leaves a spannable craft (time: 2) armed without resolving it', () => {
    const registry = loadModule(module);
    const session = startSession(registry);

    const v = beginAction(session, 'craft:dough');
    expect(session.state.activeAction).not.toBeNull();
    expect(session.state.time).toBe(0);
    expect(session.state.inventory.dough ?? 0).toBe(0);
    expect(v.time).toBe(0);
  });

  it('completes an instant craft (no time:) immediately, same as apply', () => {
    const registry = loadModule(module);
    const session = startSession(registry);

    beginAction(session, 'craft:mix');
    expect(session.state.activeAction).toBeNull();
    expect(session.state.inventory.mix).toBe(1);
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
    expect(session.state.activeAction).toBeNull();
  });

  it('beginAction arms the journey spannably — location and time unchanged until driven', () => {
    const registry = loadModule(module);
    const session = startSession(registry);
    const journey = 1 * travelSecondsPerUnit(registry);

    const v = beginAction(session, 'travel:beach');
    expect(session.state.activeAction).not.toBeNull();
    expect(session.state.location).toBe('camp');
    expect(session.state.time).toBe(0);
    expect(v.location.id).toBe('camp');

    const arrived = wait(session, journey);
    expect(arrived.location.id).toBe('beach');
    expect(session.state.activeAction).toBeNull();
    expect(session.state.time).toBe(journey);
  });
});

describe('travel edges aliased by a free entity relocate are hidden', () => {
  it('hides a travel edge that a stairs-like entity already offers as a free relocate', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    session.state.location = 'guide-house';

    const choiceIds = ids(view(session));
    // The stairs entity relocates to both floors, so the duplicate vertical
    // travel edges are suppressed in favor of ascend/descend.
    expect(choiceIds).toContain('use:entity.stairs.ascend');
    expect(choiceIds).toContain('use:entity.stairs.descend');
    expect(choiceIds).not.toContain('travel:basement');
    expect(choiceIds).not.toContain('travel:guide-house-upstairs');
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
    const registry = loadModule(module);
    const session = startSession(registry);
    session.state.inventory.coin = 1;

    const choiceIds = ids(view(session));
    // gate.enter relocates to cave but costs a coin, so it is not a free alias —
    // the travel edge to cave stays; and nothing aliases summit.
    expect(choiceIds).toContain('travel:cave');
    expect(choiceIds).toContain('travel:summit');
  });
});

describe('cancelAction', () => {
  it('drops the action in flight, keeping units already completed and un-consumed inputs', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    session.state.location = 'guide-house';
    session.state.inventory.dough = 2; // two loaves' worth

    beginAction(session, 'craft:bread');
    wait(session, 4); // one full 3s bake done, a second one 1s in
    expect(session.state.inventory.bread).toBe(1);
    expect(session.state.activeAction).not.toBeNull();

    const v = cancelAction(session);
    expect(session.state.activeAction).toBeNull();
    expect(session.state.inventory.bread).toBe(1); // no partial credit for the aborted bake
    expect(session.state.inventory.dough).toBe(1); // its input was not consumed
    expect(v.choices.length).toBeGreaterThan(0); // back to ordinary choices
  });

  it('is a no-op when nothing is active', () => {
    const registry = loadModule(source);
    const session = startSession(registry);
    expect(() => cancelAction(session)).not.toThrow();
    expect(session.state.activeAction).toBeNull();
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
  repeating
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
    expect(state.time).toBe(2);
  });
});
