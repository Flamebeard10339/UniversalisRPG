import { describe, expect, it } from 'vitest';
import { loadModule, Registry } from '../content/registry';
import { carriedEntries, carriedOptions, carriedSubmit, CONFIRMED, LEAVE } from './carriedScreen';
import { carriedCount, feedItem } from './itemInstance';
import { initialState } from './save';
import { GameState } from './state';

const MODULE = `
# location camp
x: 0, y: 0
starting

# item iron-sword
title: Iron Sword
slot: mainhand
max-level: 10

# item heartwood-blade
title: Heartwood Blade
slot: mainhand
max-level: 10

# item whetstone
title: Whetstone
item-experience: 1000

# item rope
title: Rope
`;

const registry = loadModule(MODULE);

function carrying(inventory: Record<string, number>, over: Registry = registry): GameState {
  const state = initialState(over);
  Object.assign(state.inventory, inventory);
  return state;
}

// Feeds one copy out of its stack, which is the only way a grown copy exists.
function withGrownBlade(): GameState {
  const state = carrying({ 'heartwood-blade': 2, whetstone: 1 });
  const grown = feedItem(state, registry, 'heartwood-blade', 'whetstone');
  if (!grown.ok) throw new Error(grown.refused);
  return state;
}

const values = (answers: Record<string, string>, state: GameState, key: string): readonly string[] | null =>
  carriedOptions(answers, state, registry).find((option) => option.key === key)?.values ?? null;

describe('what the screen lists', () => {
  // c1: a stack is one line with a count on it, and a grown copy is not folded
  // into the stack it left, because the two are not interchangeable.
  it('lists stacks by title and count, and each grown copy under its own name', () => {
    const state = withGrownBlade();
    Object.assign(state.inventory, { 'iron-sword': 3 });

    expect(carriedEntries(state, registry)).toEqual([
      { id: 'heartwood-blade', value: 'Heartwood Blade x1', grown: false },
      { id: 'iron-sword', value: 'Iron Sword x3', grown: false },
      { id: '1', value: 'Heartwood Blade #1', grown: true },
    ]);
  });

  it('leaves out a stack the player has none of, and lists nothing at all for empty hands', () => {
    expect(carriedEntries(carrying({ rope: 0 }), registry)).toEqual([]);
  });

  // An answer comes back as the value it was published as, so two items titled
  // alike would resolve to whichever of them was listed first.
  it('tells two entries of the same title apart by the id each is named by', () => {
    const twins = loadModule(`${MODULE}\n# item cord\ntitle: Rope\n`);
    const state = carrying({ rope: 2, cord: 2 }, twins);

    expect(carriedEntries(state, twins).map((entry) => entry.value)).toEqual(['Rope x2 (rope)', 'Rope x2 (cord)']);
  });

  it('names an item the registry has lost by the id the player still carries it under', () => {
    expect(carriedEntries(carrying({ 'gone.relic': 1 }), registry)[0].value).toBe('gone.relic x1');
  });
});

