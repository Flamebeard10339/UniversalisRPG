import type { Point } from './viewport';

export interface CellBox {
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const holds = (box: CellBox, at: Point): boolean => at.x >= box.left && at.x < box.right && at.y >= box.top && at.y < box.bottom;

const centreOf = (box: CellBox): Point => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

function droppedOn(boxes: readonly CellBox[], dragged: string, by: Point): string | null {
  const from = boxes.find((box) => box.key === dragged);
  if (!from) return null;
  const middle = centreOf(from);
  const landed = { x: middle.x + by.x, y: middle.y + by.y };
  const onto = boxes.find((box) => holds(box, landed));
  return onto === undefined || onto.key === dragged ? null : onto.key;
}

export type LetGo = { kind: 'swap'; one: string; other: string } | { kind: 'open'; one: string };

export function letGoOf(boxes: readonly CellBox[], dragged: string, by: Point | null): LetGo {
  const onto = by === null ? null : droppedOn(boxes, dragged, by);
  return onto === null ? { kind: 'open', one: dragged } : { kind: 'swap', one: dragged, other: onto };
}
