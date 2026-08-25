import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { localizerFor } from '../runtime/localized';
import { asLocalized } from '../runtime/localizedFixture';
import type { CountedRow, PlayStatus } from '../runtime/session';
import { carried, contributionText, counted, identity, worn } from './sheet';

const localizer = localizerFor(loadInEnglish(''), 'en');

type CarriedRow = PlayStatus['carried'][number];
type WornSlot = PlayStatus['equipment'][number];

const slot = (id: string, title: string): WornSlot => ({ slot: id, title: asLocalized(title), item: null, name: null });

const EMPTY = asLocalized('Empty');
type Plane = PlayStatus['planes'][number];

const row = (over: Partial<CarriedRow> = {}): CarriedRow => ({ id: 'rope', name: asLocalized('Rope'), count: 1, shown: asLocalized('Rope x1'), grown: false, ...over });

const plane = (over: Partial<Plane> = {}): Plane => ({
  instance: '1',
  template: 'blade',
  title: asLocalized('Blade'),
  name: asLocalized('Modified Blade'),
  level: 3,
  spent: 1,
  remaining: 2,
  links: [],
  clusters: [],
  contributions: [],
  ...over,
});

type Contribution = PlayStatus['planes'][number]['contributions'][number];

const STAT = { statId: 'mod.attack', statTitle: asLocalized('Attack') };

const flat = (amount: number): Contribution => ({ ...STAT, added: { min: amount, max: amount }, increased: 0 });

describe('the counted rows the engine publishes, as a sheet draws them', () => {
  const number = (id: string, title: string, value: number): CountedRow => ({ id, title: asLocalized(title), value });

  it('sorts by name, so a row does not move when its number does', () => {
    const rows = [number('r', 'rope', 2), number('c', 'chestnut', 5), number('a', 'awl', 1)];

    expect(counted(rows, localizer).map((entry) => entry.name)).toEqual(['awl', 'chestnut', 'rope']);
  });

  it('reads a whole number as one and a fraction as one place, the way every other readout does', () => {
    expect(counted([number('coins', 'coins', 12), number('luck', 'luck', 0.25)], localizer)).toEqual([
      { id: 'coins', name: 'coins', value: '12' },
      { id: 'luck', name: 'luck', value: '0.3' },
    ]);
  });

  it('names a row by the title the engine published on it', () => {
    expect(counted([number('base.guile', 'Guile', 3), number('base.attack', 'Attack', 7)], localizer)).toEqual([
      { id: 'base.attack', name: 'Attack', value: '7' },
      { id: 'base.guile', name: 'Guile', value: '3' },
    ]);
  });

  it('has nothing to draw for a player carrying nothing', () => {
    expect(counted([], localizer)).toEqual([]);
    expect(carried([], [], localizer)).toEqual([]);
    expect(worn([], [], [], localizer, EMPTY)).toEqual([]);
  });
});

describe('what the player carries, as rows', () => {
  it('states the engine name and puts the count in the count column', () => {
    const rows = carried([row({ id: 'awl', name: asLocalized('Awl'), count: 3 })], [], localizer);
    expect(rows).toEqual([{ id: 'awl', name: 'Awl', value: '3' }]);
  });

  it('counts a grown copy as one, and never as the item it grew from', () => {
    const rows = carried([row({ id: '1', name: asLocalized('Modified Blade'), count: 1, grown: true })], [], localizer);
    expect(rows[0].value).toBe('1');
    expect(rows[0].name).toBe('Modified Blade');
  });

  it('sorts by name and keeps two copies of one name apart by the id they are of', () => {
    const two = [
      row({ id: '3', name: asLocalized('Modified Blade'), grown: true }),
      row({ id: '1', name: asLocalized('Modified Blade'), grown: true }),
      row({ id: 'awl', name: asLocalized('Awl') }),
    ];
    expect(carried(two, [], localizer).map((entry) => entry.id)).toEqual(['awl', '1', '3']);
  });

  it('states the stat summary beneath a grown copy, read from the plane the engine published', () => {
    const grown = row({ id: '1', name: asLocalized('Modified Blade'), grown: true });
    const published = plane({ instance: '1', contributions: [flat(15), { statId: 'mod.max-health', statTitle: asLocalized('Max Health'), added: { min: 0, max: 0 }, increased: 25 }] });
    expect(carried([grown], [published], localizer)[0].detail).toBe('+15 Attack, +25% Max Health');
  });

  it('leaves a stack without a summary, because a stack copy is what its item already says it is', () => {
    const stack = row({ id: 'blade', name: asLocalized('Blade') });
    const published = plane({ instance: 'blade', contributions: [flat(15)] });
    expect(carried([stack], [published], localizer)[0].detail).toBeUndefined();
  });

  it('leaves a grown copy whose plane is worth nothing without an empty line beneath it', () => {
    const grown = row({ id: '1', name: asLocalized('Modified Blade'), grown: true });
    expect(carried([grown], [plane({ instance: '1' })], localizer)[0].detail).toBeUndefined();
  });
});

