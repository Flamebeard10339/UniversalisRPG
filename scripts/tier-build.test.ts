import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { shippedSources } from '../src/content/shipped';
import { planeClusters, pointsSpent, type Plane } from '../src/runtime/clusterPlane';
import { equip, wearable } from '../src/runtime/equipment';
import { itemInstance, itemLevel, itemTemplate, receiveItem, type ItemInstance } from '../src/runtime/itemInstance';
import { initialState, loadSave } from '../src/runtime/save';
import { skillLevel } from '../src/runtime/skills';
import { createGameState } from '../src/runtime/state';
import { activitiesIn, poolForTier } from './lib/tiers';
import { buildTier, evenlySpent, handedOver, parseTierArgs, tierLines } from './tier-build';

const shipped = loadUniverseWithDiagnostics(shippedSources()).registry;
const activities = activitiesIn(shipped);
const combat = activities.find((each) => each.id === 'combat')!;
const fishing = activities.find((each) => each.id === 'fishing')!;

// Every reference build the corpus carries, found by the name it is filed under rather than listed
// here, so a tier added next month is held to the same claims by existing. A trailing word names
// what the pool was grown toward rather than a second activity -- `combat-tier-20-sustain` is the
// combat tier at twenty that bought recovery instead of a bigger swing -- so it is read off and
// dropped, and the claims below hold it to combat's skills like any other.
const TIER = /^tiers\.(.+)-tier-(\d+)(?:-[a-z]+)?$/;
const shippedTiers = [...shipped.saves.keys()].flatMap((id) => {
  const found = TIER.exec(id);
  return found ? [{ id, activity: found[1]!, level: Number(found[2]) }] : [];
});

describe('what a gear list may say', () => {
  it('hands over one of a thing, or the stock a count asks for', () => {
    expect(handedOver('fishing.dried-fish-bait')).toEqual({ item: 'fishing.dried-fish-bait', count: 1 });
    expect(handedOver('fishing.dried-fish-bait:300')).toEqual({ item: 'fishing.dried-fish-bait', count: 300 });
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
    const asked = tierLines(shipped, { activity: 'combat', level: 20, items: [], grow: ['combat.attack'], list: false });
    expect(asked.ok).toBe(false);
    expect(asked.lines.join('\n')).toMatch(/combat\.attack/);
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
  const KIT = ['fishing.small-fishing-net', 'fishing.large-fishing-net'];

  // The large net asks for a level and the small one asks for nothing, so the same list at two
  // tiers is the gate answering rather than anything here choosing.
  it('takes the gated piece only at the tier that has earned it, and says why where it does not', () => {
    const under = buildTier(shipped, fishing, 1, KIT);
    const over = buildTier(shipped, fishing, 10, KIT);
    expect(under.worn.find((each) => each.item === 'fishing.large-fishing-net')?.refused).toMatch(/Large Fishing Net/);
    expect(over.worn.find((each) => each.item === 'fishing.large-fishing-net')?.refused).toBeUndefined();
  });

  it('wears a thing that arrives as a copy of its own under the id the engine minted for it', () => {
    const built = buildTier(shipped, fishing, 20, ['fishing.horsehair-line']);
    expect(built.worn[0]?.refused).toBeUndefined();
    expect(built.save).toMatch(/"gloves":"\d+"/);
  });
});

describe('a build spends the points its gear dropped with', () => {
  // A blade with a plane in it, and two jewels that pull opposite ways. Which of them a build takes
  // is the whole question --grow answers, and nothing in the tool knows which is which.
  const KIT = ['combat.knights-sword'];
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

  // Not that the order pays more -- that it is read at all. Two builds asked opposite questions of
  // the same gear come back different, and neither is worse at its own question than the other is.
  it('reads the stats in the order they were named', () => {
    const forAttack = buildTier(shipped, combat, 20, [...KIT, ...JEWELS], ['core.attack', 'core.max-health']);
    const forHealth = buildTier(shipped, combat, 20, [...KIT, ...JEWELS], ['core.max-health', 'core.attack']);
    expect(forAttack.grown!.after['core.attack']!).toBeGreaterThanOrEqual(forHealth.grown!.after['core.attack']!);
    expect(forHealth.grown!.after['core.max-health']!).toBeGreaterThanOrEqual(forAttack.grown!.after['core.max-health']!);
    expect(JSON.stringify(forAttack.grown!.after), 'asking the opposite question changed nothing').not.toEqual(JSON.stringify(forHealth.grown!.after));
  });

  // Every point is accounted for, and the ones the greedy rule could not reach are said out loud
  // rather than lost. Both sides are read off the save the tool prints, so neither can drift.
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

describe('the reference builds the corpus carries', () => {
  it('has some, so the claims below are about something', () => {
    expect(shippedTiers.length).toBeGreaterThan(0);
  });

  // The one that would go wrong silently. A tier's experience is the curve read at its level, so a
  // re-tune of the curve makes every stored build a different character while the file on disk
  // reads exactly as it did.
  it.each(shippedTiers)('stands $level in every skill of $activity, as $id says it does', ({ id, activity, level }) => {
    const named = activities.find((each) => each.id === activity);
    expect(named, `${activity} declares no skills`).toBeDefined();
    const state = createGameState();
    loadSave(state, shipped.saves.get(id)!, shipped);
    for (const skill of named!.skills) expect(skillLevel(state.xp[skill] ?? 0), skill).toBe(level);
  });

  // The other way a stored build goes stale: a slot it left empty that something it is already
  // carrying would have filled. That is gear the tier earned and is not using, and it means the
  // file was written before the world it is measuring.
  it.each(shippedTiers)('leaves no slot empty that $id is already carrying something for', ({ id }) => {
    const state = createGameState();
    loadSave(state, shipped.saves.get(id)!, shipped);
    for (const carried of Object.keys(state.inventory)) {
      const slot = shipped.items.get(carried)?.slot;
      if (slot === undefined || state.equipped[slot] !== undefined) continue;
      expect(wearable(state, shipped, carried), `${id} could wear ${carried} in the empty ${slot}`).toBe(false);
    }
  });

  // The third way one goes stale, and the one nothing caught: a piece worn with the whole of its
  // plane untouched. That is a character at a fraction of what its own gear allows, and every rate
  // measured against it is a rate for somebody who never spent a point.
  it.each(shippedTiers)('wears nothing in $id that is standing on the whole of the points it dropped with', ({ id }) => {
    const state = createGameState();
    loadSave(state, shipped.saves.get(id)!, shipped);
    for (const worn of Object.values(state.equipped)) {
      const payload = itemInstance(state, worn);
      const item = shipped.items.get(itemTemplate(state, worn));
      if (!payload || !item || itemLevel(payload, item) === 0) continue;
      expect(pointsSpent(payload.plane), `${id} wears ${itemTemplate(state, worn)} with nothing spent on it`).toBeGreaterThan(0);
    }
  });
});

describe('the doors a build is put together through', () => {
  it('are the engine\'s own, so a build cannot hold what a player could not', () => {
    const state = initialState(shipped);
    receiveItem(state, shipped, 'combat.knights-sword', 1);
    // A blade that drops with a plane arrives as a copy of its own, so it is worn under the id the
    // engine minted for it and not under its template's -- which is what the id is asked for here.
    const [minted = 'combat.knights-sword'] = Object.keys(state.instances.byId);
    expect(String(equip(state, shipped, minted))).toMatch(/Knight's Sword/);
    expect(state.equipped['mainhand']).toBeUndefined();
  });
});
