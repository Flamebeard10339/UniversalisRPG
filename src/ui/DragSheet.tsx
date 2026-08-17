import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { bounds, centreOf, clampZoom, drawnBox, midpoint, panAfterZoom, settled, spanBetween, zoomByWheel, type Box, type Point, type Size } from './viewport';

// A sheet bigger than the window, held under a finger: dragged, pinched,
// wheeled, and clamped to its own room. It is handed where the things on it
// stand and draws whatever the caller puts on it, so the map and an item's
// plane are two callers rather than two implementations of this.

// A drag moves the sheet; a pinch moves and scales it. Both are held from where
// they started rather than accumulated frame by frame, so a gesture that
// wanders and comes back lands where it set off.
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

// A thing drawn on the sheet, picked up and carried across it. The sheet owns
// this rather than whoever drew the thing, for the two reasons the pan is
// owned here: the arithmetic is the sheet's — a gesture is measured on the
// screen and the sheet is drawn scaled — and a drag on a thing and a drag on
// the ground under it are the same gesture, so only one of them can be it.
export interface Carried {
  id: string;
  // How far it has come since it was picked up, in the sheet's own pixels.
  by: Point;
}

// What a rider puts on a thing it wants carried. The sheet reports where it was
// let go of once, on release: nothing is moved by this, only drawn moved.
export interface Grip {
  onPointerDown(event: React.PointerEvent<HTMLElement>): void;
  onPointerMove(event: React.PointerEvent<HTMLElement>): void;
  onPointerUp(event: React.PointerEvent<HTMLElement>): void;
}

// Where the sheet has got to, and everything that moves it. Built by the hook
// and handed to the component, so the caller holding it can settle the sheet
// from a control of its own without reaching into the gesture.
export interface SheetHold {
  pan: Point;
  zoom: number;
  box: Box;
  // The room one thing on the sheet is drawn in, measured rather than assumed:
  // it is what the pan is clamped by, so a caller that has not laid out yet is
  // clamped to the points alone until it has.
  node: Size;
  settle(pan: Point, zoom: number): void;
  // True while the gesture under way has travelled far enough to be a drag,
  // which is what a control on the sheet asks before it counts as a tap.
  dragged(): boolean;
  gesture: { current: Grab | Pinch | null };
  // Whether the gesture that has just ended travelled. Held past the end of it
  // because a click arrives after the release that clears the gesture, and a
  // control asking mid-click whether it was dragged would always be told no.
  travelled: { current: boolean };
  // What is being carried across the sheet, and null when nothing is.
  carried: Carried | null;
  // Whether something is under the finger right now. A ref rather than the
  // state above, because the sheet's own press handler runs in the same
  // gesture and a state set is not there yet when it does.
  gripped: { current: { id: string } | null };
  // The handlers that pick one thing up, and null where the caller is not
  // offering to carry anything — which is what makes a press a tap.
  grip(id: string): Grip;
}

const AT_REST: Point = { x: 0, y: 0 };

// How far a finger travels before what it is doing is a drag and not a tap.
const DRAG_SLOP_PX = 6;

// Where the sheet opens, for a caller that remembers where it was left. A
// caller that does not passes none and opens at rest.
export interface Opening {
  pan: Point;
  zoom: number;
}

export function useSheetHold(
  points: readonly Point[],
  measured: { current: Array<HTMLElement | null> },
  keyed: string,
  opening?: Opening,
  // Where a thing was let go of, in the sheet's own pixels from where it was
  // drawn. Reported once, on release: what the caller does about it is the
  // caller's, and until then the thing is only drawn somewhere else.
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

  // How big a thing on the sheet is drawn is a rendered fact — a title
  // truncated at eight characters' worth is narrower than one that fills the
  // cap — so it is measured rather than restated. offsetWidth is the laid-out
  // width and ignores the transform above it, which is the unscaled figure the
  // box wants. Keyed on what the caller says can change the answer, because a
  // live run publishes ten frames a second and every one of them would
  // otherwise force a synchronous layout over everything drawn.
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
    // A pan that was legal at one zoom, or on a busier sheet, is not legal now,
    // so it is re-held against what is being drawn rather than only as it moves.
    pan: settled(pan, zoom, box, node).pan,
    zoom,
    box,
    node,
    // Stored as asked and held on the way out, not on the way in: what a pan is
    // allowed to be depends on the box being drawn, and a caller recentring on
    // a sheet it is changing in the same breath would otherwise be clamped
    // against the sheet it is leaving.
    settle: (next, scale) => {
      setZoom(scale);
      setPan(next);
    },
    dragged: () => travelled.current,
    gesture,
    travelled,
    carried,
    grip: (id) => {
      const by = (event: { clientX: number; clientY: number }): Point => {
        const from = grip.current?.from ?? AT_REST;
        return { x: (event.clientX - from.x) / zoom, y: (event.clientY - from.y) / zoom };
      };
      return {
        onPointerDown: (event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          grip.current = { id, from: { x: event.clientX, y: event.clientY } };
          setCarried({ id, by: AT_REST });
        },
        onPointerMove: (event) => {
          if (grip.current?.id !== id) return;
          setCarried({ id, by: by(event) });
        },
        onPointerUp: (event) => {
          if (grip.current?.id !== id) return;
          const rested = by(event);
          grip.current = null;
          setCarried(null);
          onCarried?.(id, rested);
        },
      };
    },
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
  // What pressing the sheet itself does, where the caller has something for it
  // to do. Only the sheet's own ground: a press that landed on anything drawn
  // on it is that thing's.
  onGround?: () => void;
  // What the sheet draws over itself and does not move: a control fixed to a
  // corner of the window rather than to the sheet.
  overlay?: ReactNode;
  debug?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const frame = useRef<HTMLDivElement>(null);
  const release = useRef<() => void>(() => undefined);
  const gesture = hold.gesture;
  const centre = centreOf(hold.box);
  const carrying = (): boolean => hold.gripped.current !== null;

  // From the middle of the window, which is what the pan is an offset from.
  const fromCentre = (x: number, y: number): Point => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return AT_REST;
    return { x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) };
  };

  // React's TouchList and the DOM's differ only in being iterable, and both
  // arrive here — one from the handler, one from the window listener.
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
    // Zoomed about where the fingers were, then carried along with wherever
    // they have drifted to since.
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
      // Kept from whatever is either side: a gesture over the sheet is the
      // sheet being moved, not the page being turned or the layer changed.
      onWheel={(event) => {
        const zoom = zoomByWheel(hold.zoom, event.deltaY);
        const focal = fromCentre(event.clientX, event.clientY);
        hold.settle({ x: panAfterZoom(hold.pan.x, focal.x, hold.zoom, zoom), y: panAfterZoom(hold.pan.y, focal.y, hold.zoom, zoom) }, zoom);
      }}
      onMouseDown={(event) => {
        // A pointerdown on a thing being carried has already happened by now,
        // and the sheet must not also start panning under it.
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
        // A second finger landing turns a drag into a pinch, and one lifting
        // turns it back, each starting again from wherever the sheet has got to.
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
        // A 2D translate, not a translate3d: the 3D one puts the sheet on its
        // own compositor layer, and a layer is rastered once and then scaled as
        // a picture, so every label went soft the moment it was zoomed in.
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
