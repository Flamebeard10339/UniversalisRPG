import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/registry';
import { applyClusterEffect, instancePayloads } from './clusterEffect';
import { Hex } from '../content/hex';
import { clusterAt, ORIGIN } from './clusterPlane';
import { equip } from './equipment';
import { allocate, feedItem, Growth, itemInstance, slotJewel } from './itemInstance';
import { initialState } from './save';
import { hitDamage, statValue } from './stats';
import { GameState } from './state';

const MODULE = `
# location camp
x: 0, y: 0
starting

# stat max-health
base: 30

# stat attack
base: 4

# stat dr

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

# cluster-jewel node
shape: point
open-connections: e
passives: 1 hale

# cluster-jewel spark
shape: point
open-connections: e
passives: 1 vigorous

# cluster-jewel quad
shape: ring
open-connections: e
passives: 1 hale, 2 hale, 3 hale, 4 hale

# cluster-jewel tight
shape: point
open-connections: e
passives: 1 hale
mod-slots: 1

# item blade
slot: mainhand
origin-cluster: twin

# item plated-blade
slot: mainhand
origin-cluster: twin
+10 max-health

# item chain-blade
slot: mainhand
origin-cluster: node

# item spark-blade
slot: mainhand
origin-cluster: spark

# item wide-blade
slot: mainhand
origin-cluster: quad

# item tight-blade
slot: mainhand
origin-cluster: tight

# item node-jewel
cluster-jewel: node

# item lesser-orb
cluster-effect: +25% max-health

# item greater-orb
cluster-effect: +25% max-health

# item third-orb
cluster-effect: +25% max-health

# item goad
cluster-effect: +50% attack

# item whetstone
item-experience: 1000
`;

const registry = loadModule(MODULE);

const AT_E: Hex = { q: 1, r: 0 };

function ok(outcome: Growth): string {
  if (!outcome.ok) throw new Error(outcome.refused);
  return outcome.instance;
}

function carrying(inventory: Record<string, number>): GameState {
  const state = initialState(registry);
  Object.assign(state.inventory, inventory);
  return state;
}

// One copy, fed a level per position it is about to spend one on plus a
// spare, with those positions allocated in the origin cluster.
function grown(itemId: string, positions: number[], extra: Record<string, number> = {}): GameState {
  const state = carrying({ [itemId]: 1, whetstone: positions.length + 1, ...extra });
  let target = ok(feedItem(state, registry, itemId, 'whetstone'));
  for (let fed = 0; fed < positions.length; fed++) target = ok(feedItem(state, registry, target, 'whetstone'));
  for (const position of positions) ok(allocate(state, registry, target, { hex: ORIGIN, kind: 'position', position }));
  return state;
}

function wearing(itemId: string, positions: number[], extra: Record<string, number> = {}): GameState {
  const state = grown(itemId, positions, extra);
  equip(state, registry, '1');
  return state;
}

function apply(state: GameState, effects: string[], hex: Hex = ORIGIN): Growth {
  let last: Growth = { ok: true, instance: '1' };
  for (const effect of effects) last = applyClusterEffect(state, registry, '1', effect, hex);
  return last;
}

const health = (state: GameState): number => statValue('max-health', state, registry);

