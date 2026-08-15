import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/registry';
import { midpoint } from '../grammar/range';
import { applyClusterEffect } from './clusterEffect';
import { ORIGIN } from './clusterPlane';
import { equip } from './equipment';
import { allocate, feedItem, Growth, itemInstance, itemTemplate } from './itemInstance';
import { itemContribution, StatContribution } from './itemContribution';
import { initialState } from './save';
import { statValue } from './stats';
import { GameState } from './state';
import { inEnglish } from './sayFixture';

const MODULE = `
# location camp
x: 0, y: 0
starting

# stat max-health
base: 30

# stat attack
base: 4

# passive hale
+10 max-health

# passive vigorous
+10% max-health

# passive keen
+4 attack

# cluster-jewel twin
shape: spindle
open-connections: e
passives: 1 hale, 2 vigorous, 3 keen

# item blade
slot: mainhand
origin-cluster: twin

# item plated-blade
slot: mainhand
origin-cluster: twin
+10 max-health
+2 attack

# item broad-blade
slot: mainhand
+5-9 max-health

# item charm
slot: mainhand
+2 attack

# item lesser-orb
cluster-effect: +25% max-health

# item whetstone
item-experience: 1000
`;

const registry = loadModule(MODULE);

function ok(outcome: Growth): string {
  if (!outcome.ok) throw new Error(inEnglish(registry, outcome.refused));
  return outcome.instance;
}

function carrying(inventory: Record<string, number>): GameState {
  const state = initialState(registry);
  Object.assign(state.inventory, inventory);
  return state;
}

// One copy, fed a level per position it spends one on plus a spare, with those
// positions allocated in the origin cluster.
function grown(itemId: string, positions: number[], extra: Record<string, number> = {}): GameState {
  const state = carrying({ [itemId]: 1, whetstone: positions.length + 1, ...extra });
  let target = ok(feedItem(state, registry, itemId, 'whetstone'));
  for (let fed = 0; fed < positions.length; fed++) target = ok(feedItem(state, registry, target, 'whetstone'));
  for (const position of positions) ok(allocate(state, registry, target, { hex: ORIGIN, kind: 'position', position }));
  return state;
}

function contribution(state: GameState, id: string): StatContribution[] {
  const item = registry.items.get(itemTemplate(state, id));
  if (!item) throw new Error(`no item behind ${id}`);
  return itemContribution(registry, item, itemInstance(state, id));
}

const on = (contributions: StatContribution[], statId: string): StatContribution =>
  contributions.find((each) => each.statId === statId) ?? { statId, added: { min: 0, max: 0 }, increased: 0 };

describe('itemContribution', () => {
  it('gives one entry per stat, summing every payload that names it', () => {
    expect(contribution(grown('blade', [2, 3]), '1')).toEqual([
      { statId: 'attack', added: { min: 4, max: 4 }, increased: 0 },
      { statId: 'max-health', added: { min: 10, max: 10 }, increased: 10 },
    ]);
  });

  it("folds the item's own tags into the same entries its plane lands in", () => {
    expect(contribution(grown('plated-blade', [2, 3]), '1')).toEqual([
      { statId: 'attack', added: { min: 6, max: 6 }, increased: 0 },
      { statId: 'max-health', added: { min: 20, max: 20 }, increased: 10 },
    ]);
  });

  it('states the effective payload, scaled by what its cluster made it worth', () => {
    const state = grown('blade', [2, 3], { 'lesser-orb': 1 });
    ok(applyClusterEffect(state, registry, '1', 'lesser-orb', ORIGIN));

    expect(contribution(state, '1')).toEqual([
      { statId: 'attack', added: { min: 4, max: 4 }, increased: 0 },
      { statId: 'max-health', added: { min: 12.5, max: 12.5 }, increased: 12.5 },
    ]);
  });

  it('keeps a range payload a range rather than collapsing it', () => {
    expect(itemContribution(registry, registry.items.get('broad-blade')!, undefined)).toEqual([{ statId: 'max-health', added: { min: 5, max: 9 }, increased: 0 }]);
  });

  it("reads a stack copy off the item's default plane, so carrying one answers before it is grown", () => {
    const item = registry.items.get('blade')!;
    expect(itemContribution(registry, item, undefined)).toEqual(contribution(grown('blade', []), '1'));
    expect(itemContribution(registry, item, undefined)).toEqual([{ statId: 'max-health', added: { min: 10, max: 10 }, increased: 0 }]);
  });

  it('answers with an item that has no plane at all, from its tags alone', () => {
    expect(itemContribution(registry, registry.items.get('charm')!, undefined)).toEqual([{ statId: 'attack', added: { min: 2, max: 2 }, increased: 0 }]);
  });
});

describe('the stat fold spends what this fold assembled', () => {
  it('moves a worn stat by exactly the contribution published for it', () => {
    const state = grown('plated-blade', [2, 3], { 'lesser-orb': 1 });
    ok(applyClusterEffect(state, registry, '1', 'lesser-orb', ORIGIN));
    equip(state, registry, '1');

    for (const statId of ['attack', 'max-health']) {
      const worth = on(contribution(state, '1'), statId);
      const base = registry.stats.get(statId)!.base;
      expect(statValue(statId, state, registry)).toBeCloseTo((midpoint(base) + midpoint(worth.added)) * (1 + worth.increased / 100), 10);
    }
  });

  it('spends a worn stack copy through the same answer', () => {
    const state = carrying({ blade: 1 });
    equip(state, registry, 'blade');

    const worth = on(itemContribution(registry, registry.items.get('blade')!, undefined), 'max-health');
    expect(statValue('max-health', state, registry)).toBeCloseTo((30 + midpoint(worth.added)) * (1 + worth.increased / 100), 10);
  });
});
