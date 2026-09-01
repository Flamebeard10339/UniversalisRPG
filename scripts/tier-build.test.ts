import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { fixtureSources } from '../src/content/worldFixture';
import { planeClusters, pointsSpent, type Plane } from '../src/runtime/clusterPlane';
import { equip } from '../src/runtime/equipment';
import { itemLevel, receiveItem, type ItemInstance } from '../src/runtime/itemInstance';
import { initialState } from '../src/runtime/save';
import { skillLevel } from '../src/runtime/skills';
import { activitiesIn, poolForTier } from './lib/tiers';
import { buildTier, evenlySpent, handedOver, parseTierArgs, tierLines } from './tier-build';

const shipped = loadUniverseWithDiagnostics(fixtureSources()).registry;
const activities = activitiesIn(shipped);
const combat = activities.find((each) => each.skills.length > 1)!;
const fishing = activities.find((each) => each.skills.length === 1)!;

describe('what a gear list may say', () => {
  it('hands over one of a thing, or the stock a count asks for', () => {
    expect(handedOver('core.bread')).toEqual({ item: 'core.bread', count: 1 });
    expect(handedOver('core.bread:300')).toEqual({ item: 'core.bread', count: 300 });
  });

  it('refuses a stock that is not a count, rather than handing over one of the thing', () => {
    expect(() => handedOver('core.bread:none')).toThrow(/whole number/);
    expect(() => handedOver('core.bread:0')).toThrow(/whole number/);
  });

  it('wants an activity and a level, and a level that is one', () => {
    expect(parseTierArgs(['combat', '10'])).toMatchObject({ activity: 'combat', level: 10, items: [], grow: [] });
    expect(() => parseTierArgs(['combat'])).toThrow(/name an activity and a level/);
    expect(() => parseTierArgs(['combat', 'ten'])).toThrow(/whole number/);
  });

  it('reads the gear before --grow and the stats after it', () => {
    expect(parseTierArgs(['combat', '10', 'core.bread', '--grow', 'core.attack', 'core.max-health'])).toMatchObject({
      items: ['core.bread'],
      grow: ['core.attack', 'core.max-health'],
    });
    expect(() => parseTierArgs(['combat', '10', '--grow'])).toThrow(/at least one stat/);
  });

  it('will not grow toward something the world declares no stat for', () => {
    const asked = tierLines(shipped, { activity: combat.id, level: 20, items: [], grow: ['nothing.declares-this'], list: false });
    expect(asked.ok).toBe(false);
    expect(asked.lines.join('\n')).toMatch(/nothing\.declares-this/);
  });
});

describe('what a tier has climbed', () => {
  it('spends the whole pool and nothing more, across exactly the activity\'s own skills', () => {
    const spent = evenlySpent(combat, 12);
    expect(Object.keys(spent).sort()).toEqual([...combat.skills].sort());
    expect(Object.values(spent).reduce((total, each) => total + each, 0)).toBe(poolForTier(combat, 12));
  });

  it('leaves every skill of the activity standing at the tier, which is what an even split means', () => {
    for (const level of [1, 10, 20]) {
      for (const [skill, earned] of Object.entries(evenlySpent(combat, level))) {
        expect(skillLevel(earned), skill).toBe(level);
      }
    }
  });
});

describe('a build wears what the world lets it wear', () => {
  const KIT = ['core.jerkin', 'fixture-town.ledger'];

  it('takes the gated piece only at the tier that has earned it, and says why where it does not', () => {
    const under = buildTier(shipped, fishing, 1, KIT);
    const over = buildTier(shipped, fishing, 10, KIT);
    expect(under.worn.find((each) => each.item === 'fixture-town.ledger')?.refused).toMatch(/Ledger/);
    expect(over.worn.find((each) => each.item === 'fixture-town.ledger')?.refused).toBeUndefined();
    expect(under.worn.find((each) => each.item === 'core.jerkin')?.refused).toBeUndefined();
  });

  it('wears a thing that arrives as a copy of its own under the id the engine minted for it', () => {
    const built = buildTier(shipped, fishing, 20, ['core.leather-gloves']);
    expect(built.worn[0]?.refused).toBeUndefined();
    expect(built.save).toMatch(/"gloves":"\d+"/);
  });
});

