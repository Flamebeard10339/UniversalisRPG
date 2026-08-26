import { describe, expect, it } from 'vitest';
import { letGoOf, type CellBox } from './packDrag';

// Three cells of a hundred pixels each, side by side with no gap, which is enough shape for every
// question here: what a real grid settles on is measured, and nothing below reads a column count.
const boxes: CellBox[] = [
  { key: 'bread', left: 0, top: 0, right: 100, bottom: 100 },
  { key: 'rope', left: 100, top: 0, right: 200, bottom: 100 },
  { key: 'lantern', left: 200, top: 0, right: 300, bottom: 100 },
];

const swap = (one: string, other: string): unknown => ({ kind: 'swap', one, other });

const open = (one: string): unknown => ({ kind: 'open', one });

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

// The bug this answers: a tap that drifted past the slop a drag starts at was read as a drag, landed
// on nothing, and did nothing at all. Every way of coming to rest on nothing opens the thing, so no
// press on a cell is ever swallowed.
describe('a cell let go of on nothing', () => {
  it('opens the one put back down where it was, since it has swapped nothing', () => {
    expect(letGoOf(boxes, 'rope', { x: 0, y: 0 })).toEqual(open('rope'));
    expect(letGoOf(boxes, 'rope', { x: 40, y: 20 })).toEqual(open('rope'));
  });

  it('opens the one carried off the grid, rather than leaving the press unanswered', () => {
    expect(letGoOf(boxes, 'bread', { x: 0, y: 400 })).toEqual(open('bread'));
    expect(letGoOf(boxes, 'bread', { x: 400, y: 0 })).toEqual(open('bread'));
  });

  it('opens the one the grip called still, which is a press that never travelled at all', () => {
    expect(letGoOf(boxes, 'lantern', null)).toEqual(open('lantern'));
  });

  it('opens rather than swapping when what was dragged is not among the cells drawn', () => {
    expect(letGoOf(boxes, 'apple', { x: 100, y: 0 })).toEqual(open('apple'));
  });

  it('asks for one of the two, always, wherever it was let go of and whichever cell it was', () => {
    const anywhere = [null, { x: 0, y: 0 }, { x: 150, y: 0 }, { x: -900, y: 900 }, { x: 250, y: 50 }];

    for (const box of boxes) {
      for (const by of anywhere) {
        const asked = letGoOf(boxes, box.key, by);

        expect(asked.one, `${box.key} let go of at ${JSON.stringify(by)}`).toBe(box.key);
        expect(['swap', 'open']).toContain(asked.kind);
      }
    }
  });
});
