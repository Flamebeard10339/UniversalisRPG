import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { loadModule } from './runtime';
import { apply, PlayView, startSession, submitModal, view } from './session';

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

    // tutorial-island.dsl authors no `time:` on any action, so the whole
    // playthrough above should leave the simulated clock untouched.
    expect(v.time).toBe(0);
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
