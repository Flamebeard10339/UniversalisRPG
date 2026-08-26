import type { Point } from './viewport';

// Where one cell of the grid is drawn, in the page's own pixels. A box is measured, never worked
// out from a column count and a gap: the grid fills as many columns as the width affords, so the
// only thing that knows the shape it settled on is the browser that laid it out.
export interface CellBox {
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const holds = (box: CellBox, at: Point): boolean => at.x >= box.left && at.x < box.right && at.y >= box.top && at.y < box.bottom;

const centreOf = (box: CellBox): Point => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

// Which cell a cell was dropped on. The finger is not reported to us — a grip says only how far
// what it was holding has come — so where the drag ended is where the dragged cell's own middle has
// come to, which is the same point whatever the cell was picked up by. A drop on nothing, or back on
// the cell it started from, has swapped nothing and says so.
function droppedOn(boxes: readonly CellBox[], dragged: string, by: Point): string | null {
  const from = boxes.find((box) => box.key === dragged);
  if (!from) return null;
  const middle = centreOf(from);
  const landed = { x: middle.x + by.x, y: middle.y + by.y };
  const onto = boxes.find((box) => holds(box, landed));
  return onto === undefined || onto.key === dragged ? null : onto.key;
}

export type LetGo = { kind: 'swap'; one: string; other: string } | { kind: 'open'; one: string };

// What letting go of a cell asks for. A cell put down on another is a swap; everything else is the
// tap it turns out to have been. A press the grip called still — under the slop it takes to start a
// drag — is one of those, and so is a press that drifted past the slop and came down on nothing,
// which is what a finger on a phone does. Carrying a cell off the grid and dropping it there asks
// for the thing to be opened rather than for nothing at all, because a tap that did nothing is a
// broken screen and a swap that did not happen is one more try.
export function letGoOf(boxes: readonly CellBox[], dragged: string, by: Point | null): LetGo {
  const onto = by === null ? null : droppedOn(boxes, dragged, by);
  return onto === null ? { kind: 'open', one: dragged } : { kind: 'swap', one: dragged, other: onto };
}
