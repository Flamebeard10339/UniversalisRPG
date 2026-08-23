import { describe, expect, it } from 'vitest';
import { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { loadUniverse } from '../content/load';
import { shippedSources } from '../content/shipped';
import { carriedEntries } from './carried';
import { equip, unequip } from './equipment';
import { feedItem, packRows, stockItem } from './itemInstance';
import { initialState, loadSave, SAVE_VERSION } from './save';
import { parseSaveSection } from '../content/sections/save';
import { applyDirective, startSession, view } from './session';
import { buy, buyProblem, sell, sellProblem, shopOf } from './trade';
import { inventorySlots } from './tuning';
import { createGameState, GameState } from './state';

const world = (slots: string): string => `
# variable inventory-slots
${slots}

# stat max-health

# resource health
max: max-health

# item pebble
title: pebble
value: 1

# item twig
title: twig
value: 1

# item stone
title: stone
value: 1

# item coin
title: coin

# item blade
title: blade
slot: mainhand
max-level: 10

# item whetstone
title: whetstone
item-experience: 1000

# action gather
title: gather
continuous
time: 1
give: 1 pebble
give: 1 twig
give: 1 stone

# shop quarry
coin: coin
buying: 1
selling: 1
stocks: 10 stone
replenish: 60s

# entity player
stats: max-health 10
equipment-slots: mainhand
uses: gather

# entity mason
title: mason
keeps shop: quarry

# location camp
x: 0, y: 0
starting
entities: mason
`;

const twoSlots = (): Registry => loadInEnglish(world('value: 2'));
const noLimit = (): Registry => loadInEnglish(world('value: 0'));

function standing(registry: Registry): GameState {
  const state = initialState(registry);
  return state;
}

const shown = (state: GameState, registry: Registry): string[] => carriedEntries(state, registry).map((entry) => entry.shown);

describe('how many things the pack holds', () => {
  it('is 0 to the engine, which holds no number of its own, and something the shipped world declares for itself', () => {
    expect(inventorySlots(loadInEnglish('# location camp\nx: 0, y: 0\nstarting\n'))).toBe(0);
    expect(inventorySlots(loadUniverse(shippedSources()))).toBeGreaterThan(0);
  });

  it('takes a 3rd kind of thing where a 2-slot world refuses it, which is the whole of what a limitless pack is', () => {
    const limited = twoSlots();
    const bounded = standing(limited);
    for (const item of ['pebble', 'twig', 'stone']) stockItem(bounded, limited, item, 1);
    expect(packRows(bounded).length).toBe(2);

    const endless = noLimit();
    const open = standing(endless);
    for (const item of ['pebble', 'twig', 'stone']) stockItem(open, endless, item, 1);
    expect(packRows(open).length).toBe(3);
  });

  it('takes a 500th pebble onto a stack it already holds with both its 2 slots spent, since a stack is one slot however deep', () => {
    const registry = twoSlots();
    const state = standing(registry);
    stockItem(state, registry, 'pebble', 1);
    stockItem(state, registry, 'twig', 1);

    expect(stockItem(state, registry, 'pebble', 499)).toBe(499);
    expect(state.inventory.pebble).toBe(500);
    expect(packRows(state).length).toBe(2);
  });

  it('counts one row per line the carried sheet draws for the pack, so what a player counts and what the engine counts are one list', () => {
    const registry = noLimit();
    const state = standing(registry);
    stockItem(state, registry, 'pebble', 4);
    stockItem(state, registry, 'blade', 2);
    stockItem(state, registry, 'whetstone', 1);
    expect(feedItem(state, registry, 'blade', 'whetstone').ok).toBe(true);

    const rows = packRows(state);
    expect(rows.length).toBe(3);
    expect(shown(state, registry).slice(0, rows.length)).toEqual(['pebble x4', 'blade x1', 'Modified blade']);
  });

  it('does not count what is worn, which the sheet draws under its own heading', () => {
    const registry = twoSlots();
    const state = standing(registry);
    stockItem(state, registry, 'blade', 1);
    stockItem(state, registry, 'pebble', 1);
    expect(packRows(state).length).toBe(2);

    expect(equip(state, registry, 'blade')).toBe(true);
    expect(packRows(state).length).toBe(1);
    expect(shown(state, registry)).toEqual(['pebble x1', 'blade (Mainhand)']);
  });
});

describe('something arriving at a pack with no room', () => {
  it('leaves the 3rd find where it was, tells the player in words, and stops the action that found it', () => {
    const registry = twoSlots();
    const session = startSession(registry);
    applyDirective(session, { kind: 'until', inner: { kind: 'use', obj: 'entity', objId: 'player', actionId: 'gather' }, until: 'done' });

    const seen = view(session);
    expect(seen.carried.map((entry) => entry.shown)).toEqual(['pebble x1', 'twig x1']);
    expect(seen.said).toContain('Your pack is full, so the stone stays where it is.');
    expect(seen.said.some((line) => line.includes('stopped because your pack was full'))).toBe(true);
  });

  it('refuses to take a blade off, so the one thing worn is still worn and nothing is destroyed', () => {
    const registry = twoSlots();
    const state = standing(registry);
    stockItem(state, registry, 'blade', 1);
    equip(state, registry, 'blade');
    stockItem(state, registry, 'pebble', 1);
    stockItem(state, registry, 'twig', 1);

    expect(unequip(state, registry, 'mainhand')).toBe(false);
    expect(state.equipped).toEqual({ mainhand: 'blade' });
    expect(packRows(state).length).toBe(2);
  });

  it('refuses the purchase before the coin is taken, so 7 coins are still 7 coins', () => {
    const registry = twoSlots();
    const state = standing(registry);
    stockItem(state, registry, 'coin', 7);
    stockItem(state, registry, 'twig', 1);
    const quarry = shopOf(registry, 'quarry');

    expect(buyProblem(quarry, state, registry, 'stone', 1)).toBe('pack-full');
    expect(buy(quarry, state, registry, 'stone', 1)).toBe('pack-full');
    expect(state.inventory.coin).toBe(7);
    expect(state.inventory.stone ?? 0).toBe(0);
  });

  it('refuses the sale whose coin has nowhere to land, so the 4 stones are still carried', () => {
    const registry = twoSlots();
    const state = standing(registry);
    stockItem(state, registry, 'stone', 4);
    stockItem(state, registry, 'twig', 1);
    const quarry = shopOf(registry, 'quarry');

    expect(sellProblem(quarry, state, registry, 'stone', 1)).toBe('pack-full');
    expect(sell(quarry, state, registry, 'stone', 1)).toBe('pack-full');
    expect(state.inventory.stone).toBe(4);
  });

  it('refuses to grow 1 of 2 blades, which would stand beside the stack, and grows the last one, which replaces it', () => {
    const registry = twoSlots();
    const beside = standing(registry);
    stockItem(beside, registry, 'blade', 2);
    stockItem(beside, registry, 'whetstone', 1);
    expect(feedItem(beside, registry, 'blade', 'whetstone').ok).toBe(false);
    expect(packRows(beside).length).toBe(2);

    const replacing = standing(registry);
    stockItem(replacing, registry, 'blade', 1);
    stockItem(replacing, registry, 'whetstone', 1);
    expect(feedItem(replacing, registry, 'blade', 'whetstone').ok).toBe(true);
    expect(packRows(replacing).length).toBe(1);
  });
});

describe('a save holding more than the pack has room for', () => {
  it('loads all 3 rows into a 2-slot world rather than destroying one, and refuses only what arrives next', () => {
    const registry = twoSlots();
    const state = createGameState();
    loadSave(state, parseSaveSection({ kind: 'save', id: 'over-full', body: [{ text: JSON.stringify({ version: SAVE_VERSION, inventory: { pebble: 1, twig: 1, stone: 1 } }), span: { start: 0, end: 0 }, children: [] }], span: { start: 0, end: 0 } }), registry);

    expect(packRows(state).length).toBe(3);
    expect(stockItem(state, registry, 'coin', 1)).toBe(0);
    expect(packRows(state).length).toBe(3);
  });

  it('is not a case the shipped corpus reaches: every # save it holds sits inside the 28 the world declares', () => {
    const registry = loadUniverse(shippedSources());
    const slots = inventorySlots(registry);
    expect(registry.saves.size).toBeGreaterThan(0);
    const over: string[] = [];
    for (const [id, saved] of registry.saves) {
      const state = createGameState();
      loadSave(state, saved, registry);
      if (packRows(state).length > slots) over.push(`${id}: ${packRows(state).length}`);
    }
    expect(over).toEqual([]);
  });
});
