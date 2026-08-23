import { describe, expect, it } from 'vitest';
import { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { carriedOptions, carriedSubmit, CONFIRMED, LEAVE } from './carriedScreen';
import { carriedEntries } from './carried';
import { equip } from './equipment';
import { feedItem, packedCount } from './itemInstance';
import { planeFrame } from './planeScreen';
import { initialState } from './save';
import { GameState } from './state';
import { inEnglish } from './sayFixture';

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

function withGrownBlade(): GameState {
  const state = carrying({ 'heartwood-blade': 2, whetstone: 1 });
  const grown = feedItem(state, registry, 'heartwood-blade', 'whetstone');
  if (!grown.ok) throw new Error(inEnglish(registry, grown.refused));
  return state;
}

const values = (answers: Record<string, string>, state: GameState, key: string): readonly string[] | null =>
  carriedOptions(answers, state, registry)
    .find((option) => option.key === key)
    ?.values?.map((choice) => choice.value) ?? null;

const last = <T,>(list: readonly T[] | null | undefined): T | undefined => (list ? list[list.length - 1] : undefined);

describe('what the screen lists', () => {
  it('lists stacks by title and count, and each grown copy under its own name', () => {
    const state = withGrownBlade();
    Object.assign(state.inventory, { 'iron-sword': 3 });

    expect(carriedEntries(state, registry)).toEqual([
      { id: 'heartwood-blade', name: 'Heartwood Blade', count: 1, shown: 'Heartwood Blade x1', grown: false },
      { id: 'iron-sword', name: 'Iron Sword', count: 3, shown: 'Iron Sword x3', grown: false },
      { id: '1', name: 'Modified Heartwood Blade', count: 1, shown: 'Modified Heartwood Blade', grown: true },
    ]);
  });

  it('names a grown copy under a descriptor and no id, whatever id minting gave it', () => {
    const grown = carriedEntries(withGrownBlade(), registry).find((entry) => entry.grown);

    expect(grown?.name).toBe('Modified Heartwood Blade');
    expect(grown?.name).not.toContain(grown?.id);
  });

  it('leaves out a stack the player has none of, and lists nothing at all for empty hands', () => {
    expect(carriedEntries(carrying({ rope: 0 }), registry)).toEqual([]);
  });

  it('tells two entries of the same title apart by the id each is named by', () => {
    const twins = loadInEnglish(`${MODULE}\n# item cord\ntitle: Rope\n`);
    const state = carrying({ rope: 2, cord: 2 }, twins);

    const entries = carriedEntries(state, twins);
    expect(entries.map((entry) => entry.id)).toEqual(['rope', 'cord']);
    expect(entries.map((entry) => entry.shown)).toEqual(['Rope x2', 'Rope x2']);
  });

  it('leaves two grown copies of one base named alike and answerable apart', () => {
    const state = carrying({ 'heartwood-blade': 3, whetstone: 2 });
    for (const _ of [0, 1]) {
      const grown = feedItem(state, registry, 'heartwood-blade', 'whetstone');
      if (!grown.ok) throw new Error(inEnglish(registry, grown.refused));
    }
    const copies = carriedEntries(state, registry).filter((entry) => entry.grown);

    expect(copies.map((entry) => entry.name)).toEqual(['Modified Heartwood Blade', 'Modified Heartwood Blade']);
    expect(new Set(copies.map((entry) => entry.id)).size).toBe(2);
  });

  it('names an item the registry has lost by the id the player still carries it under', () => {
    expect(carriedEntries(carrying({ 'gone.relic': 1 }), registry)[0].shown).toBe('item.gone.relic.title x1');
  });

  it('lists a worn stack copy once, under its slot, and never under the id of the stack it left', () => {
    const state = carrying({ 'iron-sword': 3 });
    equip(state, registry, 'iron-sword');

    expect(carriedEntries(state, registry)).toEqual([
      { id: 'iron-sword', name: 'Iron Sword', count: 2, shown: 'Iron Sword x2', grown: false },
      { id: 'worn:mainhand', name: 'Iron Sword', count: 1, shown: 'Iron Sword (Mainhand)', grown: false, worn: { slot: 'mainhand', title: 'Mainhand' } },
    ]);
  });

  it('lists a worn grown copy under equipment and nowhere else', () => {
    const state = withGrownBlade();
    equip(state, registry, '1');

    expect(carriedEntries(state, registry)).toEqual([
      { id: 'heartwood-blade', name: 'Heartwood Blade', count: 1, shown: 'Heartwood Blade x1', grown: false },
      { id: '1', name: 'Modified Heartwood Blade', count: 1, shown: 'Modified Heartwood Blade (Mainhand)', grown: true, worn: { slot: 'mainhand', title: 'Mainhand' } },
    ]);
  });
});

describe('what the screen asks', () => {
  it('asks which item before it asks anything else', () => {
    const state = carrying({ rope: 1 });

    expect(carriedOptions({}, state, registry).map((option) => option.key)).toEqual(['item']);
    expect(carriedOptions({ item: 'rope' }, state, registry).map((option) => option.key)).toEqual(['item', 'verb']);
  });

  it('offers only the verbs the chosen item takes', () => {
    const state = carrying({ rope: 1, 'iron-sword': 1 });

    expect(values({ item: 'rope' }, state, 'verb')).toEqual(['destroy', LEAVE]);
    expect(values({ item: 'iron-sword' }, state, 'verb')).toEqual(['grow', 'equip', 'destroy', LEAVE]);
  });

  it('offers a worn entry Unequip rather than an Equip that would do nothing', () => {
    const state = carrying({ 'iron-sword': 3, 'heartwood-blade': 1 });
    equip(state, registry, 'iron-sword');

    expect(values({ item: 'worn:mainhand' }, state, 'verb')).toEqual(['grow', 'unequip', 'destroy', LEAVE]);
    expect(values({ item: 'iron-sword' }, state, 'verb')).toEqual(['grow', 'equip', 'destroy', LEAVE]);
    expect(values({ item: 'heartwood-blade' }, state, 'verb')).toEqual(['grow', 'equip', 'destroy', LEAVE]);
  });

  it('offers Unequip to the very copy in the slot and Equip to the one beside it', () => {
    const state = withGrownBlade();
    equip(state, registry, '1');

    expect(values({ item: '1' }, state, 'verb')).toEqual(['grow', 'unequip', 'destroy', LEAVE]);
    expect(values({ item: 'heartwood-blade' }, state, 'verb')).toEqual(['grow', 'equip', 'destroy', LEAVE]);
  });

  it('publishes the value that leaves beside every question, empty hands included', () => {
    const state = withGrownBlade();

    expect(values({}, carrying({}), 'item')).toEqual([LEAVE]);
    expect(last(values({}, state, 'item'))).toBe(LEAVE);
    expect(last(values({ item: '1' }, state, 'verb'))).toBe(LEAVE);
    expect(values({ item: '1', verb: 'destroy' }, state, 'confirm')).toEqual([CONFIRMED, LEAVE]);
  });

  it('asks a grown copy’s destruction once more, naming the copy, and asks a stack nothing', () => {
    const state = withGrownBlade();

    const confirm = last(carriedOptions({ item: '1', verb: 'destroy' }, state, registry));

    expect(confirm?.key).toBe('confirm');
    expect(confirm?.label).toBe('Destroy Modified Heartwood Blade for good?');
    expect(confirm?.values?.map((choice) => choice.value)).toEqual([CONFIRMED, LEAVE]);
    expect(carriedOptions({ item: 'heartwood-blade', verb: 'destroy' }, state, registry).map((option) => option.key)).toEqual(['item', 'verb']);
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
    expect(carriedSubmit({ item: '1', verb: LEAVE }, state, registry)).toBeNull();
    expect(carriedSubmit({ item: '1', verb: 'destroy', confirm: LEAVE }, state, registry)).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps the item it was answered with and asks the next question, rather than closing half-answered', () => {
    const state = carrying({ rope: 1 });

    expect(carriedSubmit({ item: 'rope' }, state, registry)).toEqual({ name: 'carried-items', answers: { item: 'rope' } });
    expect(carriedSubmit({ item: 'rope', verb: 'destroy' }, withGrownBlade(), registry)).toBeNull();
  });

  it('wears what equip names, through the one function equip: goes through', () => {
    const state = carrying({ 'iron-sword': 1 });

    expect(carriedSubmit({ item: 'iron-sword', verb: 'equip' }, state, registry)).toBeNull();
    expect(state.equipped).toEqual({ mainhand: 'iron-sword' });
  });

  it('wears a second copy off a row whose stack is short one already worn', () => {
    const state = carrying({ 'iron-sword': 3 });
    equip(state, registry, 'iron-sword');

    expect(carriedSubmit({ item: 'iron-sword', verb: 'equip' }, state, registry)).toBeNull();
    expect(state.equipped).toEqual({ mainhand: 'iron-sword' });
    expect(packedCount(state, 'iron-sword')).toBe(2);
  });

  it('takes off what unequip names, and empties the slot rather than the hands', () => {
    const state = carrying({ 'iron-sword': 1 });
    equip(state, registry, 'iron-sword');

    expect(carriedSubmit({ item: 'worn:mainhand', verb: 'unequip' }, state, registry)).toBeNull();
    expect(state.equipped).toEqual({});
    expect(packedCount(state, 'iron-sword')).toBe(1);
  });

  it('destroys a stack copy at once and a grown copy only once it is confirmed', () => {
    const state = withGrownBlade();

    expect(carriedSubmit({ item: 'heartwood-blade', verb: 'destroy' }, state, registry)).toBeNull();
    expect(packedCount(state, 'heartwood-blade')).toBe(1);

    expect(carriedSubmit({ item: '1', verb: 'destroy' }, state, registry)).toEqual({
      name: 'carried-items',
      answers: { item: '1', verb: 'destroy' },
    });
    expect(packedCount(state, 'heartwood-blade')).toBe(1);

    expect(carriedSubmit({ item: '1', verb: 'destroy', confirm: CONFIRMED }, state, registry)).toBeNull();
    expect(packedCount(state, 'heartwood-blade')).toBe(0);
  });

  it('opens the plane of the copy in the slot, and puts what growing it minted back on', () => {
    const state = withGrownBlade();
    Object.assign(state.inventory, { 'heartwood-blade': 3, whetstone: 1 });
    equip(state, registry, 'heartwood-blade');

    expect(carriedSubmit({ item: 'worn:mainhand', verb: 'grow' }, state, registry)).toEqual(planeFrame('worn:mainhand'));
    expect(feedItem(state, registry, 'worn:mainhand', 'whetstone')).toEqual({ ok: true, instance: '2' });
    expect(state.equipped).toEqual({ mainhand: '2' });
    expect(state.inventory['heartwood-blade']).toBe(2);
  });

  it('destroys the copy in the slot without reaching into the stack behind it', () => {
    const state = carrying({ 'iron-sword': 3 });
    equip(state, registry, 'iron-sword');

    expect(carriedSubmit({ item: 'worn:mainhand', verb: 'destroy' }, state, registry)).toBeNull();
    expect(state.equipped).toEqual({});
    expect(packedCount(state, 'iron-sword')).toBe(2);
  });

  it('does nothing for an answer naming what the player has stopped carrying', () => {
    const state = carrying({ rope: 1 });

    expect(carriedSubmit({ item: 'Rope x9', verb: 'destroy' }, state, registry)).toBeNull();
    expect(state.inventory).toEqual({ rope: 1 });
  });
});