describe('applying a cluster effect', () => {
  it('consumes the item and records it against the cluster it was used on', () => {
    const state = wearing('blade', [2], { 'lesser-orb': 1 });
    expect(applyClusterEffect(state, registry, '1', 'lesser-orb', ORIGIN)).toEqual({ ok: true, instance: '1' });

    expect(state.inventory['lesser-orb']).toBe(0);
    expect(clusterAt(itemInstance(state, '1')!.plane, ORIGIN)!.effects).toEqual(['lesser-orb']);
  });

  it('leaves the orb a stack and mints no second instance for it', () => {
    const state = wearing('blade', [2], { 'lesser-orb': 3 });
    apply(state, ['lesser-orb']);

    expect(state.inventory['lesser-orb']).toBe(2);
    expect(Object.values(state.instances.byId).map((row) => row.template)).toEqual(['blade']);
  });

  it('refuses an item carrying no cluster effect, with the item intact', () => {
    const state = wearing('blade', [2], { 'node-jewel': 1 });
    expect(applyClusterEffect(state, registry, '1', 'node-jewel', ORIGIN)).toEqual({ ok: false, refused: 'node-jewel carries no cluster effect' });
    expect(state.inventory['node-jewel']).toBe(1);
  });

  it('refuses a hex no cluster stands in, with the item intact', () => {
    const state = wearing('blade', [2], { 'lesser-orb': 1 });
    expect(applyClusterEffect(state, registry, '1', 'lesser-orb', AT_E)).toEqual({ ok: false, refused: 'no cluster stands in 1,0' });
    expect(state.inventory['lesser-orb']).toBe(1);
  });

  it('refuses the effect once the cluster fills its mod slots, with the item intact', () => {
    const state = wearing('blade', [2], { 'lesser-orb': 1, 'greater-orb': 1, 'third-orb': 1 });
    apply(state, ['lesser-orb', 'greater-orb']);

    expect(applyClusterEffect(state, registry, '1', 'third-orb', ORIGIN)).toEqual({ ok: false, refused: 'the cluster at 0,0 fills all 2 of its mod slots' });
    expect(state.inventory['third-orb']).toBe(1);
    expect(clusterAt(itemInstance(state, '1')!.plane, ORIGIN)!.effects).toEqual(['lesser-orb', 'greater-orb']);
  });

  it('reads the capacity off the jewel, so one that declares a single slot holds one', () => {
    const state = wearing('tight-blade', [], { 'lesser-orb': 1, 'greater-orb': 1 });
    apply(state, ['lesser-orb']);

    expect(applyClusterEffect(state, registry, '1', 'greater-orb', ORIGIN)).toEqual({ ok: false, refused: 'the cluster at 0,0 fills all 1 of its mod slots' });
    expect(state.inventory['greater-orb']).toBe(1);
  });

  it('refuses the same effect item twice on one cluster, because a plane holding a repeat cannot reload', () => {
    const state = wearing('blade', [2], { 'lesser-orb': 2 });
    apply(state, ['lesser-orb']);

    expect(applyClusterEffect(state, registry, '1', 'lesser-orb', ORIGIN)).toEqual({ ok: false, refused: 'the cluster at 0,0 already carries lesser-orb' });
    expect(state.inventory['lesser-orb']).toBe(1);
  });

  it('grows a stack copy into an instance the way every other verb does', () => {
    const state = carrying({ blade: 2, 'lesser-orb': 1 });
    expect(applyClusterEffect(state, registry, 'blade', 'lesser-orb', ORIGIN)).toEqual({ ok: true, instance: '1' });
    expect(state.inventory).toEqual({ blade: 1, 'lesser-orb': 0 });
  });

  // c15: never to a jewel in inventory. A jewel declares no `slot:`, so it is
  // not a base and has no plane for the effect to be recorded against — and
  // both items survive, still stackable and still usable for what they are.
  it('refuses a jewel in inventory as its target, leaving both items stacked and uninstanced', () => {
    const state = carrying({ 'node-jewel': 3, 'lesser-orb': 1 });
    expect(applyClusterEffect(state, registry, 'node-jewel', 'lesser-orb', ORIGIN)).toEqual({ ok: false, refused: 'node-jewel is not a base: only an item you can wear has a plane to grow' });

    expect(state.inventory).toEqual({ 'node-jewel': 3, 'lesser-orb': 1 });
    expect(state.instances.byId).toEqual({});
  });

  // c9's orb third of "a consumable, a jewel and an orb have no plane": an
  // orb declares no `slot:` either, so it is exactly as inert a target as the
  // jewel case above.
  it('refuses an orb in inventory as its target, leaving both items stacked and uninstanced', () => {
    const state = carrying({ 'lesser-orb': 1, 'greater-orb': 1 });
    expect(applyClusterEffect(state, registry, 'lesser-orb', 'greater-orb', ORIGIN)).toEqual({ ok: false, refused: 'lesser-orb is not a base: only an item you can wear has a plane to grow' });

    expect(state.inventory).toEqual({ 'lesser-orb': 1, 'greater-orb': 1 });
    expect(state.instances.byId).toEqual({});
  });
});

describe('the worked case the reader will check', () => {
  const pinned = (effects: string[]): number => {
    const state = wearing('blade', [2], { 'lesser-orb': 1, 'greater-orb': 1 });
    apply(state, effects);
    return health(state);
  };

  it('evaluates (30 + 10) x 1.10 with nothing else in play', () => {
    expect(pinned([])).toBeCloseTo(44, 10);
  });

  it('evaluates (30 + 12.5) x 1.125 under one 25% effect', () => {
    expect(pinned(['lesser-orb'])).toBeCloseTo(47.8125, 10);
  });

  it('evaluates (30 + 15) x 1.15 under two, and not the 52.75 multiplying them would give', () => {
    expect(pinned(['lesser-orb', 'greater-orb'])).toBeCloseTo(51.75, 10);
    expect(pinned(['lesser-orb', 'greater-orb'])).not.toBeCloseTo(52.75, 2);
  });
});

