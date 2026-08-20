import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { bounds, centreOf, clampZoom, drawnBox, midpoint, panAfterZoom, settled, spanBetween, zoomByWheel, type Box, type Point, type Size } from './viewport';

interface Grab {
  kind: 'pan';
  from: Point;
  pan: Point;
  moved: boolean;
}

interface Pinch {
  kind: 'pinch';
  span: number;
  focal: Point;
  pan: Point;
  scale: number;
}

const AT_REST: Point = { x: 0, y: 0 };

const DRAG_SLOP_PX = 6;

export interface Carried {
  id: string;
  by: Point;
}

export interface Grip {
  onPointerDown(event: React.PointerEvent<HTMLElement>): void;
  onPointerMove(event: React.PointerEvent<HTMLElement>): void;
  onPointerUp(event: React.PointerEvent<HTMLElement>): void;
  onPointerCancel(event: React.PointerEvent<HTMLElement>): void;
}

export const carriedFar = (by: Point, zoom: number): boolean => Math.abs(by.x * zoom) > DRAG_SLOP_PX || Math.abs(by.y * zoom) > DRAG_SLOP_PX;

export interface Carrier {
  hold(next: Carried | null): void;
  rest(report: Carried | null): void;
}

const cameBy = (from: Point, at: Point, zoom: number): Point => ({ x: (at.x - from.x) / zoom, y: (at.y - from.y) / zoom });

export function gripFor(id: string, held: { current: { id: string; from: Point } | null }, zoom: number, carrier: Carrier): Grip {
  const at = (event: { clientX: number; clientY: number }): Point => ({ x: event.clientX, y: event.clientY });
  const mine = (): boolean => held.current?.id === id;

  return {
    onPointerDown: (event) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      held.current = { id, from: at(event) };
      carrier.hold({ id, by: AT_REST });
    },
    onPointerMove: (event) => {
      if (!mine()) return;
      carrier.hold({ id, by: cameBy(held.current!.from, at(event), zoom) });
    },
    onPointerUp: (event) => {
      if (!mine()) return;
      const by = cameBy(held.current!.from, at(event), zoom);
      held.current = null;
      carrier.rest(carriedFar(by, zoom) ? { id, by } : null);
    },
    onPointerCancel: () => {
      if (!mine()) return;
      held.current = null;
      carrier.rest(null);
    },
  };
}

export interface SheetHold {
  pan: Point;
  zoom: number;
  box: Box;
  node: Size;
  settle(pan: Point, zoom: number): void;
  dragged(): boolean;
  gesture: { current: Grab | Pinch | null };
  travelled: { current: boolean };
  carried: Carried | null;
  gripped: { current: { id: string } | null };
  grip(id: string): Grip;
}

export interface Opening {
  pan: Point;
  zoom: number;
}

export function useSheetHold(
  points: readonly Point[],
  measured: { current: Array<HTMLElement | null> },
  keyed: string,
  opening?: Opening,
  onCarried?: (id: string, by: Point) => void,
): SheetHold {
  const gesture = useRef<Grab | Pinch | null>(null);
  const travelled = useRef(false);
  const grip = useRef<{ id: string; from: Point } | null>(null);
  const [carried, setCarried] = useState<Carried | null>(null);
  const [pan, setPan] = useState<Point>(opening?.pan ?? AT_REST);
  const [zoom, setZoom] = useState(opening?.zoom ?? 1);
  const [node, setNode] = useState<Size>({ width: 0, height: 0 });
  const box = bounds(points);

  useLayoutEffect(() => {
    const drawn = measured.current.slice(0, points.length);
    setNode((were) => {
      const now = {
        width: Math.max(0, ...drawn.map((each) => each?.offsetWidth ?? 0)),
        height: Math.max(0, ...drawn.map((each) => each?.offsetHeight ?? 0)),
      };
      return now.width === were.width && now.height === were.height ? were : now;
    });
  }, [keyed]);

  return {
    pan: settled(pan, zoom, box, node).pan,
    zoom,
    box,
    node,
    settle: (next, scale) => {
      setZoom(scale);
      setPan(next);
    },
    dragged: () => travelled.current,
    gesture,
    travelled,
    carried,
    grip: (id) =>
      gripFor(id, grip, zoom, {
        hold: setCarried,
        rest: (report) => {
          setCarried(null);
          if (report) onCarried?.(report.id, report.by);
        },
      }),
    gripped: grip,
  };
}

