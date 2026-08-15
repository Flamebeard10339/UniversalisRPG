import { describe, expect, it } from 'vitest';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { localizerFor, type Localized } from '../runtime/localized';
import { asLocalized } from '../runtime/localizedFixture';
import type { PlayView } from '../runtime/session';
import { createDriver } from './driver';
import { LABELS, type LabelId } from './labels';
import { focusedPlane, type PlaneView } from './plane';
import { wordsOf } from './words';

// The engine's own English, so what is asserted is the word a player reads and
// not the key it is addressed by.
const localizer = localizerFor(loadInEnglish(''), 'en');
const shellWord = wordsOf(localizer);

// What the two nodes take, supplied at every call so the same table can be read
// as a set. A pattern that names neither is unaffected by being handed both.
const NODE = { position: 1, direction: asLocalized('ne') };

type Plane = PlayView['planes'][number];
type Cluster = Plane['clusters'][number];
type Position = Cluster['positions'][number];
type Slot = Cluster['slots'][number];
type Payload = Position['payloads'][number];

// Every fixture stat keyed and named, and named nothing like its key, so a row
// that spelled the id reads differently from one that spelled the title.
const TITLE: Record<string, Localized> = { 'mod.attack': asLocalized('Attack'), 'mod.max-health': asLocalized('Max Health'), 'mod.defense': asLocalized('Defense') };

const flat = (statId: string, amount: number, scale = 1): Payload => ({ statId, statTitle: TITLE[statId], effective: { percent: false, amount: { min: amount, max: amount } }, scale });

const position = (over: Partial<Position> = {}): Position => ({ position: 1, passive: 'mod.hale', title: asLocalized('Hale'), standing: 'unreached', free: false, payloads: [], ...over });

const slot = (over: Partial<Slot> = {}): Slot => ({ direction: 'e', standing: 'unreached', beyond: null, ...over });

const cluster = (over: Partial<Cluster> = {}): Cluster => ({
  hex: '0,0',
  jewel: 'mod.core',
  title: asLocalized('Core'),
  shape: 'spindle',
  entry: null,
  effects: [],
  modSlots: 2,
  positions: [],
  slots: [],
  ...over,
});

const plane = (over: Partial<Plane> = {}): Plane => ({
  instance: '1',
  template: 'mod.blade',
  title: asLocalized('Blade'),
  name: asLocalized('Blade'),
  level: 3,
  maxLevel: 20,
  spent: 1,
  remaining: 2,
  clusters: [],
  contributions: [],
  ...over,
});

// Only the two fields the pane is a function of carry anything; the rest is
// what the runtime publishes beside them and what a view has to hold to be one.
function viewOf(planes: Plane[], focus: PlayView['focus']): PlayView {
  return {
    location: { id: 'hall', title: asLocalized('The Hall') },
    entities: [],
    choices: [],
    time: 0,
    resources: [],
    encounter: null,
    modals: [],
    inventory: {},
    grown: {},
    carried: [],
    planes,
    focus,
    equipment: [],
    xp: [],
    stats: [],
    flags: {},
    discovered: [],
    journey: null,
    player: { name: 'Miri', race: 'human' },
    action: null,
    said: [],
  };
}

const drawn = (planes: Plane[], focus: PlayView['focus']): PlaneView | null => focusedPlane(viewOf(planes, focus), localizer);

const rowsOf = (view: PlaneView): PlaneView['hexes'][number]['rows'] => view.hexes.flatMap((hex) => hex.rows);

const ROW = { node: 'node', standing: 'standing', what: 'what', worth: 'worth' } as const;

// Every run of text a pane built from this would put on the screen, whatever it
// is drawn as: the fields are read off one row rather than listed, so a field
// added to a row is held to the same rule the day it exists.
function runs(view: PlaneView): string[] {
  return [
    view.title,
    ...view.facts.flatMap((fact) => [fact.name, fact.value]),
    ...view.hexes.flatMap((hex) => [hex.hex, hex.jewel, ...hex.rows.flatMap((row) => Object.values(row))]),
  ].filter((run): run is string => typeof run === 'string');
}

const WORD = /[A-Za-z][A-Za-z0-9-]*/g;

const words = (text: string): string[] => text.match(WORD) ?? [];

// Every string the runtime published, and the short name of each: a namespaced
// id reaches the screen the way the verbs spell it, which is its last segment.
function publishedWords(value: unknown): string[] {
  if (typeof value === 'string') return [...words(value), ...words(value.split('.').pop() ?? '')];
  if (Array.isArray(value)) return value.flatMap(publishedWords);
  if (value && typeof value === 'object') return Object.values(value).flatMap(publishedWords);
  return [];
}

