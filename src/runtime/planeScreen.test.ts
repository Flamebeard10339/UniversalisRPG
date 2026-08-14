import { describe, expect, it } from 'vitest';
import { parseDirectiveLine } from '../content/test';
import { } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { carriedFrame } from './carriedScreen';
import { equip } from './equipment';
import { growLine } from './growth';
import { grownItems, wornCopy } from './itemInstance';
import { ModalFrame } from './modals';
import { planeReport } from './planeReport';
import { BACK, PLANE, PlaneFrame, planeFocus, planeFrame, planeOptions, planeStale, planeSubmit } from './planeScreen';
import { initialState } from './save';
import { GameState } from './state';

const MODULE = `
# location camp
x: 0, y: 0
starting

# stat attack
base: 4

# passive keen
+4 attack

# cluster-jewel core
shape: point
open-connections: e, ne
passives: 1 keen

# cluster-jewel spark
shape: spindle
open-connections: e

# item blade
title: Blade
slot: mainhand
max-level: 20
origin-cluster: core

# item spark-jewel
title: Spark Jewel
cluster-jewel: spark

# item ember-jewel
title: Ember Jewel
cluster-jewel: spark

# item whetstone
title: Whetstone
item-experience: 1000

# item rope
title: Rope
`;

const registry = loadInEnglish(MODULE);

function carrying(inventory: Record<string, number>): GameState {
  const state = initialState(registry);
  Object.assign(state.inventory, inventory);
  return state;
}

const values = (frame: PlaneFrame, state: GameState): readonly string[] => planeOptions(frame, state, registry)[0].values ?? [];

const label = (frame: PlaneFrame, state: GameState): string => planeOptions(frame, state, registry)[0].label;

// Answering the screen the way a player does: each answer is a value the screen
// itself published, and what comes back is the screen that replaces it.
function walk(state: GameState, from: ModalFrame | null, answers: readonly string[]): ModalFrame | null {
  let frame = from;
  for (const answer of answers) {
    if (frame === null || frame.name !== 'item-plane') throw new Error(`no plane screen to answer ${answer} on`);
    expect(values(frame, state)).toContain(answer);
    frame = planeSubmit({ ...frame, answers: { [PLANE]: answer } }, state, registry);
  }
  return frame;
}

const plane = (state: GameState, answers: readonly string[], target = 'blade'): PlaneFrame => {
  const frame = walk(state, planeFrame(target), answers);
  if (frame === null || frame.name !== 'item-plane') throw new Error('the screen did not come back');
  return frame;
};

// Two feeds is four points, which is more than any route below spends.
const FED = ['feed: with Whetstone', 'feed: with Whetstone'];

describe('what the plane screen lists', () => {
  // c6: the values are read off the plane report and off what the player
  // carries, and every one of them is a growth already shipped.
  it('lists the positions and slots a point may go to, and the food a copy takes', () => {
    const state = carrying({ blade: 1, whetstone: 1, rope: 1 });

    expect(values(planeFrame('blade'), state)).toEqual(['allocate: slot e', 'allocate: slot ne', 'feed: with Whetstone', BACK]);
  });

  it('lists one value per open slot and jewel that fits it, and no jewel the player has none of', () => {
    const state = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1, 'ember-jewel': 1, rope: 1 });

    expect(values(plane(state, [...FED, 'allocate: slot e']), state)).toEqual([
      'slot: e with Spark Jewel',
      'slot: e with Ember Jewel',
      'allocate: slot ne',
      BACK,
    ]);
  });

  // A slot a cluster has already come in through is somewhere to walk to and no
  // longer somewhere to put a jewel, with a second jewel still in hand.
  it('lists the hexagons a step from this one, from either side of the slot joining them', () => {
    const state = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 2 });
    const grown = plane(state, [...FED, 'allocate: slot e', 'slot: e with Spark Jewel']);

    expect(values(grown, state)).toEqual(['Go to 1,0', 'allocate: slot ne', BACK]);
    expect(values({ ...grown, hex: '1,0' }, state)).toEqual(['Go to 0,0', 'allocate: position 1', BACK]);
  });

  // c15: the value that leaves is published beside every question, including the
  // one asked about a plane the screen can no longer read.
  it('publishes the value that leaves beside every question, and only it for a copy that has gone', () => {
    const state = carrying({ blade: 1, whetstone: 1 });

    expect([...values(planeFrame('blade'), state)].pop()).toBe(BACK);
    expect(values(planeFrame('rope'), state)).toEqual([BACK]);
    expect(values(planeFrame('blade', '9,9'), state)).toEqual([BACK]);
  });
});