describe('what the screen asks', () => {
  it('asks which item before it asks anything else', () => {
    const state = carrying({ rope: 1 });

    expect(carriedOptions({}, state, registry).map((option) => option.key)).toEqual(['item']);
    expect(carriedOptions({ item: 'Rope x1' }, state, registry).map((option) => option.key)).toEqual(['item', 'verb']);
  });

  // c1: the verbs are computed from the item already chosen, so an entry offers
  // only what applies to it — equip for an item with a slot, destroy for anything.
  it('offers only the verbs the chosen item takes', () => {
    const state = carrying({ rope: 1, 'iron-sword': 1 });

    expect(values({ item: 'Rope x1' }, state, 'verb')).toEqual(['Destroy', LEAVE]);
    expect(values({ item: 'Iron Sword x1' }, state, 'verb')).toEqual(['Equip', 'Destroy', LEAVE]);
  });

  // c15: every question this screen asks publishes a way out of it, including
  // the one it asks with nothing to list.
  it('publishes the value that leaves beside every question, empty hands included', () => {
    const state = withGrownBlade();

    expect(values({}, carrying({}), 'item')).toEqual([LEAVE]);
    expect(values({}, state, 'item')?.at(-1)).toBe(LEAVE);
    expect(values({ item: 'Heartwood Blade #1' }, state, 'verb')?.at(-1)).toBe(LEAVE);
    expect(values({ item: 'Heartwood Blade #1', verb: 'Destroy' }, state, 'confirm')).toEqual([CONFIRMED, LEAVE]);
  });

  // c12: the second question is what names what is lost, and only a grown copy
  // is asked it.
  it('asks a grown copy’s destruction once more, naming the copy, and asks a stack nothing', () => {
    const state = withGrownBlade();

    expect(carriedOptions({ item: 'Heartwood Blade #1', verb: 'Destroy' }, state, registry).at(-1)).toEqual({
      key: 'confirm',
      label: 'Destroy Heartwood Blade #1 for good?',
      values: [CONFIRMED, LEAVE],
    });
    expect(carriedOptions({ item: 'Heartwood Blade x1', verb: 'Destroy' }, state, registry).map((option) => option.key)).toEqual(['item', 'verb']);
  });

  it('asks nothing beyond the item once the answer names something the player has stopped carrying', () => {
    const state = carrying({ rope: 1 });

    expect(carriedOptions({ item: 'Rope x9' }, state, registry).map((option) => option.key)).toEqual(['item']);
  });
});

describe('what the screen does with an answer', () => {
  it('closes on the value that leaves, from whichever question published it, and moves nothing', () => {
    const state = withGrownBlade();
    const before = JSON.stringify(state);

    expect(carriedSubmit({ item: LEAVE }, state, registry)).toBeNull();
    expect(carriedSubmit({ item: 'Heartwood Blade #1', verb: LEAVE }, state, registry)).toBeNull();
    expect(carriedSubmit({ item: 'Heartwood Blade #1', verb: 'Destroy', confirm: LEAVE }, state, registry)).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps the item it was answered with and asks the next question, rather than closing half-answered', () => {
    const state = carrying({ rope: 1 });

    expect(carriedSubmit({ item: 'Rope x1' }, state, registry)).toEqual({ name: 'carried-items', answers: { item: 'Rope x1' } });
    expect(carriedSubmit({ item: 'Rope x1', verb: 'Destroy' }, withGrownBlade(), registry)).toBeNull();
  });

  it('wears what equip names, through the one function equip: goes through', () => {
    const state = carrying({ 'iron-sword': 1 });

    expect(carriedSubmit({ item: 'Iron Sword x1', verb: 'Equip' }, state, registry)).toBeNull();
    expect(state.equipped).toEqual({ mainhand: 'iron-sword' });
  });

  // c12: a stack copy goes on the verb; a grown copy waits for the answer to the
  // question naming it, and the other answer to that question leaves it standing.
  it('destroys a stack copy at once and a grown copy only once it is confirmed', () => {
    const state = withGrownBlade();

    expect(carriedSubmit({ item: 'Heartwood Blade x1', verb: 'Destroy' }, state, registry)).toBeNull();
    expect(carriedCount(state, 'heartwood-blade')).toBe(1);

    expect(carriedSubmit({ item: 'Heartwood Blade #1', verb: 'Destroy' }, state, registry)).toEqual({
      name: 'carried-items',
      answers: { item: 'Heartwood Blade #1', verb: 'Destroy' },
    });
    expect(carriedCount(state, 'heartwood-blade')).toBe(1);

    expect(carriedSubmit({ item: 'Heartwood Blade #1', verb: 'Destroy', confirm: CONFIRMED }, state, registry)).toBeNull();
    expect(carriedCount(state, 'heartwood-blade')).toBe(0);
  });

  it('does nothing for an answer naming what the player has stopped carrying', () => {
    const state = carrying({ rope: 1 });

    expect(carriedSubmit({ item: 'Rope x9', verb: 'Destroy' }, state, registry)).toBeNull();
    expect(state.inventory).toEqual({ rope: 1 });
  });
});
