import { describe, expect, it } from 'vitest';
import { parseDirectiveLine } from '../content/test';
import { loadModule } from '../content/registry';
import { carriedFrame } from './carriedScreen';
import { growLine } from './growth';
import { grownItems } from './itemInstance';
import { ModalFrame } from './modals';
import { planeReport } from './planeReport';
import { BACK, PLANE, PlaneFrame, planeFrame, planeOptions, planeStale, planeSubmit } from './planeScreen';
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

const registry = loadModule(MODULE);

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
const FED = ['feed: with whetstone', 'feed: with whetstone'];

describe('what the plane screen lists', () => {
  // c6: the values are read off the plane report and off what the player
  // carries, and every one of them is a growth already shipped.
  it('lists the positions and slots a point may go to, and the food a copy takes', () => {
    const state = carrying({ blade: 1, whetstone: 1, rope: 1 });

    expect(values(planeFrame('blade'), state)).toEqual(['allocate: slot e', 'allocate: slot ne', 'feed: with whetstone', BACK]);
  });

  it('lists one value per open slot and jewel that fits it, and no jewel the player has none of', () => {
    const state = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1, 'ember-jewel': 1, rope: 1 });

    expect(values(plane(state, [...FED, 'allocate: slot e']), state)).toEqual([
      'slot: e with spark-jewel',
      'slot: e with ember-jewel',
      'allocate: slot ne',
      BACK,
    ]);
  });

  it('lists the hexagons a step from this one, from either side of the slot joining them', () => {
    const state = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });
    const grown = plane(state, [...FED, 'allocate: slot e', 'slot: e with spark-jewel']);

    expect(values(grown, state)).toContain('Go to 1,0');
    expect(values({ ...grown, hex: '1,0' }, state)).toContain('Go to 0,0');
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
      'feed: with whetstone': 'feed: blade with whetstone',
    };

    expect(values(planeFrame('blade'), state).filter((value) => value !== BACK)).toEqual(Object.keys(completed));
    for (const [value, line] of Object.entries(completed)) {
      expect(line.replace(' blade at 0,0', '').replace(' blade', '')).toBe(value);
      expect(parseDirectiveLine(line)).toEqual(expect.objectContaining({ target: 'blade' }));
    }
  });

  // c4, the clause to break first: answering the shortened form and typing the
  // whole directive are the same growth, so neither can drift from the other.
  it('reaches byte-identical state from the screen and from the directives typed in full', () => {
    const answered = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });
    const typed = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });

    plane(answered, [...FED, 'allocate: slot e', 'slot: e with spark-jewel', 'Go to 1,0', 'allocate: position 1']);
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
    const grown = plane(state, [...FED, 'allocate: slot e', 'slot: e with spark-jewel']);
    const before = JSON.stringify(state);

    expect(walk(state, grown, ['Go to 1,0'])).toEqual(planeFrame('1', '1,0'));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('grows a base still in its stack and comes back holding the copy that minted', () => {
    const state = carrying({ blade: 1, whetstone: 1 });

    expect(walk(state, planeFrame('blade'), ['feed: with whetstone'])).toEqual(planeFrame('1'));
    expect(grownItems(state)).toEqual({ '1': 'blade' });
  });

  it('routes a slotting and an allocation to the growth verbs already shipped', () => {
    const state = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });

    plane(state, [...FED, 'allocate: slot e', 'slot: e with spark-jewel']);
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
    const spent = plane(state, ['feed: with whetstone', 'allocate: slot e', 'slot: e with spark-jewel', 'allocate: slot ne', 'Go to 1,0']);
    const before = JSON.stringify(state);

    const refused = walk(state, spent, ['allocate: position 1']);
    expect(refused).toEqual({ ...planeFrame('1', '1,0'), said: 'position 1 of 1,0 costs a point and none remain' });
    expect(label(refused as PlaneFrame, state)).toBe('Blade #1 at 1,0 — position 1 of 1,0 costs a point and none remain');
    expect(values(refused as PlaneFrame, state)).toContain('allocate: position 1');
    expect(JSON.stringify(state)).toBe(before);
    expect(state.log).toEqual([]);
  });

  // c3: leaving is not closing the world, it is going back to the screen this
  // one replaced, with the copy it was opened from still chosen.
  it('returns an inventory frame with that copy still selected, and an empty one for a copy that has gone', () => {
    const state = carrying({ blade: 1, whetstone: 1 });
    const grown = plane(state, ['feed: with whetstone']);

    expect(walk(state, grown, [BACK])).toEqual(carriedFrame({ item: 'Blade #1' }));
    expect(walk(state, planeFrame('rope'), [BACK])).toEqual(carriedFrame());
  });
});

describe('what a saved frame may still point at', () => {
  it('refuses a frame growing a copy the player no longer carries', () => {
    const state = carrying({ blade: 1, whetstone: 1 });

    expect(planeStale(planeFrame('blade'), state, registry)).toBeNull();
    expect(planeStale(planeFrame('rope'), state, registry)).toBe('it grows rope, which the player no longer carries');
    expect(planeStale(planeFrame('9'), state, registry)).toBe('it grows 9, which the player no longer carries');
  });

  it('refuses a frame holding a hexagon that plane has no cluster in', () => {
    const state = carrying({ blade: 1, whetstone: 1 });

    expect(planeStale(planeFrame('blade', '1,0'), state, registry)).toBe('it holds 1,0, where that plane has no cluster');
  });
});