describe('the modal prefills and never narrows', () => {
  // c4: a published value is the directive itself with the arguments the frame
  // already holds left out, so putting those two back is all the frame does
  // before the one parser reads it. Nothing here is a second spelling.
  it('publishes each growth as the directive it becomes, less what the frame holds', () => {
    const state = carrying({ blade: 1, whetstone: 1 });

    // What a copy is fed names no hexagon, so the frame fills the copy alone
    // into it: one directive kind and one parser either way, and what a value
    // leaves out is whatever its own verb takes from the frame.
    const completed: Record<string, string> = {
      'allocate: slot e': 'allocate: blade at 0,0 slot e',
      'allocate: slot ne': 'allocate: blade at 0,0 slot ne',
    };

    expect(values(planeFrame('blade'), state).filter((value) => value !== BACK)).toEqual([...Object.keys(completed), 'feed: with Whetstone']);
    for (const [value, line] of Object.entries(completed)) {
      expect(line.replace(' blade at 0,0', '').replace(' blade', '')).toBe(value);
      expect(parseDirectiveLine(line)).toEqual(expect.objectContaining({ target: 'blade' }));
    }
  });

  // c16 over c4: the one argument a value carries that a player has to read is
  // the item it names, so the value says the name and the line the frame hands
  // the parser says the id. There is still one directive and one parser — what
  // reaching byte-identical state below is the proof of.
  it('names the item an argument points at, and spells that item’s id into the line', () => {
    const state = carrying({ blade: 1, whetstone: 3, 'spark-jewel': 1 });
    const published = values(plane(state, [...FED, 'allocate: slot e']), state);

    expect(published).toContain('slot: e with Spark Jewel');
    expect(published).toContain('feed: with Whetstone');
    expect(published.some((value) => value.includes('spark-jewel') || value.includes('whetstone'))).toBe(false);
    expect(parseDirectiveLine('slot: 1 at 0,0 e with spark-jewel')).toEqual(expect.objectContaining({ target: '1' }));
  });

  // c4, the clause to break first: answering the shortened form and typing the
  // whole directive are the same growth, so neither can drift from the other.
  it('reaches byte-identical state from the screen and from the directives typed in full', () => {
    const answered = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });
    const typed = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });

    plane(answered, [...FED, 'allocate: slot e', 'slot: e with Spark Jewel', 'Go to 1,0', 'allocate: position 1']);
    for (const line of [
      'feed: blade with whetstone',
      'feed: 1 with whetstone',
      'allocate: 1 at 0,0 slot e',
      'slot: 1 at 0,0 e with spark-jewel',
      'allocate: 1 at 1,0 position 1',
    ]) {
      const growth = growLine(typed, registry, line);
      if (!growth.ok) throw new Error(growth.refused);
    }

    expect(JSON.stringify(answered)).toBe(JSON.stringify(typed));
  });
});

