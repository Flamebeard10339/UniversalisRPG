import { describe, expect, it } from 'vitest';
import { parseDirectiveLine } from '../content/sections/test';
import { loadUniverse } from '../content/load';
import { shippedSources } from '../content/shipped';
import { withoutNote } from '../grammar/note';
import { publishModal } from './modals';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { carriedFrame } from './carried';
import { equip } from './equipment';
import { growLine } from './growth';
import { grownItems, receiveItem, wornCopy } from './itemInstance';
import { planeReport } from './planeReport';
import { BACK, PLANE, PlaneFrame, planeFocus, planeFrame, planeOptions, planeStale, planeSubmit } from './planeScreen';
import { initialState } from './save';
import { GameState, type ModalFrame } from './state';
import { inEnglish } from './sayFixture';
import { aCount, anId, says } from './said';

const MODULE =
  FIXTURE_WORLD +
  `
# cluster-jewel core
shape: point
open-connections: e, ne
passives: 1 keen

# cluster-jewel spark
examine: A splinter of something that was recently on fire.
shape: spindle
open-connections: e

# item blade
title: Blade
slot: mainhand
item-level: 2
origin-cluster: core

# item spark-jewel
title: Spark Jewel
cluster-jewel: spark

# item ember-jewel
title: Ember Jewel
cluster-jewel: spark
`;

const registry = loadInEnglish(MODULE);

function carrying(holdings: Record<string, number>): GameState {
  const state = initialState(registry);
  for (const [id, count] of Object.entries(holdings)) receiveItem(state, registry, id, count);
  return state;
}

const values = (frame: PlaneFrame, state: GameState): readonly string[] => (planeOptions(frame, state, registry)[0].values ?? []).map((choice) => choice.value);

const label = (frame: PlaneFrame, state: GameState): string => planeOptions(frame, state, registry)[0].label;

function walk(state: GameState, from: ModalFrame | null, answers: readonly string[]): ModalFrame | null {
  let frame = from;
  for (const answer of answers) {
    if (frame === null || frame.name !== 'item-plane') throw new Error(`no plane screen to answer ${answer} on`);
    expect(values(frame, state)).toContain(answer);
    frame = planeSubmit({ ...frame, answers: { [PLANE]: answer } }, state, registry);
  }
  return frame;
}

const plane = (state: GameState, answers: readonly string[], target = '1'): PlaneFrame => {
  const frame = walk(state, planeFrame(target), answers);
  if (frame === null || frame.name !== 'item-plane') throw new Error('the screen did not come back');
  return frame;
};

describe('what the plane screen lists', () => {
  it('lists the positions and slots a point may go to', () => {
    const state = carrying({ blade: 1, rope: 1 });

    expect(values(planeFrame('1'), state)).toEqual(['allocate: slot e', 'allocate: slot ne', BACK]);
  });

  it('lists one value per open slot and jewel that fits it, and no jewel the player has none of', () => {
    const state = carrying({ blade: 1, 'spark-jewel': 1, 'ember-jewel': 1, rope: 1 });

    expect(values(plane(state, ['allocate: slot e']), state)).toEqual([
      'slot: e with spark-jewel',
      'slot: e with ember-jewel',
      'allocate: slot ne',
      BACK,
    ]);
  });

  it('lists the hexagons a step from this one, from either side of the slot joining them', () => {
    const state = carrying({ blade: 1, 'spark-jewel': 2 });
    const grown = plane(state, ['allocate: slot e', 'slot: e with spark-jewel']);

    expect(values(grown, state)).toEqual(['go: 1,0', 'allocate: slot ne', BACK]);
    expect(values({ ...grown, hex: '1,0' }, state)).toEqual(['go: 0,0', 'allocate: position 1', BACK]);
  });

  it('publishes the value that leaves beside every question, and only it for a copy that has gone', () => {
    const state = carrying({ blade: 1 });

    expect([...values(planeFrame('1'), state)].pop()).toBe(BACK);
    expect(values(planeFrame('rope'), state)).toEqual([BACK]);
    expect(values(planeFrame('1', '9,9'), state)).toEqual([BACK]);
  });
});