describe('the plane the view says is in hand', () => {
  it('draws nothing where nothing is focused', () => {
    expect(drawn([plane()], null)).toBeNull();
  });

  it('draws nothing where the focus names a plane the view does not publish', () => {
    expect(drawn([plane({ instance: '1' })], { instance: '2', hex: '0,0' })).toBeNull();
  });

  it('draws the plane the focus names and not the first one published', () => {
    const view = drawn([plane({ instance: '1', title: asLocalized('Blade') }), plane({ instance: '2', title: asLocalized('Shield') })], { instance: '2', hex: '0,0' });

    expect(view?.instance).toBe('2');
    expect(view?.title).toBe('Shield');
  });

  it('heads it with the level it has reached and the points it has left to spend', () => {
    expect(drawn([plane({ level: 3, maxLevel: 20, remaining: 2 })], { instance: '1', hex: '0,0' })?.facts).toEqual([
      { name: shellWord('level'), value: '3/20' },
      { name: shellWord('points'), value: '2' },
    ]);
  });

  it('marks the hexagon in hand and no other, so which one a growth line means is read', () => {
    const view = drawn([plane({ clusters: [cluster({ hex: '0,0' }), cluster({ hex: '1,-1' })] })], { instance: '1', hex: '1,-1' });

    expect(view?.hexes.map((hex) => [hex.hex, hex.focused])).toEqual([
      ['0,0', false],
      ['1,-1', true],
    ]);
  });

  it('lists a hexagon by the jewel standing in it, positions before slots', () => {
    const view = drawn(
      [plane({ clusters: [cluster({ title: asLocalized('Keen Edge'), positions: [position({ position: 1 }), position({ position: 2 })], slots: [slot({ direction: 'ne' })] })] })],
      { instance: '1', hex: '0,0' },
    );

    expect(view?.hexes[0].jewel).toBe('Keen Edge');
    expect(rowsOf(view!).map((row) => row[ROW.node])).toEqual([shellWord('position', { position: 1 }), shellWord('position', { position: 2 }), shellWord('slot', { direction: asLocalized('ne') })]);
  });

  it('says of every node where a point may go, and of a position bought by nobody that it was free', () => {
    const positions = [
      position({ position: 1, standing: 'allocated', free: true }),
      position({ position: 2, standing: 'allocated' }),
      position({ position: 3, standing: 'available' }),
      position({ position: 4, standing: 'unreached' }),
    ];
    const slots = [slot({ direction: 'e', standing: 'blocked', beyond: '1,0' })];
    const view = drawn([plane({ clusters: [cluster({ positions, slots })] })], { instance: '1', hex: '0,0' });

    expect(rowsOf(view!).map((row) => row[ROW.standing])).toEqual([shellWord('free'), shellWord('spent'), shellWord('ready'), shellWord('locked'), shellWord('dead')]);
  });

  it('names what a position carries, and the hexagon on the far side of a slot that has one', () => {
    const positions = [position({ title: asLocalized('Hale') }), position({ position: 2, passive: null, title: null })];
    const slots = [slot({ direction: 'e', standing: 'allocated', beyond: '1,0' }), slot({ direction: 'ne' })];
    const view = drawn([plane({ clusters: [cluster({ positions, slots })] })], { instance: '1', hex: '0,0' });

    expect(rowsOf(view!).map((row) => row[ROW.what])).toEqual(['Hale', null, '1,0', null]);
  });

  it('states what a position pays as the effective amount, with the factor that made it', () => {
    const payloads = [
      flat('mod.attack', 3),
      { statId: 'mod.max-health', statTitle: TITLE['mod.max-health'], effective: { percent: true, amount: 12 }, scale: 1 } as Payload,
      { statId: 'mod.defense', statTitle: TITLE['mod.defense'], effective: { percent: false, amount: { min: 2, max: 6 } }, scale: 1 } as Payload,
      flat('mod.attack', 4.5, 1.5),
      flat('mod.attack', -2),
    ];
    const view = drawn([plane({ clusters: [cluster({ positions: [position({ payloads })] })] })], { instance: '1', hex: '0,0' });

    expect(rowsOf(view!)[0][ROW.worth]).toBe('+3 Attack, +12% Max Health, +2-6 Defense, +4.5 Attack ×1.5, -2 Attack');
  });

  // The counter trails the magnitude and the factor both, because what is
  // printed is what one point of it pays.
  it('says what a payload is paid per, where the plane published a counter', () => {
    const payloads = [
      { ...flat('mod.attack', 3), perTitle: asLocalized('Fury') } as Payload,
      { ...flat('mod.attack', 4.5, 1.5), perTitle: asLocalized('Tonic') } as Payload,
    ];
    const view = drawn([plane({ clusters: [cluster({ positions: [position({ payloads })] })] })], { instance: '1', hex: '0,0' });

    expect(rowsOf(view!)[0][ROW.worth]).toBe('+3 Attack per Fury, +4.5 Attack ×1.5 per Tonic');
  });

  it('invents no word: every one it draws is the engine’s or the shell’s own table', () => {
    const positions = [position({ standing: 'allocated', free: true, payloads: [flat('mod.attack', 3, 1.5)] }), position({ position: 2, standing: 'available' })];
    const slots = [slot({ standing: 'blocked', beyond: '1,0' }), slot({ direction: 'ne' })];
    const report = plane({ clusters: [cluster({ positions, slots }), cluster({ hex: '1,0', title: asLocalized('Causeway') })] });
    const view = drawn([report], { instance: '1', hex: '1,0' })!;

    const allowed = new Set([...publishedWords(report), ...(Object.keys(LABELS) as LabelId[]).flatMap((id) => words(shellWord(id, NODE)))]);
    let checked = 0;
    for (const run of runs(view)) {
      for (const word of words(run)) {
        checked += 1;
        expect([...allowed], `"${word}" is on the screen and neither the engine nor the table said it`).toContain(word);
      }
    }
    // A pane whose every run was numbers would pass every word above.
    expect(checked).toBeGreaterThan(6);
  });
});