describe('what the screen does with an answer', () => {
  // c5: navigating is answering an option, and the frame's hexagon is the whole
  // of what it moves. It costs nothing and nothing records it.
  it('changes the focused hexagon and no game state at all', () => {
    const state = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });
    const grown = plane(state, [...FED, 'allocate: slot e', 'slot: e with Spark Jewel']);
    const before = JSON.stringify(state);

    expect(walk(state, grown, ['Go to 1,0'])).toEqual(planeFrame('1', '1,0'));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('grows a base still in its stack and comes back holding the copy that minted', () => {
    const state = carrying({ blade: 1, whetstone: 1 });

    expect(walk(state, planeFrame('blade'), ['feed: with Whetstone'])).toEqual(planeFrame('1'));
    expect(grownItems(state)).toEqual({ '1': 'blade' });
  });

  it('routes a slotting and an allocation to the growth verbs already shipped', () => {
    const state = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });

    plane(state, [...FED, 'allocate: slot e', 'slot: e with Spark Jewel']);
    expect(planeReport(registry, state, '1')?.clusters.map((cluster) => [cluster.hex, cluster.jewel])).toEqual([
      ['0,0', 'core'],
      ['1,0', 'spark'],
    ]);
    expect(state.inventory['spark-jewel']).toBe(0);
  });

  // c7: the refusal reaches the player on the screen it was refused on, which
  // stays standing at the hexagon it was standing at, and the verb costs
  // nothing. The log beneath it is not where this is discoverable.
  it('states what the plane said, leaves the screen where it was, and moves nothing', () => {
    const state = carrying({ blade: 1, whetstone: 1, 'spark-jewel': 1 });
    const spent = plane(state, ['feed: with Whetstone', 'allocate: slot e', 'slot: e with Spark Jewel', 'allocate: slot ne', 'Go to 1,0']);
    const before = JSON.stringify(state);

    const refused = walk(state, spent, ['allocate: position 1']);
    expect(refused).toEqual({ ...planeFrame('1', '1,0'), said: 'position 1 of 1,0 costs a point and none remain' });
    expect(label(refused as PlaneFrame, state)).toBe('Modified Blade at 1,0 — position 1 of 1,0 costs a point and none remain');
    expect(values(refused as PlaneFrame, state)).toContain('allocate: position 1');
    expect(JSON.stringify(state)).toBe(before);
    expect(state.log).toEqual([]);
  });

  // c3: leaving is not closing the world, it is going back to the screen this
  // one replaced, with the copy it was opened from still chosen.
  it('returns an inventory frame with that copy still selected, and an empty one for a copy that has gone', () => {
    const state = carrying({ blade: 1, whetstone: 1 });
    const grown = plane(state, ['feed: with Whetstone']);

    expect(walk(state, grown, [BACK])).toEqual(carriedFrame({ item: 'Modified Blade' }));
    expect(walk(state, planeFrame('rope'), [BACK])).toEqual(carriedFrame());
  });
});

describe('what the screen has in hand', () => {
  // c10: the focus is the two ids the frame already holds, and planeReport
  // answers for both spellings of a target, so a driver looks the plane up in
  // what the view publishes rather than being handed a copy of it.
  it('names the copy and the hexagon, whichever way the copy is carried', () => {
    const state = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });

    expect(planeFocus(planeFrame('blade'))).toEqual({ instance: 'blade', hex: '0,0' });
    const walked = plane(state, [...FED, 'allocate: slot e', 'slot: e with Spark Jewel', 'Go to 1,0']);
    expect(planeFocus(walked)).toEqual({ instance: '1', hex: '1,0' });
    expect(planeReport(registry, state, planeFocus(walked).instance)?.clusters.map((cluster) => cluster.hex)).toContain('1,0');
  });

  // A refusal is what the screen says, not what it holds, so the focus is the
  // same two ids whether or not the plane last refused something.
  it('names them the same whatever the plane last said', () => {
    expect(planeFocus(planeFrame('blade', '1,0', 'no points remain'))).toEqual({ instance: 'blade', hex: '1,0' });
  });
});

describe('what a saved frame may still point at', () => {
  it('refuses a frame growing a copy the player no longer carries', () => {
    const state = carrying({ blade: 1, whetstone: 1 });

    expect(planeStale(planeFrame('blade'), state, registry)).toBeNull();
    expect(planeStale(planeFrame('rope'), state, registry)).toBe('it grows rope, which the player no longer carries');
    expect(planeStale(planeFrame('9'), state, registry)).toBe('it grows 9, which the player no longer carries');
  });

  // c16: the slot spelling is the runtime's own and names nothing a player has
  // seen, so the sentence about an emptied slot says which slot emptied.
  it('names the slot, and not the spelling for it, when a frame grows one that has emptied', () => {
    const state = carrying({ blade: 1, whetstone: 1 });

    expect(planeStale(planeFrame(wornCopy('mainhand')), state, registry)).toBe('it grows what was worn in mainhand, and that slot is empty');

    equip(state, registry, 'blade');
    expect(planeStale(planeFrame(wornCopy('mainhand')), state, registry)).toBeNull();
  });

  it('refuses a frame holding a hexagon that plane has no cluster in', () => {
    const state = carrying({ blade: 1, whetstone: 1 });

    expect(planeStale(planeFrame('blade', '1,0'), state, registry)).toBe('it holds 1,0, where that plane has no cluster');
  });
});
