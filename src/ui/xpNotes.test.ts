import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { PlayView } from '../runtime/session';
import { skillLevel, xpForLevel } from '../runtime/skills';
import { arrivalsBetween, emptyQueue, gainsBetween, NOTE_LIFETIME_MS, NOTE_SPACING_MS, poured, queued, risesOf, type Arrival, type Gain, type Note } from './xpNotes';

type Row = PlayView['xp'][number];

// A published skill row. What the notes read is the total alone, so the level
// beside it is whatever the curve says and is never looked at here.
const row = (id: string, value: number): Row => {
  const level = skillLevel(value);
  const foot = xpForLevel(level);
  return { id, title: asLocalized(id[0].toUpperCase() + id.slice(1)), value, level, earned: value - foot, span: xpForLevel(level + 1) - foot };
};

const gain = (id: string, amount: number): Gain => ({ id, title: asLocalized(id[0].toUpperCase() + id.slice(1)), amount });

const titles = (rises: ReturnType<typeof risesOf>): Array<[number, string[]]> => rises.map((rise) => [rise.amount, rise.titles.map((title) => title as unknown as string)]);

const risesIn = (note: Note): ReturnType<typeof risesOf> => (note.kind === 'xp' ? note.rises : []);

type Carried = PlayView['carried'][number];

const carried = (id: string, count: number): Carried => ({ id, name: asLocalized(id[0].toUpperCase() + id.slice(1)), count, shown: asLocalized(`${id} x${count}`), grown: false });

const arrival = (id: string, count: number): Arrival => ({ id, name: asLocalized(id[0].toUpperCase() + id.slice(1)), count });

describe('what was just earned', () => {
  it('is the difference between two readings of the same published totals', () => {
    const before = [row('attack', 100), row('defence', 40)];
    const after = [row('attack', 200), row('defence', 40)];

    expect(gainsBetween(before, after)).toEqual([{ id: 'attack', title: asLocalized('Attack'), amount: 100 }]);
  });

  it('counts a skill the player had never earned in as having come from nothing', () => {
    expect(gainsBetween([], [row('thieving', 25)])).toMatchObject([{ id: 'thieving', amount: 25 }]);
  });

  it('is nothing when nothing moved, and nothing for a total that went backwards', () => {
    expect(gainsBetween([row('attack', 100)], [row('attack', 100)])).toEqual([]);
    expect(gainsBetween([row('attack', 100)], [row('attack', 60)])).toEqual([]);
  });
});

describe('the line it makes', () => {
  it('names the skills together when one thing happened to all of them', () => {
    expect(titles(risesOf([gain('attack', 737), gain('defence', 737), gain('health', 737)]))).toEqual([[737, ['Attack', 'Defence', 'Health']]]);
  });

  it('keeps two different amounts apart, largest first, and drops neither', () => {
    expect(titles(risesOf([gain('attack', 50), gain('thieving', 400)]))).toEqual([
      [400, ['Thieving']],
      [50, ['Attack']],
    ]);
  });

  it('is one skill on its own when only one gained', () => {
    expect(titles(risesOf([gain('attack', 100)]))).toEqual([[100, ['Attack']]]);
  });
});

describe('how often a line may begin', () => {
  it('begins one the moment there is something to say', () => {
    const queue = poured(queued(emptyQueue, [gain('attack', 100)]), 0);

    expect(queue.shown).toHaveLength(1);
    expect(queue.waiting).toHaveLength(0);
  });

  it('begins no second line inside the spacing', () => {
    const first = poured(queued(emptyQueue, [gain('attack', 100)]), 0);
    const held = poured(queued(first, [gain('defence', 5)]), NOTE_SPACING_MS - 1);

    expect(held.shown).toHaveLength(1);
    expect(held.waiting).toHaveLength(1);
  });

  it('does not drop what landed inside it: the wait joins the next line', () => {
    const first = poured(queued(emptyQueue, [gain('attack', 100)]), 0);
    const waited = poured(queued(first, [gain('defence', 5)]), NOTE_SPACING_MS - 1);
    const next = poured(queued(waited, [gain('health', 5)]), NOTE_SPACING_MS);

    expect(next.shown).toHaveLength(2);
    expect(next.waiting).toHaveLength(0);
    expect(titles(risesIn(next.shown[1]))).toEqual([[5, ['Defence', 'Health']]]);
  });

  it('begins a second line once the spacing has passed', () => {
    const first = poured(queued(emptyQueue, [gain('attack', 100)]), 0);
    const second = poured(queued(first, [gain('defence', 5)]), NOTE_SPACING_MS);

    expect(second.shown).toHaveLength(2);
    expect(second.shown.map((note) => note.id)).toEqual([1, 2]);
  });

  it('begins nothing at all while there is nothing to say', () => {
    expect(poured(emptyQueue, 10_000)).toBe(emptyQueue);
  });
});

