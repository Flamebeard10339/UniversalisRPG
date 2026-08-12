import { useLayoutEffect, useRef, useState } from 'react';
import type { PlayView } from '../runtime/session';
import { bounds, clampZoom, drawnBox, midpoint, onWalk, panAfterZoom, PER_UNIT, settled, sheetAt, spanBetween, tapTarget, walkLine, waysOut, zoomByWheel, type Node, type Point, type Size } from './discovery';
import { useTestSurface } from './testSurface';

// The map draws its own working out — the box a pan is held against — for
// whoever is building the map. Read once, off the address, because a debug
// surface that can be reached from inside the game is a debug surface that has
// to be designed.
const DEBUGGING = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

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

function Road({ from, to, open, walking }: { from: Node; to: Node; open: boolean; walking: boolean }): JSX.Element {
  const a = pixels(from);
  const b = pixels(to);
  return (
    <line
      x1={a.left}
      y1={a.top}
      x2={b.left}
      y2={b.top}
      data-walk={walking ? 'road' : undefined}
      className={walking ? 'stroke-accent-strong' : open ? 'stroke-accent' : 'stroke-text-subtle'}
      strokeWidth={walking ? 7 : open ? 3 : 2}
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
  const bubbles = useRef<Array<HTMLElement | null>>([]);
  const gesture = useRef<Grab | Pinch | null>(null);
  const release = useRef<() => void>(() => undefined);
  const [plane, setPlane] = useState<number | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [bubble, setBubble] = useState<Size>({ width: 0, height: 0 });

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

  // The walk under way, as the engine published it, with the place the player
  // is standing in at the head so a road on it is a pair of neighbours.
  const walk = walkLine(here, view?.journey ?? null);
  const going = walk[walk.length - 1];

  // How big a place is drawn is a rendered fact — a title truncated at eight
  // characters' worth is narrower than one that fills the cap — so it is
  // measured rather than restated here. offsetWidth is the laid-out width and
  // ignores the transform above it, which is the unscaled figure the box wants.
  // Keyed on the titles drawn, because that is the whole of what can change the
  // answer: a live run publishes ten frames a second and every one of them
  // would otherwise force a synchronous layout over every bubble on the map.
  const titles = JSON.stringify(sheet.nodes.map((node) => node.place.title));
  useLayoutEffect(() => {
    const drawn = bubbles.current.slice(0, sheet.nodes.length);
    setBubble((were) => {
      const now = {
        width: Math.max(0, ...drawn.map((node) => node?.offsetWidth ?? 0)),
        height: Math.max(0, ...drawn.map((node) => node?.offsetHeight ?? 0)),
      };
      return now.width === were.width && now.height === were.height ? were : now;
    });
  }, [titles]);

  const drawn = drawnBox(box, bubble);

  // A pan that was legal at one zoom, or on a busier plane, is not legal now, so
  // it is re-held against what is being drawn rather than only as it is moved.
  const held = settled(pan, scale, box, bubble).pan;

  // From the middle of the window, which is what the pan is an offset from.
  const fromCentre = (x: number, y: number): Point => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) };
  };

  const settle = (next: Point, zoom: number): void => {
    const rest = settled(next, zoom, box, bubble);
    setScale(rest.scale);
    setPan(rest.pan);
  };

  useTestSurface('map', { map: { plane: at, zoom: scale, pan: held, sheet, travels }, controls: { settle, plane: setPlane } });

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
            <Road key={`${road.from.place.id}>${road.to.place.id}`} from={road.from} to={road.to} open={road.open} walking={onWalk(walk, road.from.place.id, road.to.place.id)} />
          ))}
        </svg>

        {DEBUGGING ? (
          <div data-debug="drawn-box" className="pointer-events-none absolute border-2 border-dashed border-accent/60" style={drawn}>
            <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap bg-accent px-1 text-[10px] tabular-nums text-accent-text">
              {Math.round(drawn.width)}×{Math.round(drawn.height)} · bubble {bubble.width}×{bubble.height} · ×{scale.toFixed(2)}
            </span>
          </div>
        ) : null}

        {sheet.nodes.map((node, at) => {
          const spot = pixels(node);
          const position = travels.get(node.place.id);
          const arrived = arrivals.includes(node.place.id);
          // Where the walk ends, somewhere it still has to cross, or neither.
          const walking = node.place.id === going ? 'going' : walk.includes(node.place.id) && !node.here ? 'crossing' : undefined;
          return (
            <button
              key={`${node.place.id}-${arrived ? generation : 0}`}
              ref={(element) => void (bubbles.current[at] = element)}
              type="button"
              data-place={node.place.id}
              data-walk={walking}
              disabled={position === undefined}
              onClick={() => {
                if (dragged() || position === undefined) return;
                onChoose(position);
              }}
              style={{ left: spot.left, top: spot.top }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-2 text-xs ${arrived ? 'arrived' : ''} ${
                node.here ? 'border-accent bg-accent-strong font-semibold text-accent-text' : 'border-border bg-panel'
              } ${walking === 'going' ? 'border-accent-strong font-semibold text-accent ring-2 ring-accent-strong' : ''} ${
                walking === 'crossing' ? 'border-accent text-accent' : ''
              } ${node.climb !== 0 ? 'opacity-70' : ''} ${position === undefined ? 'text-text-subtle' : ''}`}
            >
              {/* Inside the control, so what it covers is what the control
                  answers, and sized against the zoom the sheet is drawn at. */}
              <span data-tap-target className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: tapTarget(scale), height: tapTarget(scale) }} />
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
              className={`px-2 text-xs tabular-nums ${floor === at ? 'bg-accent-strong font-semibold text-accent-text' : 'text-text-subtle'}`}
            >
              {floor}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