describe('a contribution, as words', () => {
  it('states a range as a range and a percent channel apart from a flat one', () => {
    expect(contributionText([{ ...STAT, added: { min: 2, max: 6 }, increased: 10 }], localizer)).toBe('+2-6 Attack, +10% Attack');
  });

  it('signs a penalty and says nothing about a channel that is empty', () => {
    expect(contributionText([{ ...STAT, added: { min: -3, max: -3 }, increased: 0 }], localizer)).toBe('-3 Attack');
    expect(contributionText([{ ...STAT, added: { min: 0, max: 0 }, increased: 0 }], localizer)).toBe('');
  });
});

describe('what the player is wearing, as rows', () => {
  it('names the slot by its title and the thing in it by its name, never by an id', () => {
    const rows = [
      row({ id: '1', name: asLocalized('Modified Blade'), grown: true, worn: { slot: 'mainhand', title: asLocalized('Main Hand') } }),
      row({ id: 'worn:back', name: asLocalized('Cloak'), worn: { slot: 'back', title: asLocalized('Back') } }),
    ];
    expect(worn([slot('mainhand', 'Main Hand'), slot('back', 'Back')], rows, [], localizer, EMPTY)).toEqual([
      { id: 'worn:back', name: 'Back', value: 'Cloak' },
      { id: '1', name: 'Main Hand', value: 'Modified Blade' },
    ]);
  });

  it('states a worn grown copy’s contribution beneath its name', () => {
    const rows = [row({ id: '1', name: asLocalized('Modified Blade'), grown: true, worn: { slot: 'mainhand', title: asLocalized('Main Hand') } })];
    const published = plane({ instance: '1', contributions: [flat(15)] });

    expect(worn([slot('mainhand', 'Main Hand')], rows, [published], localizer, EMPTY)[0].detail).toBe('+15 Attack');
  });

  it('leaves a worn stack copy without a summary, the way the carried page leaves its stack', () => {
    const rows = [row({ id: 'worn:mainhand', name: asLocalized('Blade'), worn: { slot: 'mainhand', title: asLocalized('Main Hand') } })];
    const published = plane({ instance: 'worn:mainhand', contributions: [flat(15)] });

    expect(worn([slot('mainhand', 'Main Hand')], rows, [published], localizer, EMPTY)[0].detail).toBeUndefined();
  });

  it('draws a slot with nothing in it as a slot, and gives it nothing to open', () => {
    const rows = [row({ id: '1', name: asLocalized('Blade'), worn: { slot: 'mainhand', title: asLocalized('Main Hand') } })];

    expect(worn([slot('mainhand', 'Main Hand'), slot('back', 'Back')], rows, [], localizer, EMPTY)).toEqual([
      { name: 'Back', value: 'Empty' },
      { id: '1', name: 'Main Hand', value: 'Blade' },
    ]);
  });

  it('carries where the slot sits onto the row, and leaves a slot that declares none without one', () => {
    const rows = [row({ id: '1', name: asLocalized('Blade'), worn: { slot: 'mainhand', title: asLocalized('Main Hand') } })];
    const placed = { ...slot('mainhand', 'Main Hand'), at: { column: 1, row: 2 } };

    expect(worn([placed, slot('back', 'Back')], rows, [], localizer, EMPTY)).toEqual([
      { name: 'Back', value: 'Empty' },
      { id: '1', name: 'Main Hand', value: 'Blade', at: { column: 1, row: 2 } },
    ]);
  });

  it('leaves the worn rows to this page and off the one that lists what is carried', () => {
    const rows = [
      row({ id: 'blade', name: asLocalized('Blade'), count: 2 }),
      row({ id: 'worn:mainhand', name: asLocalized('Blade'), worn: { slot: 'mainhand', title: asLocalized('Main Hand') } }),
    ];

    expect(carried(rows, [], localizer).map((entry) => entry.id)).toEqual(['blade']);
    expect(worn([slot('mainhand', 'Main Hand')], rows, [], localizer, EMPTY)).toEqual([{ id: 'worn:mainhand', name: 'Main Hand', value: 'Blade' }]);
  });
});

describe('the sheet says who the player is', () => {
  const rows = (over: Partial<PlayStatus['player']> = {}): PlayStatus['player'] => ({
    name: { id: 'Rowan', label: asLocalized('Name'), title: asLocalized('Rowan') },
    race: { id: 'core.elf', label: asLocalized('Race'), title: asLocalized('Elf') },
    ...over,
  });

  it('draws two rows against the words the world has for them, and never the race id', () => {
    expect(identity(rows())).toEqual([
      { id: 'Rowan', name: 'Name', value: 'Rowan' },
      { id: 'core.elf', name: 'Race', value: 'Elf' },
    ]);
  });

  it('draws one row for a player who has answered one question of the two', () => {
    expect(identity(rows({ race: null })).map((entry) => entry.name)).toEqual(['Name']);
  });
});
