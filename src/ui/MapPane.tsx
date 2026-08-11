import { useRef, useState } from 'react';
import type { PlayView } from '../runtime/session';
import { bounds, clampZoom, midpoint, panAfterZoom, PER_UNIT, settled, sheetAt, spanBetween, waysOut, zoomByWheel, type Node, type Point } from './discovery';

// Where a place is drawn, in unscaled pixels: the zoom is applied to the whole
// sheet at once, so nothing here has to know about it.
const pixels = (node: Node): { left: number; top: number } => ({ left: node.at.x * PER_UNIT, top: node.at.y * PER_UNIT });

// A drag moves the map; a pinch moves and scales it. Both are held from where
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

function Road({ from, to, open }: { from: Node; to: Node; open: boolean }): JSX.Element {
  const a = pixels(from);
  const b = pixels(to);
  return (
    <line
      x1={a.left}
      y1={a.top}
      x2={b.left}
      y2={b.top}
      className={open ? 'stroke-accent' : 'stroke-text-subtle'}
      strokeWidth={open ? 3 : 2}
      strokeDasharray={open ? undefined : '4 5'}
      strokeLinecap="round"
    />
  );
}

export function MapPane({
  view,
  arrivals,
  generation,
  onChoose,
}: {
  view: PlayView | null;
  arrivals: readonly string[];
  generation: number;
  onChoose: (position: number) => void;
}): JSX.Element {
  const frame = useRef<HTMLDivElement>(null);
  const gesture = useRef<Grab | Pinch | null>(null);
  const release = useRef<() => void>(() => undefined);
  const [plane, setPlane] = useState<number | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  const discovered = view?.discovered ?? [];
  const here = view?.location.id ?? '';
  const standing = discovered.find((place) => place.id === here);
  const at = plane ?? standing?.z ?? 0;
  const sheet = sheetAt(discovered, here, at);
  const box = bounds(sheet.nodes);
  const centre = { x: ((box.minX + box.maxX) / 2) * PER_UNIT, y: ((box.minY + box.maxY) / 2) * PER_UNIT };

  // A place with no way out to it is somewhere the player cannot set off for
  // now, and the map says so by not being tappable rather than by saying why.
  const travels = waysOut(view?.choices ?? []);

  // A pan that was legal at one zoom, or on a busier plane, is not legal now, so
  // it is re-held against what is being drawn rather than only as it is moved.
  const held = settled(pan, scale, box).pan;

  // From the middle of the window, which is what the pan is an offset from.
  const fromCentre = (x: number, y: number): Point => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) };
  };

  const settle = (next: Point, zoom: number): void => {
    const rest = settled(next, zoom, box);
    setScale(rest.scale);
    setPan(rest.pan);
  };

  // React's TouchList and the DOM's differ only in being iterable, and both
  // arrive here — one from the handler, one from the window listener.
  const touchPoints = (touches: { length: number; [index: number]: { clientX: number; clientY: number } }): Point[] =>
    Array.from({ length: Math.min(2, touches.length) }, (_, at) => fromCentre(touches[at].clientX, touches[at].clientY));

  const beginPinch = (points: Point[]): void => {
    gesture.current = { kind: 'pinch', span: spanBetween(points[0], points[1]), focal: midpoint(points[0], points[1]), pan: held, scale };
  };

  const movePinch = (points: Point[]): void => {
    const pinching = gesture.current;
    if (pinching?.kind !== 'pinch' || pinching.span === 0) return;
    const zoom = clampZoom((pinching.scale * spanBetween(points[0], points[1])) / pinching.span);
    const focal = midpoint(points[0], points[1]);
    // Zoomed about where the fingers were, then carried along with wherever
    // they have drifted to since.
    settle(
      {
        x: panAfterZoom(pinching.pan.x, pinching.focal.x, pinching.scale, zoom) + (focal.x - pinching.focal.x),
        y: panAfterZoom(pinching.pan.y, pinching.focal.y, pinching.scale, zoom) + (focal.y - pinching.focal.y),
      },
      zoom,
    );
  };

  const beginPan = (point: Point): void => {
    gesture.current = { kind: 'pan', from: point, pan: held, moved: false };
  };

  const movePan = (point: Point): void => {
    const grabbed = gesture.current;
    if (grabbed?.kind !== 'pan') return;
    const next = { x: grabbed.pan.x + (point.x - grabbed.from.x), y: grabbed.pan.y + (point.y - grabbed.from.y) };
    grabbed.moved = grabbed.moved || Math.abs(next.x - grabbed.pan.x) > 6 || Math.abs(next.y - grabbed.pan.y) > 6;
    settle(next, scale);
  };

  const end = (): void => {
    release.current();
    release.current = () => undefined;
    gesture.current = null;
  };

  const dragged = (): boolean => gesture.current?.kind === 'pan' && gesture.current.moved;

  return (
    <div
      ref={frame}
      className="relative min-h-0 flex-1 touch-none overflow-hidden"
      // Kept from the pagers either side: a gesture over the map is the map
      // being moved, not the page being turned or the layer being changed.
      onWheel={(event) => {
        const zoom = zoomByWheel(scale, event.deltaY);
        const focal = fromCentre(event.clientX, event.clientY);
        settle({ x: panAfterZoom(held.x, focal.x, scale, zoom), y: panAfterZoom(held.y, focal.y, scale, zoom) }, zoom);
      }}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
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
        if (event.touches.length === 0) return;
        event.stopPropagation();
        const move = (native: TouchEvent): void => {
          const moved = touchPoints(native.touches);
          if (moved.length >= 2) movePinch(moved);
          else if (moved.length === 1) movePan(moved[0]);
          if (native.cancelable) native.preventDefault();
        };
        // A second finger landing turns a drag into a pinch, and one lifting
        // turns it back, each starting again from wherever the map has got to.
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
        // a picture, so every label went soft the moment the map was zoomed in.
        style={{ transform: `translate(${held.x - centre.x * scale}px, ${held.y - centre.y * scale}px) scale(${scale})` }}
      >
        <svg className="pointer-events-none absolute overflow-visible" width={1} height={1}>
          {sheet.roads.map((road) => (
            <Road key={`${road.from.place.id}>${road.to.place.id}`} from={road.from} to={road.to} open={road.open} />
          ))}
        </svg>

        {sheet.nodes.map((node) => {
          const spot = pixels(node);
          const position = travels.get(node.place.id);
          const arrived = arrivals.includes(node.place.id);
          return (
            <button
              key={`${node.place.id}-${arrived ? generation : 0}`}
              type="button"
              data-place={node.place.id}
              disabled={position === undefined}
              onClick={() => {
                if (dragged() || position === undefined) return;
                onChoose(position);
              }}
              style={{ left: spot.left, top: spot.top }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-2 text-xs ${arrived ? 'arrived' : ''} ${
                node.here ? 'border-accent bg-accent-strong font-semibold text-accent-text' : 'border-border bg-panel'
              } ${node.climb !== 0 ? 'opacity-70' : ''} ${position === undefined ? 'text-text-subtle' : ''}`}
            >
              <span className="block max-w-[8rem] truncate">{node.place.title}</span>
            </button>
          );
        })}
      </div>

      {sheet.planes.length > 1 ? (
        // The floors, named by the number the author gave them. A word for up or
        // down would be this layer writing prose; the number is the content's.
        <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
          {[...sheet.planes].reverse().map((floor) => (
            <button
              key={floor}
              type="button"
              onClick={() => setPlane(floor)}
              className={`min-h-[44px] min-w-[44px] px-2 text-xs tabular-nums ${floor === at ? 'bg-accent-strong font-semibold text-accent-text' : 'text-text-subtle'}`}
            >
              {floor}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
