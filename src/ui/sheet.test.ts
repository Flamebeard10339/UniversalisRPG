import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { localizerFor } from '../runtime/localized';
import { asLocalized } from '../runtime/localizedFixture';
import type { CountedRow, PlayStatus } from '../runtime/session';
import { carried, contributionText, counted, worn } from './sheet';

// A row's ids and counts belong to no language, so what they are read through is
// what every other surface reads them through.
const localizer = localizerFor(loadInEnglish(''), 'en');

type CarriedRow = PlayStatus['carried'][number];
type Plane = PlayStatus['planes'][number];

const row = (over: Partial<CarriedRow> = {}): CarriedRow => ({ id: 'rope', name: asLocalized('Rope'), count: 1, shown: asLocalized('Rope x1'), grown: false, ...over });

const plane = (over: Partial<Plane> = {}): Plane => ({
  instance: '1',
  template: 'blade',
  title: asLocalized('Blade'),
  name: asLocalized('Modified Blade'),
  level: 3,
  maxLevel: 20,
  spent: 1,
  remaining: 2,
  links: [],
  clusters: [],
  contributions: [],
  ...over,
});

type Contribution = PlayStatus['planes'][number]['contributions'][number];

// One stat, keyed and named, so a row that spelled the id reads differently
// from one that spelled the title.
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

  // c9, c10: a row is called what the engine published it as, and sorts under
  // that, so the id it was keyed under never reaches the page.
  it('names a row by the title the engine published on it', () => {
    expect(counted([number('base.guile', 'Guile', 3), number('base.attack', 'Attack', 7)], localizer)).toEqual([
      { id: 'base.attack', name: 'Attack', value: '7' },
      { id: 'base.guile', name: 'Guile', value: '3' },
    ]);
  });

  it('has nothing to draw for a player carrying nothing', () => {
    expect(counted([], localizer)).toEqual([]);
    expect(carried([], [], localizer)).toEqual([]);
    expect(worn([], [], localizer)).toEqual([]);
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
    expect(worn(rows, [], localizer)).toEqual([
      { id: 'worn:back', name: 'Back', value: 'Cloak' },
      { id: '1', name: 'Main Hand', value: 'Modified Blade' },
    ]);
  });

  // c18: a grown copy is legible on the page it is listed on, and c21 makes this
  // the only page a worn one is listed on — so the summary that tells two of
  // them apart has to be here rather than only on the carried page.
  it('states a worn grown copy’s contribution beneath its name', () => {
    const rows = [row({ id: '1', name: asLocalized('Modified Blade'), grown: true, worn: { slot: 'mainhand', title: asLocalized('Main Hand') } })];
    const published = plane({ instance: '1', contributions: [flat(15)] });

    expect(worn(rows, [published], localizer)[0].detail).toBe('+15 Attack');
  });

  it('leaves a worn stack copy without a summary, the way the carried page leaves its stack', () => {
    const rows = [row({ id: 'worn:mainhand', name: asLocalized('Blade'), worn: { slot: 'mainhand', title: asLocalized('Main Hand') } })];
    const published = plane({ instance: 'worn:mainhand', contributions: [flat(15)] });

    expect(worn(rows, [published], localizer)[0].detail).toBeUndefined();
  });

  // c21: one copy, one page. The engine says which side a row is on and this
  // page is the one that draws the worn side, so the carried page draws the rest.
  // The two rows are of one item and are two copies, so the ids differ and the
  // press each page sends reaches the copy that page drew.
  it('leaves the worn rows to this page and off the one that lists what is carried', () => {
    const rows = [
      row({ id: 'blade', name: asLocalized('Blade'), count: 2 }),
      row({ id: 'worn:mainhand', name: asLocalized('Blade'), worn: { slot: 'mainhand', title: asLocalized('Main Hand') } }),
    ];

    expect(carried(rows, [], localizer).map((entry) => entry.id)).toEqual(['blade']);
    expect(worn(rows, [], localizer)).toEqual([{ id: 'worn:mainhand', name: 'Main Hand', value: 'Blade' }]);
  });
});
