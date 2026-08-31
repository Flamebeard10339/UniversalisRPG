import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { shippedSources } from '../src/content/shipped';
import { equip, wearable } from '../src/runtime/equipment';
import { receiveItem } from '../src/runtime/itemInstance';
import { initialState, loadSave } from '../src/runtime/save';
import { skillLevel } from '../src/runtime/skills';
import { createGameState } from '../src/runtime/state';
import { activitiesIn, poolForTier } from './lib/tiers';
import { buildTier, evenlySpent, handedOver, parseTierArgs } from './tier-build';

const shipped = loadUniverseWithDiagnostics(shippedSources()).registry;
const activities = activitiesIn(shipped);
const combat = activities.find((each) => each.id === 'combat')!;
const fishing = activities.find((each) => each.id === 'fishing')!;

// Every reference build the corpus carries, found by the name it is filed under rather than listed
// here, so a tier added next month is held to the same claims by existing.
const TIER = /^tiers\.(.+)-tier-(\d+)$/;
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
    expect(parseTierArgs(['combat', '10'])).toMatchObject({ activity: 'combat', level: 10, items: [] });
    expect(() => parseTierArgs(['combat'])).toThrow(/name an activity and a level/);
    expect(() => parseTierArgs(['combat', 'ten'])).toThrow(/whole number/);
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
});

describe('the doors a build is put together through', () => {
  it('are the engine\'s own, so a build cannot hold what a player could not', () => {
    const state = initialState(shipped);
    receiveItem(state, shipped, 'combat.knights-sword', 1);
    expect(String(equip(state, shipped, 'combat.knights-sword'))).toMatch(/Knight's Sword/);
    expect(state.equipped['mainhand']).toBeUndefined();
  });
});