describe('an effect scales a payload without moving it between channels', () => {
  it('scales a flat payload in the added channel', () => {
    const state = wearing('chain-blade', [], { 'lesser-orb': 1 });
    apply(state, ['lesser-orb']);
    expect(health(state)).toBeCloseTo(42.5, 10);
  });

  it('scales a percent payload in the increased channel, where it multiplies the base', () => {
    const state = wearing('spark-blade', [], { 'lesser-orb': 1 });
    apply(state, ['lesser-orb']);
    expect(health(state)).toBeCloseTo(33.75, 10);
  });
});

describe('an effect stops at its cluster and a percent payload does not', () => {
  // The origin's node cluster and the one slotted east of it both carry hale.
  const twoClusters = (): GameState => {
    const state = carrying({ 'chain-blade': 1, 'node-jewel': 1, 'lesser-orb': 1, whetstone: 3 });
    let target = ok(feedItem(state, registry, 'chain-blade', 'whetstone'));
    for (let fed = 1; fed < 3; fed++) target = ok(feedItem(state, registry, target, 'whetstone'));
    ok(allocate(state, registry, target, { hex: ORIGIN, kind: 'slot', direction: 'e' }));
    ok(slotJewel(state, registry, target, 'node-jewel', ORIGIN, 'e'));
    ok(allocate(state, registry, target, { hex: AT_E, kind: 'position', position: 1 }));
    equip(state, registry, target);
    return state;
  };

  it('leaves an identical passive in another cluster at its declared value', () => {
    const state = twoClusters();
    expect(health(state)).toBeCloseTo(50, 10);

    apply(state, ['lesser-orb']);
    expect(health(state)).toBeCloseTo(52.5, 10);
    expect(instancePayloads(registry, itemInstance(state, '1')!).map((payload) => payload.scale)).toEqual([1.25, 1]);
  });

  it("lets a payload percent multiply the equipped item's own flat bonus, which the effect never touches", () => {
    const state = wearing('plated-blade', [2], { 'lesser-orb': 1 });
    expect(health(state)).toBeCloseTo(55, 10);

    apply(state, ['lesser-orb']);
    expect(health(state)).toBeCloseTo(59.0625, 10);
  });

  it("scales only the payloads naming the effect's stat", () => {
    const state = wearing('blade', [2, 3], { goad: 1 });
    apply(state, ['goad']);

    expect(health(state)).toBeCloseTo(44, 10);
    expect(statValue('attack', state, registry)).toBeCloseTo(10, 10);
  });
});

describe('what the runtime reports', () => {
  it('rounds no payload, so four scaled +10s are worth 50 and never 48', () => {
    const state = wearing('wide-blade', [2, 3, 4], { 'lesser-orb': 1 });
    apply(state, ['lesser-orb']);

    expect(health(state)).toBeCloseTo(80, 10);
    expect(instancePayloads(registry, itemInstance(state, '1')!)).toHaveLength(4);
  });

  it('hands the fold the declared bonus and the factor, leaving one place that multiplies one', () => {
    const state = wearing('chain-blade', [], { 'lesser-orb': 1 });
    apply(state, ['lesser-orb']);

    expect(instancePayloads(registry, itemInstance(state, '1')!)).toEqual([
      { node: { hex: ORIGIN, kind: 'position', position: 1 }, statId: 'max-health', bonus: { kind: 'stat-bonus', statId: 'max-health', percent: false, amount: { min: 10, max: 10 } }, scale: 1.25 },
    ]);
  });
});

describe('a worn stack contributes its cluster jewel\'s free root passive', () => {
  it('grants the same passive before and after a feed that spends no point', () => {
    const state = carrying({ 'chain-blade': 1, whetstone: 1 });
    equip(state, registry, 'chain-blade');
    expect(health(state)).toBeCloseTo(40, 10);

    ok(feedItem(state, registry, 'chain-blade', 'whetstone'));
    expect(health(state)).toBeCloseTo(40, 10);
  });
});

describe("a plane's contribution reaches combat", () => {
  it('moves outgoing damage when a passive is allocated', () => {
    const bare = wearing('blade', [2]);
    const keen = wearing('blade', [2, 3]);

    expect(statValue('attack', bare, registry)).toBe(4);
    expect(statValue('attack', keen, registry)).toBe(8);
    expect(hitDamage(statValue('attack', keen, registry), 0, registry)).toBeGreaterThan(hitDamage(statValue('attack', bare, registry), 0, registry));
  });

  it('is inert while the player is not wearing the instance', () => {
    const state = grown('blade', [2]);
    expect(health(state)).toBe(30);
    expect(statValue('attack', state, registry)).toBe(4);

    equip(state, registry, '1');
    expect(health(state)).toBeCloseTo(44, 10);
  });
});
