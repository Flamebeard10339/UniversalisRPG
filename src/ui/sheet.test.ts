import { describe, expect, it } from 'vitest';
import type { PlayStatus } from '../runtime/session';
import { carried, contributionText, counted, worn } from './sheet';

type CarriedRow = PlayStatus['carried'][number];
type Plane = PlayStatus['planes'][number];

const row = (over: Partial<CarriedRow> = {}): CarriedRow => ({ id: 'rope', name: 'Rope', count: 1, value: 'Rope x1', grown: false, ...over });

const plane = (over: Partial<Plane> = {}): Plane => ({
  instance: '1',
  template: 'blade',
  title: 'Blade',
  name: 'Modified Blade',
  level: 3,
  maxLevel: 20,
  spent: 1,
  remaining: 2,
  clusters: [],
  contributions: [],
  ...over,
});

const flat = (statId: string, amount: number): PlayStatus['planes'][number]['contributions'][number] => ({ statId, added: { min: amount, max: amount }, increased: 0 });

describe('a published dictionary as rows', () => {
  it('sorts by name, so a row does not move when its number does', () => {
    expect(counted({ rope: 2, chestnut: 5, awl: 1 }).map((entry) => entry.name)).toEqual(['awl', 'chestnut', 'rope']);
  });

  it('reads a whole number as one and a fraction as one place, the way every other readout does', () => {
    expect(counted({ coins: 12, luck: 0.25 })).toEqual([
      { name: 'coins', value: '12' },
      { name: 'luck', value: '0.3' },
    ]);
  });

  it('has nothing to draw for a player carrying nothing', () => {
    expect(counted({})).toEqual([]);
    expect(carried([], [])).toEqual([]);
    expect(worn({}, [])).toEqual([]);
  });
});

describe('what the player carries, as rows', () => {
  it('states the engine name and puts the count in the count column', () => {
    const rows = carried([row({ id: 'awl', name: 'Awl', count: 3 })], []);
    expect(rows).toEqual([{ id: 'awl', name: 'Awl', value: '3' }]);
  });

  it('counts a grown copy as one, and never as the item it grew from', () => {
    const rows = carried([row({ id: '1', name: 'Modified Blade', count: 1, grown: true })], []);
    expect(rows[0].value).toBe('1');
    expect(rows[0].name).toBe('Modified Blade');
  });

  it('sorts by name and keeps two copies of one name apart by the id they are of', () => {
    const two = [
      row({ id: '3', name: 'Modified Blade', grown: true }),
      row({ id: '1', name: 'Modified Blade', grown: true }),
      row({ id: 'awl', name: 'Awl' }),
    ];
    expect(carried(two, []).map((entry) => entry.id)).toEqual(['awl', '1', '3']);
  });

  it('states the stat summary beneath a grown copy, read from the plane the engine published', () => {
    const grown = row({ id: '1', name: 'Modified Blade', grown: true });
    const published = plane({ instance: '1', contributions: [flat('mod.attack', 15), { statId: 'mod.max-health', added: { min: 0, max: 0 }, increased: 25 }] });
    expect(carried([grown], [published])[0].detail).toBe('+15 attack, +25% max-health');
  });

  it('leaves a stack without a summary, because a stack copy is what its item already says it is', () => {
    const stack = row({ id: 'blade', name: 'Blade' });
    const published = plane({ instance: 'blade', contributions: [flat('mod.attack', 15)] });
    expect(carried([stack], [published])[0].detail).toBeUndefined();
  });

  it('leaves a grown copy whose plane is worth nothing without an empty line beneath it', () => {
    const grown = row({ id: '1', name: 'Modified Blade', grown: true });
    expect(carried([grown], [plane({ instance: '1' })])[0].detail).toBeUndefined();
  });
});

describe('a contribution, as words', () => {
  it('states a range as a range and a percent channel apart from a flat one', () => {
    expect(contributionText([{ statId: 'mod.attack', added: { min: 2, max: 6 }, increased: 10 }])).toBe('+2-6 attack, +10% attack');
  });

  it('signs a penalty and says nothing about a channel that is empty', () => {
    expect(contributionText([{ statId: 'mod.attack', added: { min: -3, max: -3 }, increased: 0 }])).toBe('-3 attack');
    expect(contributionText([{ statId: 'mod.attack', added: { min: 0, max: 0 }, increased: 0 }])).toBe('');
  });
});

describe('what the player is wearing, as rows', () => {
  it('names the slot and the thing in it, never the id the slot holds', () => {
    const rows = [row({ id: '1', name: 'Modified Blade', grown: true }), row({ id: 'cloak', name: 'Cloak' })];
    expect(worn({ mainhand: '1', back: 'cloak' }, rows)).toEqual([
      { name: 'back', value: 'Cloak' },
      { name: 'mainhand', value: 'Modified Blade' },
    ]);
  });

  it('falls back to the id for a slot holding something the player no longer carries', () => {
    expect(worn({ mainhand: '9' }, [])).toEqual([{ name: 'mainhand', value: '9' }]);
  });

  // c21: one copy, one page. The engine says which side a row is on and this
  // page is the one that draws the worn side, so the carried page draws the rest.
  it('leaves the worn rows to this page and off the one that lists what is carried', () => {
    const rows = [row({ id: 'blade', name: 'Blade', count: 2, value: 'Blade x2' }), row({ id: 'blade', name: 'Blade', value: 'Blade (mainhand)', slot: 'mainhand' })];

    expect(carried(rows, []).map((entry) => entry.value)).toEqual(['2']);
    expect(worn({ mainhand: 'blade' }, rows)).toEqual([{ name: 'mainhand', value: 'Blade' }]);
  });
});
