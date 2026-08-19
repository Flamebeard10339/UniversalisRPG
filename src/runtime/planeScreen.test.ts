import { describe, expect, it } from 'vitest';
import { parseDirectiveLine } from '../content/test';
import { loadUniverse } from '../content/load';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { carriedFrame } from './carriedScreen';
import { equip } from './equipment';
import { growLine } from './growth';
import { grownItems, wornCopy } from './itemInstance';
import { planeReport } from './planeReport';
import { BACK, PLANE, PlaneFrame, planeFocus, planeFrame, planeOptions, planeStale, planeSubmit } from './planeScreen';
import { initialState } from './save';
import { GameState, type ModalFrame } from './state';
import { inEnglish } from './sayFixture';
import { aCount, anId, says } from './said';

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

const values = (frame: PlaneFrame, state: GameState): readonly string[] => (planeOptions(frame, state, registry)[0].values ?? []).map((choice) => choice.value);

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

  // A slot a cluster has already come in through is somewhere to walk to and no
  // longer somewhere to put a jewel, with a second jewel still in hand.
  it('lists the hexagons a step from this one, from either side of the slot joining them', () => {
    const state = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 2 });
    const grown = plane(state, [...FED, 'allocate: slot e', 'slot: e with spark-jewel']);

    expect(values(grown, state)).toEqual(['go: 1,0', 'allocate: slot ne', BACK]);
    expect(values({ ...grown, hex: '1,0' }, state)).toEqual(['go: 0,0', 'allocate: position 1', BACK]);
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

    expect(values(planeFrame('blade'), state).filter((value) => value !== BACK)).toEqual([...Object.keys(completed), 'feed: with whetstone']);
    for (const [value, line] of Object.entries(completed)) {
      expect(line.replace(' blade at 0,0', '').replace(' blade', '')).toBe(value);
      expect(parseDirectiveLine(line)).toEqual(expect.objectContaining({ target: 'blade' }));
    }
  });

  // c2: an argument a value carries is the item's id, not its title, so the
  // value and the line the frame hands the parser differ only by the arguments
  // the frame already holds. What the player reads is the pattern beside it.
  it('spells the id of the item an argument points at, and never its title', () => {
    const state = carrying({ blade: 1, whetstone: 3, 'spark-jewel': 1 });
    const screen = plane(state, [...FED, 'allocate: slot e']);
    const published = values(screen, state);
    const shown = (planeOptions(screen, state, registry)[0].values ?? []).map((choice) => choice.shown);

    expect(published).toContain('slot: e with spark-jewel');
    expect(published).toContain('feed: with whetstone');
    expect(published.some((value) => value.includes('Spark Jewel') || value.includes('Whetstone'))).toBe(false);
    expect(shown).toContain('slot: e with Spark Jewel');
    expect(parseDirectiveLine('slot: 1 at 0,0 e with spark-jewel')).toEqual(expect.objectContaining({ target: '1' }));
  });

  // c4, the clause to break first: answering the shortened form and typing the
  // whole directive are the same growth, so neither can drift from the other.
  it('reaches byte-identical state from the screen and from the directives typed in full', () => {
    const answered = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });
    const typed = carrying({ blade: 1, whetstone: 2, 'spark-jewel': 1 });

    plane(answered, [...FED, 'allocate: slot e', 'slot: e with spark-jewel', 'go: 1,0', 'allocate: position 1']);
    for (const line of [
      'feed: blade with whetstone',
      'feed: 1 with whetstone',
      'allocate: 1 at 0,0 slot e',
      'slot: 1 at 0,0 e with spark-jewel',
      'allocate: 1 at 1,0 position 1',
    ]) {
      const growth = growLine(typed, registry, line);
      if (!growth.ok) throw new Error(inEnglish(registry, growth.refused));
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

    expect(walk(state, grown, ['go: 1,0'])).toEqual(planeFrame('1', '1,0'));
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
    const spent = plane(state, ['feed: with whetstone', 'allocate: slot e', 'slot: e with spark-jewel', 'allocate: slot ne', 'go: 1,0']);
    const before = JSON.stringify(state);

    const refused = walk(state, spent, ['allocate: position 1']);
    expect(refused).toEqual({ ...planeFrame('1', '1,0'), said: says('engine.plane.no-points', { node: says('engine.plane.node.position', { position: aCount(1), hex: anId('1,0') }) }) });
    expect(label(refused as PlaneFrame, state)).toBe('Modified Blade at 1,0 — position 1 of 1,0 costs a point and none remain');
    expect(values(refused as PlaneFrame, state)).toContain('allocate: position 1');
    expect(JSON.stringify(state)).toBe(before);
    expect(state.log).toEqual([]);
  });

  // c3: leaving is not closing the world, it is going back to the screen this
  // one replaced, with the copy it was opened from still chosen.
  it('returns an inventory frame with that copy still selected, and an empty one for a copy that has gone', () => {
    const state = carrying({ blade: 1, whetstone: 1 });
    const grown = plane(state, ['feed: with whetstone']);

    expect(walk(state, grown, [BACK])).toEqual(carriedFrame({ item: '1' }));
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
    const walked = plane(state, [...FED, 'allocate: slot e', 'slot: e with spark-jewel', 'go: 1,0']);
    expect(planeFocus(walked)).toEqual({ instance: '1', hex: '1,0' });
    expect(planeReport(registry, state, planeFocus(walked).instance)?.clusters.map((cluster) => cluster.hex)).toContain('1,0');
  });

  // A refusal is what the screen says, not what it holds, so the focus is the
  // same two ids whether or not the plane last refused something.
  it('names them the same whatever the plane last said', () => {
    expect(planeFocus(planeFrame('blade', '1,0', says('engine.plane.no-points', { node: anId('position 1 of 1,0') })))).toEqual({ instance: 'blade', hex: '1,0' });
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

// c3: what a frame stores is a key and its parameters, so the sentence is made
// when the screen is drawn and by whoever is reading it. Both directions,
// because a save written by one player is loaded by the other.
describe('a frame carries a key, not a sentence', () => {
  const SPANISH = [
    '# info camp-es',
    'version: 1.0.0',
    '',
    '# locale es',
    'item.blade.title: Hoja',
    'engine.item.modified: {item} modificada',
    'engine.plane.heading.said: {plane} en {hex} — {said}',
    'engine.plane.no-points: {node} cuesta un punto y no queda ninguno',
    'engine.plane.node.position: posicion {position} de {hex}',
  ].join('\n');
  const bilingual = loadUniverse([engineLocale(), { name: 'camp', text: MODULE }, { name: 'camp-es', text: SPANISH }]);

  // The screen a refused allocation leaves standing, and the state it was left
  // in, which is what a save of that session would carry.
  const refusedIn = (language: string): { frame: PlaneFrame; state: GameState } => {
    const state = initialState(bilingual, language);
    Object.assign(state.inventory, { blade: 1, whetstone: 2, 'spark-jewel': 1 });
    let frame: ModalFrame | null = planeFrame('blade');
    for (const answer of [...FED, 'allocate: slot e', 'slot: e with spark-jewel', 'allocate: slot ne', 'go: 1,0', 'allocate: position 1']) {
      if (frame === null || frame.name !== 'item-plane') throw new Error(`no plane screen to answer ${answer} on`);
      const published = (planeOptions(frame, state, bilingual)[0].values ?? []).map((choice) => choice.value);
      expect(published, language).toContain(answer);
      frame = planeSubmit({ ...frame, answers: { [PLANE]: answer } }, state, bilingual);
    }
    if (frame === null || frame.name !== 'item-plane' || frame.said === undefined) throw new Error('the plane refused nothing');
    return { frame, state };
  };

  // The same session read by the other player: one save, one instance table,
  // one frame, and only the language setting between them.
  const readIn = (language: string, written: { frame: PlaneFrame; state: GameState }): string =>
    planeOptions(written.frame, { ...written.state, language }, bilingual)[0].label;

  it('stores no words, so the same frame reads in whichever language loads it', () => {
    const english = refusedIn('en');
    const spanish = refusedIn('es');

    expect(english.frame.said).toEqual(spanish.frame.said);
    expect(JSON.parse(JSON.stringify(english.frame.said))).toEqual({
      engine: 'engine.plane.no-points',
      params: { node: { engine: 'engine.plane.node.position', params: { position: { count: 1 }, hex: { id: '1,0' } } } },
    });
  });

  it('renders a frame written by one player in the language of the other, both directions', () => {
    expect(readIn('en', refusedIn('es'))).toBe('Modified Blade at 1,0 — position 1 of 1,0 costs a point and none remain');
    expect(readIn('es', refusedIn('en'))).toBe('Hoja modificada en 1,0 — posicion 1 de 1,0 cuesta un punto y no queda ninguno');
  });
});
