import { describe, expect, it } from 'vitest';
import { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { carriedEntries, carriedOptions, carriedSubmit, CONFIRMED, LEAVE } from './carriedScreen';
import { equip } from './equipment';
import { carriedCount, feedItem } from './itemInstance';
import { planeFrame } from './planeScreen';
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

const registry = loadInEnglish(MODULE);

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

const last = <T,>(list: readonly T[] | null | undefined): T | undefined => (list ? list[list.length - 1] : undefined);

describe('what the screen lists', () => {
  // c1: a stack is one line with a count on it, and a grown copy is not folded
  // into the stack it left, because the two are not interchangeable.
  it('lists stacks by title and count, and each grown copy under its own name', () => {
    const state = withGrownBlade();
    Object.assign(state.inventory, { 'iron-sword': 3 });

    expect(carriedEntries(state, registry)).toEqual([
      { id: 'heartwood-blade', name: 'Heartwood Blade', count: 1, value: 'Heartwood Blade x1', grown: false },
      { id: 'iron-sword', name: 'Iron Sword', count: 3, value: 'Iron Sword x3', grown: false },
      { id: '1', name: 'Modified Heartwood Blade', count: 1, value: 'Modified Heartwood Blade', grown: true },
    ]);
  });

  // c16: the descriptor is the whole of what says a copy is grown, and the id it
  // was minted under is nowhere in what the player reads.
  it('names a grown copy under a descriptor and no id, whatever id minting gave it', () => {
    const grown = carriedEntries(withGrownBlade(), registry).find((entry) => entry.grown);

    expect(grown?.name).toBe('Modified Heartwood Blade');
    expect(grown?.name).not.toContain(grown?.id);
  });

  it('leaves out a stack the player has none of, and lists nothing at all for empty hands', () => {
    expect(carriedEntries(carrying({ rope: 0 }), registry)).toEqual([]);
  });

  // An answer comes back as the value it was published as, so two items titled
  // alike would resolve to whichever of them was listed first.
  it('tells two entries of the same title apart by the id each is named by', () => {
    const twins = loadInEnglish(`${MODULE}\n# item cord\ntitle: Rope\n`);
    const state = carrying({ rope: 2, cord: 2 }, twins);

    expect(carriedEntries(state, twins).map((entry) => entry.value)).toEqual(['Rope x2 (rope)', 'Rope x2 (cord)']);
  });

  // c16: two grown copies of one base carry one name, so the value each is
  // answered by is the one that has to be made distinct, and the name is not.
  it('leaves two grown copies of one base named alike and answerable apart', () => {
    const state = carrying({ 'heartwood-blade': 3, whetstone: 2 });
    for (const _ of [0, 1]) {
      const grown = feedItem(state, registry, 'heartwood-blade', 'whetstone');
      if (!grown.ok) throw new Error(grown.refused);
    }
    const copies = carriedEntries(state, registry).filter((entry) => entry.grown);

    expect(copies.map((entry) => entry.name)).toEqual(['Modified Heartwood Blade', 'Modified Heartwood Blade']);
    expect(new Set(copies.map((entry) => entry.value)).size).toBe(2);
  });

  // An item nothing declares has a title in no language, so its key stands in —
  // and the key is built from the id the player is still carrying it under (c3).
  it('names an item the registry has lost by the id the player still carries it under', () => {
    expect(carriedEntries(carrying({ 'gone.relic': 1 }), registry)[0].value).toBe('item.gone.relic.title x1');
  });

  // c21: one copy, one row. The stack it came out of keeps its own row with one
  // fewer on it, and the worn copy names the slot it is in. The two rows are two
  // copies, so what names one names neither the other nor the item both are of:
  // an item id names the stack, which the worn copy has left.
  it('lists a worn stack copy once, under its slot, and never under the id of the stack it left', () => {
    const state = carrying({ 'iron-sword': 3 });
    equip(state, registry, 'iron-sword');

    expect(carriedEntries(state, registry)).toEqual([
      { id: 'iron-sword', name: 'Iron Sword', count: 2, value: 'Iron Sword x2', grown: false },
      { id: 'worn:mainhand', name: 'Iron Sword', count: 1, value: 'Iron Sword (mainhand)', grown: false, slot: 'mainhand' },
    ]);
  });

  it('lists a worn grown copy under equipment and nowhere else', () => {
    const state = withGrownBlade();
    equip(state, registry, '1');

    expect(carriedEntries(state, registry)).toEqual([
      { id: 'heartwood-blade', name: 'Heartwood Blade', count: 1, value: 'Heartwood Blade x1', grown: false },
      { id: '1', name: 'Modified Heartwood Blade', count: 1, value: 'Modified Heartwood Blade (mainhand)', grown: true, slot: 'mainhand' },
    ]);
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
    expect(values({ item: 'Iron Sword x1' }, state, 'verb')).toEqual(['Grow', 'Equip', 'Destroy', LEAVE]);
  });

  // c18: an entry offers only verbs that apply to it, and an item already worn
  // disproves the one that would do nothing. c21 adds the other half: the worn
  // entry offers every verb a carried one does, so what the player most wants to
  // improve is still one press from being grown.
  // The stack the worn copy left is still stocked, so the two rows are of one
  // item and differ only in which copy they are: what is worn takes Unequip and
  // what is on the stack takes Equip, from the same item and at the same moment.
  it('offers a worn entry Unequip rather than an Equip that would do nothing', () => {
    const state = carrying({ 'iron-sword': 3, 'heartwood-blade': 1 });
    equip(state, registry, 'iron-sword');

    expect(values({ item: 'Iron Sword (mainhand)' }, state, 'verb')).toEqual(['Grow', 'Unequip', 'Destroy', LEAVE]);
    expect(values({ item: 'Iron Sword x2' }, state, 'verb')).toEqual(['Grow', 'Equip', 'Destroy', LEAVE]);
    expect(values({ item: 'Heartwood Blade x1' }, state, 'verb')).toEqual(['Grow', 'Equip', 'Destroy', LEAVE]);
  });

  // The slot holds the spelling that was worn, so a stack still in the stack does
  // not make the grown copy in the slot read as carried.
  it('offers Unequip to the very copy in the slot and Equip to the one beside it', () => {
    const state = withGrownBlade();
    equip(state, registry, '1');

    expect(values({ item: 'Modified Heartwood Blade (mainhand)' }, state, 'verb')).toEqual(['Grow', 'Unequip', 'Destroy', LEAVE]);
    expect(values({ item: 'Heartwood Blade x1' }, state, 'verb')).toEqual(['Grow', 'Equip', 'Destroy', LEAVE]);
  });

  // c15: every question this screen asks publishes a way out of it, including
  // the one it asks with nothing to list.
  it('publishes the value that leaves beside every question, empty hands included', () => {
    const state = withGrownBlade();

    expect(values({}, carrying({}), 'item')).toEqual([LEAVE]);
    expect(last(values({}, state, 'item'))).toBe(LEAVE);
    expect(last(values({ item: 'Modified Heartwood Blade' }, state, 'verb'))).toBe(LEAVE);
    expect(values({ item: 'Modified Heartwood Blade', verb: 'Destroy' }, state, 'confirm')).toEqual([CONFIRMED, LEAVE]);
  });

  // c12: the second question is what names what is lost, and only a grown copy
  // is asked it.
  it('asks a grown copy’s destruction once more, naming the copy, and asks a stack nothing', () => {
    const state = withGrownBlade();

    expect(last(carriedOptions({ item: 'Modified Heartwood Blade', verb: 'Destroy' }, state, registry))).toEqual({
      key: 'confirm',
      label: 'Destroy Modified Heartwood Blade for good?',
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
    expect(carriedSubmit({ item: 'Modified Heartwood Blade', verb: LEAVE }, state, registry)).toBeNull();
    expect(carriedSubmit({ item: 'Modified Heartwood Blade', verb: 'Destroy', confirm: LEAVE }, state, registry)).toBeNull();
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

  // c18: the row offers Equip while the stack it stands for has a copy, so
  // taking it has to be a move and not an error. Offering it is asserted above;
  // this is the other half, and the half the screen is removed by when it fails.
  it('wears a second copy off a row whose stack is short one already worn', () => {
    const state = carrying({ 'iron-sword': 3 });
    equip(state, registry, 'iron-sword');

    expect(carriedSubmit({ item: 'Iron Sword x2', verb: 'Equip' }, state, registry)).toBeNull();
    expect(state.equipped).toEqual({ mainhand: 'iron-sword' });
    expect(carriedCount(state, 'iron-sword')).toBe(2);
  });

  it('takes off what unequip names, and empties the slot rather than the hands', () => {
    const state = carrying({ 'iron-sword': 1 });
    equip(state, registry, 'iron-sword');

    expect(carriedSubmit({ item: 'Iron Sword (mainhand)', verb: 'Unequip' }, state, registry)).toBeNull();
    expect(state.equipped).toEqual({});
    expect(carriedCount(state, 'iron-sword')).toBe(1);
  });

  // c12: a stack copy goes on the verb; a grown copy waits for the answer to the
  // question naming it, and the other answer to that question leaves it standing.
  it('destroys a stack copy at once and a grown copy only once it is confirmed', () => {
    const state = withGrownBlade();

    expect(carriedSubmit({ item: 'Heartwood Blade x1', verb: 'Destroy' }, state, registry)).toBeNull();
    expect(carriedCount(state, 'heartwood-blade')).toBe(1);

    expect(carriedSubmit({ item: 'Modified Heartwood Blade', verb: 'Destroy' }, state, registry)).toEqual({
      name: 'carried-items',
      answers: { item: 'Modified Heartwood Blade', verb: 'Destroy' },
    });
    expect(carriedCount(state, 'heartwood-blade')).toBe(1);

    expect(carriedSubmit({ item: 'Modified Heartwood Blade', verb: 'Destroy', confirm: CONFIRMED }, state, registry)).toBeNull();
    expect(carriedCount(state, 'heartwood-blade')).toBe(0);
  });

  // c21: the equipment's entries take the verbs a carried entry takes, so the
  // copy the player is wearing is the one they can grow without taking it off.
  // A stack is left standing behind the slot throughout, because an item id
  // answers for the stack while it has one and would reach past the worn copy.
  it('opens the plane of the copy in the slot, and puts what growing it minted back on', () => {
    const state = withGrownBlade();
    Object.assign(state.inventory, { 'heartwood-blade': 3, whetstone: 1 });
    equip(state, registry, 'heartwood-blade');

    expect(carriedSubmit({ item: 'Heartwood Blade (mainhand)', verb: 'Grow' }, state, registry)).toEqual(planeFrame('worn:mainhand'));
    expect(feedItem(state, registry, 'worn:mainhand', 'whetstone')).toEqual({ ok: true, instance: '2' });
    expect(state.equipped).toEqual({ mainhand: '2' });
    expect(state.inventory['heartwood-blade']).toBe(2);
  });

  it('destroys the copy in the slot without reaching into the stack behind it', () => {
    const state = carrying({ 'iron-sword': 3 });
    equip(state, registry, 'iron-sword');

    expect(carriedSubmit({ item: 'Iron Sword (mainhand)', verb: 'Destroy' }, state, registry)).toBeNull();
    expect(state.equipped).toEqual({});
    expect(carriedCount(state, 'iron-sword')).toBe(2);
  });

  it('does nothing for an answer naming what the player has stopped carrying', () => {
    const state = carrying({ rope: 1 });

    expect(carriedSubmit({ item: 'Rope x9', verb: 'Destroy' }, state, registry)).toBeNull();
    expect(state.inventory).toEqual({ rope: 1 });
  });
});
