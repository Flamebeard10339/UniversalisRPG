import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { PlayView } from '../runtime/session';
import { skillLevel, xpForLevel } from '../runtime/skills';
import { arrivalsBetween, emptyQueue, foldGains, gainsBetween, heard, NOTE_LIFETIME_MS, NOTE_SPACING_MS, poured, risesOf, type Arrival, type Gain, type NoteQueue } from './xpNotes';

type Row = PlayView['xp'][number];
type Carried = PlayView['carried'][number];

const named = (id: string): string => id[0].toUpperCase() + id.slice(1);

const row = (id: string, value: number): Row => {
  const level = skillLevel(value);
  const foot = xpForLevel(level);
  return { id, title: asLocalized(named(id)), value, level, earned: value - foot, span: xpForLevel(level + 1) - foot };
};

const carried = (id: string, count: number): Carried => ({ id, name: asLocalized(named(id)), count, shown: asLocalized(`${id} x${count}`), grown: false });

const gain = (id: string, amount: number): Gain => ({ id, title: asLocalized(named(id)), amount });

const arrival = (id: string, count: number): Arrival => ({ id, name: asLocalized(named(id)), count });

const told = (queue: NoteQueue, gains: readonly Gain[], arrivals: readonly Arrival[], now: number): NoteQueue => poured(heard(queue, gains, arrivals, now), now);

const tick = (queue: NoteQueue, now: number): NoteQueue => poured(queue, now);

const spell = (title: unknown): string => title as string;

const said = (queue: NoteQueue): string[] =>
  queue.shown.map((note) =>
    note.kind === 'item'
      ? `+${note.count} ${spell(note.name)}`
      : risesOf(note.gains)
          .map((rise) => `+${rise.amount} ${rise.titles.map(spell).join(', ')}`)
          .join(', '),
  );

const titles = (rises: ReturnType<typeof risesOf>): Array<[number, string[]]> => rises.map((rise) => [rise.amount, rise.titles.map(spell)]);