describe('the modal prefills and never narrows', () => {
  it('publishes each growth as the directive it becomes, less what the frame holds', () => {
    const state = carrying({ blade: 1 });

    const completed: Record<string, string> = {
      'allocate: slot e': 'allocate: 1 at 0,0 slot e',
      'allocate: slot ne': 'allocate: 1 at 0,0 slot ne',
    };

    expect(values(planeFrame('1'), state).filter((value) => value !== BACK)).toEqual(Object.keys(completed));
    for (const [value, line] of Object.entries(completed)) {
      expect(line.replace(' 1 at 0,0', '')).toBe(value);
      expect(parseDirectiveLine(line)).toEqual(expect.objectContaining({ target: '1' }));
    }
  });

  it('spells the id of the item an argument points at, and never its title', () => {
    const state = carrying({ blade: 1, 'spark-jewel': 1 });
    const screen = plane(state, ['allocate: slot e']);
    const published = values(screen, state);
    const shown = (planeOptions(screen, state, registry)[0].values ?? []).map((choice) => choice.shown);

    expect(published).toContain('slot: e with spark-jewel');
    expect(published.some((value) => value.includes('Spark Jewel'))).toBe(false);
    expect(shown).toContain('slot: e with Spark Jewel');
    expect(parseDirectiveLine('slot: 1 at 0,0 e with spark-jewel')).toEqual(expect.objectContaining({ target: '1' }));
  });

  it('reaches byte-identical state from the screen and from the directives typed in full', () => {
    const answered = carrying({ blade: 1, 'spark-jewel': 1 });
    const typed = carrying({ blade: 1, 'spark-jewel': 1 });

    plane(answered, ['allocate: slot e', 'slot: e with spark-jewel', 'go: 1,0', 'allocate: position 1']);
    for (const line of [
      'allocate: 1 at 0,0 slot e',
      'slot: 1 at 0,0 e with spark-jewel',
      'allocate: 1 at 1,0 position 1',
    ]) {
      const growth = growLine(typed, registry, line);
      if (!growth.ok) throw new Error(inEnglish(registry, growth.refused));
    }

    expect(JSON.stringify(answered)).toBe(JSON.stringify(typed));
  });

  it('takes a point back the same way, and never offers a jewel socket back at all', () => {
    const answered = carrying({ blade: 1, 'spark-jewel': 1 });
    const typed = carrying({ blade: 1, 'spark-jewel': 1 });

    const walked = plane(answered, ['allocate: slot e', 'slot: e with spark-jewel', 'go: 1,0', 'allocate: position 1', 'unallocate: position 1']);
    for (const line of [
      'allocate: 1 at 0,0 slot e',
      'slot: 1 at 0,0 e with spark-jewel',
      'allocate: 1 at 1,0 position 1',
      'unallocate: 1 at 1,0 position 1',
    ]) {
      const growth = growLine(typed, registry, line);
      if (!growth.ok) throw new Error(inEnglish(registry, growth.refused));
    }

    expect(JSON.stringify(answered)).toBe(JSON.stringify(typed));
    expect(values(walked, answered)).toEqual(['go: 0,0', 'allocate: position 1', BACK]);
    expect(values({ ...walked, hex: '0,0' }, answered).filter((value) => value.startsWith('unallocate:'))).toEqual([]);
  });
});

