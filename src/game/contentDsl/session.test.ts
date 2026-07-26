import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { loadModule } from './runtime';
import { apply, beginAction, PlayView, startSession, submitModal, view, wait } from './session';

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
    expect(ids(v)).toContain('use:entity.giant-rats.fight');

    v = apply(session, 'use:entity.giant-rats.fight');
    expect(session.state.flags['tutorial.rats-killed']).toBe(1);
    expect(ids(v)).toContain('use:entity.giant-rats.fight');

    v = apply(session, 'use:entity.giant-rats.fight');
    expect(session.state.flags['tutorial.rats-killed']).toBe(2);
    expect(ids(v)).toContain('use:entity.giant-rats.fight');

    v = apply(session, 'use:entity.giant-rats.fight');
    expect(session.state.flags['tutorial.rats-killed']).toBe(3);
    expect(ids(v)).not.toContain('use:entity.giant-rats.fight');

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
    // fights (3s each) + the beach journey (1 unit east × 5s/unit = 5s) = 19s.
    // Talking, the mirror and ascend/descend (instant stairs actions) cost
    // nothing. This doubles as a measured-playtime invariant.
    expect(v.time).toBe(19);
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

# entity oven
roast:
  repeating
  time: 4
  give: 1 roasted-chestnut

# item bread
eat: take: 1 bread, say: You eat the bread.

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
    expect(session.state.activeAction?.progress).toBe(0);
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
  // 1 × TRAVEL_SECONDS_PER_UNIT (5s).
  const module = `
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

    const v = apply(session, 'travel:beach');
    expect(v.location.id).toBe('beach');
    expect(v.time).toBe(5);
    expect(session.state.activeAction).toBeNull();
  });

  it('beginAction arms the journey spannably — location and time unchanged until driven', () => {
    const registry = loadModule(module);
    const session = startSession(registry);

    const v = beginAction(session, 'travel:beach');
    expect(session.state.activeAction).not.toBeNull();
    expect(session.state.location).toBe('camp');
    expect(session.state.time).toBe(0);
    expect(v.location.id).toBe('camp');

    const arrived = wait(session, 5);
    expect(arrived.location.id).toBe('beach');
    expect(session.state.activeAction).toBeNull();
    expect(session.state.time).toBe(5);
  });
});
