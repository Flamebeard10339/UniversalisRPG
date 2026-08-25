import { describe, expect, it } from 'vitest';
import { characterHooks } from './hooks';
import { loadModule } from '../content/load';
import { midpoint } from '../grammar/range';
import { applyClusterEffect } from './clusterEffect';
import { ORIGIN } from './clusterPlane';
import { equip } from './equipment';
import { allocate, Growth, itemInstance, itemTemplate, receiveItem } from './itemInstance';
import { itemContribution, StatContribution } from './itemContribution';
import { restorePools } from './effects';
import { initialState } from './save';
import { counterLevels, statValue } from './stats';
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

// The two shapes a payload takes that a flat one does not: a magnitude paid per
// point of a live counter, and a block answering a moment.
# passive raging
+5% attack per fury
on hit: restore: 1 fury

# stat max-fury
base: 10

# resource fury
max: max-fury
start: 0

# cluster-jewel twin
shape: spindle
open-connections: e
passives: 1 hale, 2 vigorous, 3 keen

# cluster-jewel goad
shape: spindle
open-connections: e
passives: 1 hale, 2 raging

# item blade
slot: mainhand
item-level: 20
origin-cluster: twin

# item plated-blade
slot: mainhand
item-level: 20
origin-cluster: twin
+10 max-health
+2 attack

# item goading-blade
slot: mainhand
item-level: 20
origin-cluster: goad

# item broad-blade
slot: mainhand
+5-9 max-health

# item charm
slot: mainhand
+2 attack

# item lesser-orb
cluster-effect: +25% max-health

# item edge-orb
cluster-effect: +25% attack

`;

const registry = loadModule(MODULE);

function ok(outcome: Growth): string {
  if (!outcome.ok) throw new Error(inEnglish(registry, outcome.refused));
  return outcome.instance;
}

function carrying(holdings: Record<string, number>): GameState {
  const state = initialState(registry);
  for (const [id, count] of Object.entries(holdings)) receiveItem(state, registry, id, count);
  return state;
}

function grown(itemId: string, positions: number[], extra: Record<string, number> = {}): GameState {
  const state = carrying({ [itemId]: 1, ...extra });
  for (const position of positions) ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position }));
  return state;
}

function contribution(state: GameState, id: string): StatContribution[] {
  const item = registry.items.get(itemTemplate(state, id));
  if (!item) throw new Error(`no item behind ${id}`);
  return itemContribution(registry, item, itemInstance(state, id), counterLevels(state));
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

  it('reads a template with no copy behind it off its own tags alone, since the plane belongs to the copy', () => {
    const item = registry.items.get('plated-blade')!;
    expect(itemContribution(registry, item, undefined)).toEqual([
      { statId: 'attack', added: { min: 2, max: 2 }, increased: 0 },
      { statId: 'max-health', added: { min: 10, max: 10 }, increased: 0 },
    ]);
  });

  it('answers with an item that has no plane at all, from its tags alone', () => {
    expect(itemContribution(registry, registry.items.get('charm')!, undefined)).toEqual([{ statId: 'attack', added: { min: 2, max: 2 }, increased: 0 }]);
  });
});

describe('a plane payload paid per counter', () => {
  const raging = (fury: number): GameState => {
    const state = grown('goading-blade', [2]);
    equip(state, registry, '1');
    restorePools(state, { fury: fury * 1000 });
    return state;
  };

  it('is worth nothing while the counter is empty', () => {
    expect(on(contribution(raging(0), '1'), 'attack')).toEqual({ statId: 'attack', added: { min: 0, max: 0 }, increased: 0 });
  });

  it('is worth its declared magnitude once per point held', () => {
    expect(on(contribution(raging(3), '1'), 'attack').increased).toBe(15);
    expect(statValue('attack', raging(3), registry)).toBeCloseTo(4 * 1.15, 10);
  });

  it('multiplies the counter by what its cluster made it worth, not instead of it', () => {
    const state = raging(3);
    state.inventory['edge-orb'] = 1;
    ok(applyClusterEffect(state, registry, '1', 'edge-orb', ORIGIN));
    expect(on(contribution(state, '1'), 'attack').increased).toBeCloseTo(5 * 3 * 1.25, 10);
  });
});

describe('a passive standing on a spent point', () => {
  it("answers a moment for whoever wears the copy, and does not once the copy comes off", () => {
    const state = grown('goading-blade', [2]);
    expect(characterHooks(state, registry, 'player', 'onHit')).toEqual([]);

    equip(state, registry, '1');
    expect(characterHooks(state, registry, 'player', 'onHit')).toEqual([[{ kind: 'pool', resource: 'fury', delta: { min: 1, max: 1 } }]]);
  });

  it('is silent while its point is unspent, though the position stands in the plane', () => {
    const state = grown('goading-blade', []);
    equip(state, registry, '1');
    expect(characterHooks(state, registry, 'player', 'onHit')).toEqual([]);
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

  it('spends a worn copy that has spent no point through the same answer', () => {
    const state = carrying({ blade: 1 });
    equip(state, registry, '1');

    const worth = on(contribution(state, '1'), 'max-health');
    expect(statValue('max-health', state, registry)).toBeCloseTo((30 + midpoint(worth.added)) * (1 + worth.increased / 100), 10);
  });
});