export function DragSheet({
  hold,
  debug,
  children,
  overlay,
  onGround,
}: {
  hold: SheetHold;
  onGround?: () => void;
  overlay?: ReactNode;
  debug?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const frame = useRef<HTMLDivElement>(null);
  const release = useRef<() => void>(() => undefined);
  const gesture = hold.gesture;
  const centre = centreOf(hold.box);
  const carrying = (): boolean => hold.gripped.current !== null;

  const fromCentre = (x: number, y: number): Point => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return AT_REST;
    return { x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) };
  };

  const touchPoints = (touches: { length: number; [index: number]: { clientX: number; clientY: number } }): Point[] =>
    Array.from({ length: Math.min(2, touches.length) }, (_, at) => fromCentre(touches[at].clientX, touches[at].clientY));

  const beginPinch = (points: Point[]): void => {
    gesture.current = { kind: 'pinch', span: spanBetween(points[0], points[1]), focal: midpoint(points[0], points[1]), pan: hold.pan, scale: hold.zoom };
  };

  const movePinch = (points: Point[]): void => {
    const pinching = gesture.current;
    if (pinching?.kind !== 'pinch' || pinching.span === 0) return;
    const zoom = clampZoom((pinching.scale * spanBetween(points[0], points[1])) / pinching.span);
    const focal = midpoint(points[0], points[1]);
    hold.settle(
      {
        x: panAfterZoom(pinching.pan.x, pinching.focal.x, pinching.scale, zoom) + (focal.x - pinching.focal.x),
        y: panAfterZoom(pinching.pan.y, pinching.focal.y, pinching.scale, zoom) + (focal.y - pinching.focal.y),
      },
      zoom,
    );
  };

  const beginPan = (point: Point): void => {
    hold.travelled.current = false;
    gesture.current = { kind: 'pan', from: point, pan: hold.pan, moved: false };
  };

  const movePan = (point: Point): void => {
    const grabbed = gesture.current;
    if (grabbed?.kind !== 'pan') return;
    const next = { x: grabbed.pan.x + (point.x - grabbed.from.x), y: grabbed.pan.y + (point.y - grabbed.from.y) };
    grabbed.moved = grabbed.moved || Math.abs(next.x - grabbed.pan.x) > DRAG_SLOP_PX || Math.abs(next.y - grabbed.pan.y) > DRAG_SLOP_PX;
    hold.travelled.current = hold.travelled.current || grabbed.moved;
    hold.settle(next, hold.zoom);
  };

  const end = (): void => {
    release.current();
    release.current = () => undefined;
    gesture.current = null;
  };

  return (
    <div
      ref={frame}
      className="relative min-h-0 flex-1 touch-none overflow-hidden"
      onClick={onGround ? (event) => void (event.target === event.currentTarget && !hold.dragged() && onGround()) : undefined}
      onWheel={(event) => {
        const zoom = zoomByWheel(hold.zoom, event.deltaY);
        const focal = fromCentre(event.clientX, event.clientY);
        hold.settle({ x: panAfterZoom(hold.pan.x, focal.x, hold.zoom, zoom), y: panAfterZoom(hold.pan.y, focal.y, hold.zoom, zoom) }, zoom);
      }}
      onMouseDown={(event) => {
        if (event.button !== 0 || carrying()) return;
        event.stopPropagation();
        const move = (native: MouseEvent): void => movePan(fromCentre(native.clientX, native.clientY));
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
        release.current = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', end);
        };
        beginPan(fromCentre(event.clientX, event.clientY));
      }}
      onTouchStart={(event) => {
        if (event.touches.length === 0 || carrying()) return;
        event.stopPropagation();
        const move = (native: TouchEvent): void => {
          const moved = touchPoints(native.touches);
          if (moved.length >= 2) movePinch(moved);
          else if (moved.length === 1) movePan(moved[0]);
          if (native.cancelable) native.preventDefault();
        };
        const restart = (native: TouchEvent): void => {
          if (native.touches.length === 0) return end();
          const now = touchPoints(native.touches);
          if (now.length >= 2) beginPinch(now);
          else beginPan(now[0]);
        };
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchstart', restart);
        window.addEventListener('touchend', restart);
        window.addEventListener('touchcancel', end);
        release.current = () => {
          window.removeEventListener('touchmove', move);
          window.removeEventListener('touchstart', restart);
          window.removeEventListener('touchend', restart);
          window.removeEventListener('touchcancel', end);
        };
        const points = touchPoints(event.touches);
        if (points.length >= 2) beginPinch(points);
        else beginPan(points[0]);
      }}
    >
      <div
        className="absolute left-1/2 top-1/2 origin-top-left"
        // translate, never translate3d: a promoted layer is rastered once and every label goes soft when the sheet is zoomed.
        style={{ transform: `translate(${hold.pan.x - centre.x * hold.zoom}px, ${hold.pan.y - centre.y * hold.zoom}px) scale(${hold.zoom})` }}
      >
        {debug === undefined ? null : (
          <div data-debug="drawn-box" className="pointer-events-none absolute border-2 border-dashed border-accent/60" style={drawnBox(hold.box, hold.node)}>
            {debug}
          </div>
        )}
        {children}
      </div>
      {overlay}
    </div>
  );
}