describe('what the screen does with an answer', () => {
  it('changes the focused hexagon and no game state at all', () => {
    const state = carrying({ blade: 1, 'spark-jewel': 1 });
    const grown = plane(state, ['allocate: slot e', 'slot: e with spark-jewel']);
    const before = JSON.stringify(state);

    expect(walk(state, grown, ['go: 1,0'])).toEqual(planeFrame('1', '1,0'));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('grows the copy the screen was opened on, and comes back holding it', () => {
    const state = carrying({ blade: 1 });

    expect(walk(state, planeFrame('1'), ['allocate: slot e'])).toEqual(planeFrame('1'));
    expect(grownItems(state)).toEqual({ '1': 'blade' });
  });

  it('routes a slotting and an allocation to the growth verbs already shipped', () => {
    const state = carrying({ blade: 1, 'spark-jewel': 1 });

    plane(state, ['allocate: slot e', 'slot: e with spark-jewel']);
    expect(planeReport(registry, state, '1')?.clusters.map((cluster) => [cluster.hex, cluster.jewel])).toEqual([
      ['0,0', 'core'],
      ['1,0', 'spark'],
    ]);
    expect(state.inventory['spark-jewel']).toBe(0);
  });

  it('states what the plane said, leaves the screen where it was, and moves nothing', () => {
    const state = carrying({ blade: 1, 'spark-jewel': 1 });
    const spent = plane(state, ['allocate: slot e', 'slot: e with spark-jewel', 'allocate: slot ne', 'go: 1,0']);
    const before = JSON.stringify(state);

    const refused = walk(state, spent, ['allocate: position 1']);
    expect(refused).toEqual({ ...planeFrame('1', '1,0'), said: says('engine.plane.no-points', { node: says('engine.plane.node.position', { position: aCount(1), hex: anId('1,0') }) }) });
    expect(label(refused as PlaneFrame, state)).toBe('Modified Blade at 1,0 — A splinter of something that was recently on fire. — position 1 of 1,0 costs a point and none remain');
    expect(values(refused as PlaneFrame, state)).toContain('allocate: position 1');
    expect(JSON.stringify(state)).toBe(before);
    expect(state.log).toEqual([]);
  });

  it('returns an inventory frame with that copy still selected, and an empty one for a copy that has gone', () => {
    const state = carrying({ blade: 1 });
    const grown = plane(state, ['allocate: slot e']);

    expect(walk(state, grown, [BACK])).toEqual(carriedFrame({ item: '1' }));
    expect(walk(state, planeFrame('rope'), [BACK])).toEqual(carriedFrame());
  });
});

describe('what the screen has in hand', () => {
  it('names the copy and the hexagon, whichever way the copy is carried', () => {
    const state = carrying({ blade: 1, 'spark-jewel': 1 });

    expect(planeFocus(planeFrame('1'))).toEqual({ kind: 'plane', instance: '1', hex: '0,0' });
    const walked = plane(state, ['allocate: slot e', 'slot: e with spark-jewel', 'go: 1,0']);
    expect(planeFocus(walked)).toEqual({ kind: 'plane', instance: '1', hex: '1,0' });
    expect(planeReport(registry, state, planeFocus(walked).instance)?.clusters.map((cluster) => cluster.hex)).toContain('1,0');
  });

  it('names them the same whatever the plane last said', () => {
    expect(planeFocus(planeFrame('1', '1,0', says('engine.plane.no-points', { node: anId('position 1 of 1,0') })))).toEqual({ kind: 'plane', instance: '1', hex: '1,0' });
  });
});

describe('what a saved frame may still point at', () => {
  it('refuses a frame growing a copy the player no longer carries', () => {
    const state = carrying({ blade: 1 });

    expect(planeStale(planeFrame('1'), state, registry)).toBeNull();
    expect(planeStale(planeFrame('rope'), state, registry)).toBe('it grows rope, which the player no longer carries');
    expect(planeStale(planeFrame('9'), state, registry)).toBe('it grows 9, which the player no longer carries');
  });

  it('names the slot, and not the spelling for it, when a frame grows one that has emptied', () => {
    const state = carrying({ blade: 1 });

    expect(planeStale(planeFrame(wornCopy('mainhand')), state, registry)).toBe('it grows what was worn in mainhand, and that slot is empty');

    equip(state, registry, '1');
    expect(planeStale(planeFrame(wornCopy('mainhand')), state, registry)).toBeNull();
  });

  it('refuses a frame holding a hexagon that plane has no cluster in', () => {
    const state = carrying({ blade: 1 });

    expect(planeStale(planeFrame('1', '1,0'), state, registry)).toBe('it holds 1,0, where that plane has no cluster');
  });
});

describe('what the heading says', () => {
  it('says the cluster in focus in its own words, and the hexagon it moved off in the base’s', () => {
    const state = carrying({ blade: 1, 'spark-jewel': 1 });
    const grown = plane(state, ['allocate: slot e', 'slot: e with spark-jewel']);

    expect(label({ ...grown, hex: '1,0' }, state)).toBe('Modified Blade at 1,0 — A splinter of something that was recently on fire.');
    expect(label(grown, state)).toBe('Modified Blade at 0,0');
  });
});

describe('a frame carries a key, not a sentence', () => {
  const SPANISH = [
    '# info camp-es',
    'version: 1.0.0',
    '',
    '# locale es',
    'item.blade.title: Hoja',
    'engine.item.modified: {item} modificada',
    'engine.plane.heading: {plane} en {hex}',
    'engine.plane.heading.said: {heading} — {said}',
    'engine.plane.no-points: {node} cuesta un punto y no queda ninguno',
    'engine.plane.node.position: posicion {position} de {hex}',
  ].join('\n');
  const bilingual = loadUniverse([engineLocale(), { name: 'camp', text: MODULE }, { name: 'camp-es', text: SPANISH }]);

  const refusedIn = (language: string): { frame: PlaneFrame; state: GameState } => {
    const state = initialState(bilingual, language);
    receiveItem(state, bilingual, 'blade', 1);
    receiveItem(state, bilingual, 'spark-jewel', 1);
    let frame: ModalFrame | null = planeFrame('1');
    for (const answer of ['allocate: slot e', 'slot: e with spark-jewel', 'allocate: slot ne', 'go: 1,0', 'allocate: position 1']) {
      if (frame === null || frame.name !== 'item-plane') throw new Error(`no plane screen to answer ${answer} on`);
      const published = (planeOptions(frame, state, bilingual)[0].values ?? []).map((choice) => choice.value);
      expect(published, language).toContain(answer);
      frame = planeSubmit({ ...frame, answers: { [PLANE]: answer } }, state, bilingual);
    }
    if (frame === null || frame.name !== 'item-plane' || frame.said === undefined) throw new Error('the plane refused nothing');
    return { frame, state };
  };

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
    expect(readIn('en', refusedIn('es'))).toBe('Modified Blade at 1,0 — A splinter of something that was recently on fire. — position 1 of 1,0 costs a point and none remain');
    expect(readIn('es', refusedIn('en'))).toBe('Hoja modificada en 1,0 — posicion 1 de 1,0 cuesta un punto y no queda ninguno');
  });
});