describe('what has just arrived', () => {
  it('is the difference between two readings of what the player is carrying', () => {
    expect(arrivalsBetween([carried('rope', 1)], [carried('rope', 3)])).toMatchObject([{ id: 'rope', count: 2 }]);
  });

  it('counts a row the player did not have at all as having wholly arrived', () => {
    expect(arrivalsBetween([], [carried('blade', 1)])).toMatchObject([{ id: 'blade', count: 1 }]);
  });

  it('is nothing for a row that did not move, and nothing for one that was spent', () => {
    expect(arrivalsBetween([carried('rope', 3)], [carried('rope', 3)])).toEqual([]);
    expect(arrivalsBetween([carried('rope', 3)], [carried('rope', 1)])).toEqual([]);
  });

  it('says each thing on its own line, one after the other, rather than in one breath', () => {
    const told = queued(emptyQueue, [], [arrival('rope', 1), arrival('blade', 1)]);
    const first = poured(told, 0);
    const second = poured(first, NOTE_SPACING_MS);

    expect(first.shown).toHaveLength(1);
    expect(first.waiting).toHaveLength(1);
    expect(second.shown.map((note) => (note.kind === 'item' ? (note.name as unknown as string) : 'xp'))).toEqual(['Rope', 'Blade']);
  });

  it('says what was earned in one line and still owes a line for each thing', () => {
    const told = queued(emptyQueue, [gain('attack', 10), gain('defence', 10)], [arrival('rope', 2)]);
    const first = poured(told, 0);

    expect(first.shown).toHaveLength(1);
    expect(titles(risesIn(first.shown[0]))).toEqual([[10, ['Attack', 'Defence']]]);
    expect(first.waiting).toHaveLength(1);
    expect(poured(first, NOTE_SPACING_MS).shown[1]).toMatchObject({ kind: 'item', count: 2 });
  });

  it('carries how many arrived, so two of a thing is not two lines', () => {
    const shown = poured(queued(emptyQueue, [], [arrival('rope', 5)]), 0);

    expect(shown.shown[0]).toMatchObject({ kind: 'item', count: 5 });
    expect(shown.waiting).toHaveLength(0);
  });
});

describe('how a line leaves', () => {
  it('has gone once its lifetime is up, without anything asking it to', () => {
    const shown = poured(queued(emptyQueue, [gain('attack', 100)]), 0);

    expect(poured(shown, NOTE_LIFETIME_MS - 1).shown).toHaveLength(1);
    expect(poured(shown, NOTE_LIFETIME_MS).shown).toHaveLength(0);
  });

  it('takes the older of two with it and leaves the younger, each on its own clock', () => {
    const first = poured(queued(emptyQueue, [gain('attack', 100)]), 0);
    const second = poured(queued(first, [gain('defence', 5)]), NOTE_SPACING_MS);
    const later = poured(second, NOTE_LIFETIME_MS + 1);

    expect(later.shown.map((note) => note.id)).toEqual([2]);
  });

  it('is two seconds, which is the wait the page was designed around', () => {
    expect(NOTE_LIFETIME_MS).toBe(2000);
    expect(NOTE_SPACING_MS).toBe(500);
  });
});