describe('a build spends the points its gear dropped with', () => {
  const KIT = ['core.heavy-spade'];
  const JEWELS = ['core.keen-edge-jewel:20', 'core.stout-heart-jewel:20'];

  interface Saved {
    equipped?: Record<string, string>;
    instances?: { byId: Record<string, { template: string; payload: ItemInstance }> };
  }

  const saved = (build: { save: string }): Saved => JSON.parse(build.save) as Saved;
  const planesIn = (build: { save: string }): Plane[] => Object.values(saved(build).instances?.byId ?? {}).map((row) => row.payload.plane);

  it('leaves every plane as it dropped without --grow, which is what the invocations that predate it still mean', () => {
    const built = buildTier(shipped, combat, 20, [...KIT, ...JEWELS]);
    expect(built.grown).toBeUndefined();
    for (const plane of planesIn(built)) expect(pointsSpent(plane)).toBe(0);
  });

  it('spends them with --grow, and the stat it was pointed at is higher for it', () => {
    const built = buildTier(shipped, combat, 20, [...KIT, ...JEWELS], ['core.attack']);
    expect(built.grown!.spent).toBeGreaterThan(0);
    expect(built.grown!.after['core.attack']!).toBeGreaterThan(built.grown!.before['core.attack']!);
  });

  it('sockets only what it was handed, so a plane never grows a cluster out of nothing', () => {
    const empty = buildTier(shipped, combat, 20, KIT, ['core.attack']);
    for (const plane of planesIn(empty)) expect(planeClusters(plane).length).toBe(1);
    expect(planesIn(buildTier(shipped, combat, 20, [...KIT, ...JEWELS], ['core.attack'])).some((plane) => planeClusters(plane).length > 1)).toBe(true);
  });

  it('reads the stats in the order they were named', () => {
    const forAttack = buildTier(shipped, combat, 20, [...KIT, ...JEWELS], ['core.attack', 'core.max-health']);
    const forHealth = buildTier(shipped, combat, 20, [...KIT, ...JEWELS], ['core.max-health', 'core.attack']);
    expect(forAttack.grown!.after['core.attack']!).toBeGreaterThanOrEqual(forHealth.grown!.after['core.attack']!);
    expect(forHealth.grown!.after['core.max-health']!).toBeGreaterThanOrEqual(forAttack.grown!.after['core.max-health']!);
    expect(JSON.stringify(forAttack.grown!.after), 'asking the opposite question changed nothing').not.toEqual(JSON.stringify(forHealth.grown!.after));
  });

  it('accounts for every point the gear on the body dropped with', () => {
    const built = buildTier(shipped, combat, 20, [...KIT, ...JEWELS], ['core.attack']);
    const sheet = saved(built);
    let budget = 0;
    let spent = 0;
    for (const id of Object.values(sheet.equipped ?? {})) {
      const row = sheet.instances?.byId[id];
      if (!row) continue;
      budget += itemLevel(row.payload, shipped.items.get(row.template)!);
      spent += pointsSpent(row.payload.plane);
    }
    expect(built.grown!.spent + built.grown!.unspent).toBe(budget);
    expect(built.grown!.spent).toBe(spent);
  });
});
describe('the doors a build is put together through', () => {
  it('are the engine\'s own, so a build cannot hold what a player could not', () => {
    const state = initialState(shipped);
    receiveItem(state, shipped, 'core.heavy-spade', 1);
    const [minted = 'core.heavy-spade'] = Object.keys(state.instances.byId);
    expect(String(equip(state, shipped, minted))).toMatch(/Heavy Spade/);
    expect(state.equipped['main-hand']).toBeUndefined();
  });
});