// The words on a cluster jewel reach a player only where the screen focused on one says them, and no
// driver names examine: each draws the label it is handed. So the claim is made over every jewel the
// shipped corpus writes examine: on, standing each at the origin of a base of its own rather than
// naming a route to it, and it is the published modal that is read.
describe('a cluster jewel the corpus writes examine: on', () => {
  const corpus = loadUniverse(shippedSources());
  const written = [...corpus.clusterJewels.values()].filter((each) => each.examine !== undefined);
  const probeOf = (jewel: string): string => `jewel-probe.probe-${jewel.replace(/\./g, '-')}`;
  const owners = [...new Set(written.map((each) => corpus.namespace.ownerOf('cluster-jewel', each.id)))].filter((owner): owner is string => owner !== null);
  const PROBES = {
    name: 'jewel-probe',
    text: ['# info jewel-probe', 'version: 1.0.0', 'dependencies:', ...owners.map((owner) => `  ${owner}`), ...written.flatMap((each) => ['', `# item probe-${each.id.replace(/\./g, '-')}`, 'slot: mainhand', 'item-level: 1', `origin-cluster: ${each.id}`])].join('\n'),
  };
  const probed = loadUniverse([...shippedSources(), PROBES]);

  it('is written by enough of the corpus for what is below to mean something', () => {
    expect(written.length).toBeGreaterThan(10);
  });

  it('says those words on the screen that stands the player in it, so nothing is written for nobody to read', () => {
    const unread = written.filter((each) => {
      const state = initialState(probed);
      const minted = String(state.instances.next);
      receiveItem(state, probed, probeOf(each.id), 1);
      const published = publishModal(planeFrame(minted), state, probed);
      return !published.options.some((option) => option.label.includes(withoutNote(each.examine!)));
    });

    expect(unread.map((each) => each.id)).toEqual([]);
  });
});
