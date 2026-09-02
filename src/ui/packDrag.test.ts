import { describe, expect, it } from 'vitest';
import { letGoOf, type CellBox } from './packDrag';

const boxes: CellBox[] = [
  { key: 'bread', left: 0, top: 0, right: 100, bottom: 100 },
  { key: 'rope', left: 100, top: 0, right: 200, bottom: 100 },
  { key: 'lantern', left: 200, top: 0, right: 300, bottom: 100 },
];

const swap = (one: string, other: string): unknown => ({ kind: 'swap', one, other });

const open = (one: string): unknown => ({ kind: 'open', one });

const stay = (one: string): unknown => ({ kind: 'stay', one });

describe('where a dragged cell was let go of', () => {
  it('swaps with the cell the dragged one middle has come to rest over', () => {
    expect(letGoOf(boxes, 'bread', { x: 100, y: 0 })).toEqual(swap('bread', 'rope'));
    expect(letGoOf(boxes, 'lantern', { x: -200, y: 0 })).toEqual(swap('lantern', 'bread'));
  });

  it('names it from wherever the cell was picked up, since the middle is what is carried', () => {
    expect(letGoOf(boxes, 'bread', { x: 120, y: 30 })).toEqual(swap('bread', 'rope'));
    expect(letGoOf(boxes, 'bread', { x: 149, y: -49 })).toEqual(swap('bread', 'rope'));
  });
});

describe('a cell that was carried and let go of on nothing', () => {
  it('puts it back where it was, rather than reading the carry as a press', () => {
    expect(letGoOf(boxes, 'rope', { x: 0, y: 0 })).toEqual(stay('rope'));
    expect(letGoOf(boxes, 'rope', { x: 40, y: 20 })).toEqual(stay('rope'));
  });

  it('puts back the one carried off the grid, which is how a carry is called off', () => {
    expect(letGoOf(boxes, 'bread', { x: 0, y: 400 })).toEqual(stay('bread'));
    expect(letGoOf(boxes, 'bread', { x: 400, y: 0 })).toEqual(stay('bread'));
  });

  it('puts back rather than swapping when what was carried is not among the cells drawn', () => {
    expect(letGoOf(boxes, 'apple', { x: 100, y: 0 })).toEqual(stay('apple'));
  });
});

describe('a cell pressed rather than carried', () => {
  it('opens the one the grip called still, which is a press that never lifted at all', () => {
    expect(letGoOf(boxes, 'lantern', null)).toEqual(open('lantern'));
    expect(letGoOf(boxes, 'bread', null)).toEqual(open('bread'));
  });

  it('is the only way a cell is opened, so a carry never opens what it was carrying', () => {
    const carried = [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: -900, y: 900 }, { x: 250, y: 50 }];

    for (const box of boxes) {
      expect(letGoOf(boxes, box.key, null).kind, `${box.key} pressed`).toBe('open');
      for (const by of carried) {
        expect(letGoOf(boxes, box.key, by).kind, `${box.key} carried to ${JSON.stringify(by)}`).not.toBe('open');
      }
    }
  });

  it('asks for one of the three, always, and always about the cell it was given', () => {
    const anywhere = [null, { x: 0, y: 0 }, { x: 150, y: 0 }, { x: -900, y: 900 }, { x: 250, y: 50 }];

    for (const box of boxes) {
      for (const by of anywhere) {
        const asked = letGoOf(boxes, box.key, by);

        expect(asked.one, `${box.key} let go of at ${JSON.stringify(by)}`).toBe(box.key);
        expect(['swap', 'open', 'stay']).toContain(asked.kind);
      }
    }
  });
});