describe('what was just earned', () => {
  it('is the difference between two readings of the same published totals', () => {
    expect(gainsBetween([row('attack', 100), row('defence', 40)], [row('attack', 200), row('defence', 40)])).toMatchObject([{ id: 'attack', amount: 100 }]);
  });

  it('counts a skill the player had never earned in as having come from nothing', () => {
    expect(gainsBetween([], [row('thieving', 25)])).toMatchObject([{ id: 'thieving', amount: 25 }]);
  });

  it('is nothing when nothing moved, and nothing for a total that went backwards', () => {
    expect(gainsBetween([row('attack', 100)], [row('attack', 100)])).toEqual([]);
    expect(gainsBetween([row('attack', 100)], [row('attack', 60)])).toEqual([]);
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
});

describe('one number per skill', () => {
  it('adds two grants to one skill together, whatever the world did to reach them', () => {
    expect(foldGains([gain('cooking', 7), gain('cooking', 4), gain('cooking', 6)])).toEqual([gain('cooking', 17)]);
  });

  it('leaves two skills apart', () => {
    expect(foldGains([gain('attack', 3), gain('defence', 5)])).toHaveLength(2);
  });

  it('names the skills together when one number is what they are all standing at', () => {
    expect(titles(risesOf([gain('attack', 737), gain('defence', 737), gain('health', 737)]))).toEqual([[737, ['Attack', 'Defence', 'Health']]]);
  });

  it('keeps two different numbers apart, largest first, and drops neither', () => {
    expect(titles(risesOf([gain('attack', 50), gain('thieving', 400)]))).toEqual([
      [400, ['Thieving']],
      [50, ['Attack']],
    ]);
  });
});

describe('a line already saying it', () => {
  it('counts up rather than being followed by a second line saying the same', () => {
    let queue = told(emptyQueue, [gain('cooking', 7)], [], 0);
    queue = told(queue, [gain('cooking', 4)], [], 900);
    queue = told(queue, [gain('cooking', 6)], [], 1800);

    expect(said(queue)).toEqual(['+17 Cooking']);
  });

  it('takes what it is told straight away, without waiting on the spacing', () => {
    const queue = told(told(emptyQueue, [gain('cooking', 7)], [], 0), [gain('cooking', 4)], [], 1);

    expect(said(queue)).toEqual(['+11 Cooking']);
  });

  it('counts the same thing arriving up too, so a run of them is one line', () => {
    let queue = told(emptyQueue, [], [arrival('chestnut', 1)], 0);
    for (const at of [700, 1400, 2100]) queue = told(queue, [], [arrival('chestnut', 1)], at);

    expect(said(queue)).toEqual(['+4 Chestnut']);
  });

  it('starts again from nothing once the work has stopped for a while', () => {
    const gone = tick(told(emptyQueue, [], [arrival('chestnut', 1)], 0), NOTE_LIFETIME_MS);
    const again = told(gone, [], [arrival('chestnut', 1)], NOTE_LIFETIME_MS + 1);

    expect(said(gone)).toEqual([]);
    expect(said(again)).toEqual(['+1 Chestnut']);
  });

  it('stays while it is being fed, however long the work lasts', () => {
    let queue = told(emptyQueue, [], [arrival('chestnut', 1)], 0);
    for (let at = 1500; at <= 12_000; at += 1500) queue = told(queue, [], [arrival('chestnut', 1)], at);

    expect(said(queue)).toEqual(['+9 Chestnut']);
  });

  it('is the line about the same skills, so a different set of them is a line of its own', () => {
    const queue = told(told(emptyQueue, [gain('attack', 5), gain('defence', 5)], [], 0), [gain('cooking', 3)], [], NOTE_SPACING_MS);

    expect(said(queue)).toEqual(['+5 Attack, Defence', '+3 Cooking']);
  });
});

describe('how often a line may begin', () => {
  it('begins one the moment there is something to say', () => {
    expect(told(emptyQueue, [gain('attack', 100)], [], 0).shown).toHaveLength(1);
  });

  it('begins no second line inside the spacing, and drops nothing that landed there', () => {
    const held = told(told(emptyQueue, [], [arrival('rope', 1)], 0), [], [arrival('blade', 1)], NOTE_SPACING_MS - 1);

    expect(held.shown).toHaveLength(1);
    expect(held.waiting).toHaveLength(1);
    expect(said(tick(held, NOTE_SPACING_MS))).toEqual(['+1 Rope', '+1 Blade']);
  });

  it('is a fifth of a second, which is the pace the page was designed around', () => {
    expect(NOTE_SPACING_MS).toBe(200);
    expect(NOTE_LIFETIME_MS).toBe(2000);
  });

  it('begins nothing at all while there is nothing to say', () => {
    expect(tick(emptyQueue, 10_000)).toBe(emptyQueue);
  });
});

describe('where a line stands', () => {
  it('gives the first line the first place', () => {
    expect(told(emptyQueue, [gain('attack', 1)], [], 0).shown[0].slot).toBe(0);
  });

  it('gives a line beginning beside another a place of its own', () => {
    const first = told(emptyQueue, [], [arrival('rope', 1), arrival('blade', 1)], 0);

    expect(tick(first, NOTE_SPACING_MS).shown.map((note) => note.slot)).toEqual([0, 1]);
  });

  it('leaves every line where it was when one of them goes', () => {
    let queue = heard(emptyQueue, [], [arrival('a', 1), arrival('b', 1), arrival('c', 1)], 0);
    for (const at of [0, NOTE_SPACING_MS, NOTE_SPACING_MS * 2]) queue = tick(queue, at);
    const places = new Map(queue.shown.map((note) => [note.id, note.slot]));

    const after = tick(queue, NOTE_LIFETIME_MS);

    expect(queue.shown).toHaveLength(3);
    expect(after.shown.map((note) => note.id)).toEqual([2, 3]);
    for (const note of after.shown) expect(note.slot, `line ${note.id} moved`).toBe(places.get(note.id));
  });

  it('gives the place a line has left to the next one that begins', () => {
    const waiting = heard(told(emptyQueue, [], [arrival('a', 1)], 0), [], [arrival('b', 1)], 1);
    const after = tick(waiting, NOTE_LIFETIME_MS);

    expect(after.shown.map((note) => note.slot)).toEqual([0]);
    expect(after.shown[0].id).toBe(2);
  });
});

describe('how a line leaves', () => {
  it('has gone once nothing has added to it for a lifetime', () => {
    const shown = told(emptyQueue, [gain('attack', 100)], [], 0);

    expect(tick(shown, NOTE_LIFETIME_MS - 1).shown).toHaveLength(1);
    expect(tick(shown, NOTE_LIFETIME_MS).shown).toHaveLength(0);
  });

  it('takes the older of two with it and leaves the younger, each on its own clock', () => {
    const second = told(told(emptyQueue, [], [arrival('rope', 1)], 0), [], [arrival('blade', 1)], NOTE_SPACING_MS);

    expect(tick(second, NOTE_LIFETIME_MS + 1).shown.map((note) => note.id)).toEqual([2]);
  });
});