// One base with a jewel already in it, reachable in a single instant action, so
// the plane the pane draws is one the engine actually published rather than a
// literal this file wrote.
const FORGE = {
  name: 'forge',
  text: [
    '# info forge',
    'version: 1.0.0',
    '',
    '# stat attack',
    'base: 4',
    '',
    '# passive honed',
    'physical, +3 attack',
    '',
    '# cluster-jewel core',
    'shape: spindle',
    'open-connections: e',
    'passives: 1 honed',
    '',
    '# item blade',
    'title: The Blade',
    'slot: mainhand',
    'origin-cluster: core',
    'max-level: 10',
    '',
    '# location workshop',
    'x: 0, y: 0',
    'starting',
    'title: The Workshop',
    'entities:',
    '  bench',
    '',
    '# entity bench',
    'title: Bench',
    'open:',
    '  instant',
    '  give: 1 blade',
    '',
  ].join('\n'),
};

describe('the route a row opens', () => {
  it('draws the plane a screen opened from an inventory row has in hand', () => {
    const driver = createDriver([engineLocale(), FORGE]);
    const take = driver.snapshot().view!.choices.findIndex((choice) => choice.id === 'use:entity.forge.bench.open');
    driver.choose(take + 1);

    // What a row on the ledger is: the item the view publishes as carried,
    // handed to the shared command by the name the view published it under.
    const carried = Object.keys(driver.snapshot().view!.inventory);
    expect(carried).toEqual(['forge.blade']);
    driver.open(carried[0]);

    // The screen opens on that item, so the question left is which verb, and
    // growing is what puts a plane in hand.
    const asking = driver.snapshot().view!.modals[0].options[0];
    expect(asking.key).toBe('verb');
    driver.answer(asking.key, asking.values!.find((choice) => choice.value === 'grow')!.value);

    const view = focusedPlane(driver.snapshot().view, driver.localizer())!;
    expect(view.title).toBe('The Blade');
    expect(view.hexes.map((hex) => [hex.hex, hex.focused])).toEqual([['0,0', true]]);
    // The spindle's three positions and its one exit: the root the jewel came
    // with, the node a point may go to next, and two the plane has not reached.
    expect(rowsOf(view)).toEqual([
      { node: shellWord('position', { position: 1 }), standing: shellWord('free'), what: 'Honed', worth: '+3 Attack' },
      { node: shellWord('position', { position: 2 }), standing: shellWord('ready'), what: null, worth: null },
      { node: shellWord('position', { position: 3 }), standing: shellWord('locked'), what: null, worth: null },
      { node: shellWord('slot', { direction: asLocalized('e') }), standing: shellWord('locked'), what: null, worth: null },
    ]);
  });
});
