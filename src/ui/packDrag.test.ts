import { describe, expect, it } from 'vitest';
import { droppedOn, type CellBox } from './packDrag';

// Three cells of a hundred pixels each, side by side with no gap, which is enough shape for every
// question here: what a real grid settles on is measured, and nothing below reads a column count.
const boxes: CellBox[] = [
  { key: 'bread', left: 0, top: 0, right: 100, bottom: 100 },
  { key: 'rope', left: 100, top: 0, right: 200, bottom: 100 },
  { key: 'lantern', left: 200, top: 0, right: 300, bottom: 100 },
];

describe('where a dragged cell was let go of', () => {
  it('names the cell the dragged one middle has come to rest over', () => {
    expect(droppedOn(boxes, 'bread', { x: 100, y: 0 })).toBe('rope');
    expect(droppedOn(boxes, 'lantern', { x: -200, y: 0 })).toBe('bread');
  });

  it('names it from wherever the cell was picked up, since the middle is what is carried', () => {
    expect(droppedOn(boxes, 'bread', { x: 120, y: 30 })).toBe('rope');
    expect(droppedOn(boxes, 'bread', { x: 149, y: -49 })).toBe('rope');
  });

  it('swaps nothing for a cell put back down where it was', () => {
    expect(droppedOn(boxes, 'rope', { x: 0, y: 0 })).toBeNull();
    expect(droppedOn(boxes, 'rope', { x: 40, y: 20 })).toBeNull();
  });

  it('swaps nothing for a cell dropped off the grid', () => {
    expect(droppedOn(boxes, 'bread', { x: 0, y: 400 })).toBeNull();
    expect(droppedOn(boxes, 'bread', { x: 400, y: 0 })).toBeNull();
  });

  it('swaps nothing when what was dragged is not among the cells drawn', () => {
    expect(droppedOn(boxes, 'apple', { x: 100, y: 0 })).toBeNull();
  });
});
