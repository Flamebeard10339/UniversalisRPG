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
export function droppedOn(boxes: readonly CellBox[], dragged: string, by: Point): string | null {
  const from = boxes.find((box) => box.key === dragged);
  if (!from) return null;
  const middle = centreOf(from);
  const landed = { x: middle.x + by.x, y: middle.y + by.y };
  const onto = boxes.find((box) => holds(box, landed));
  return onto === undefined || onto.key === dragged ? null : onto.key;
}
