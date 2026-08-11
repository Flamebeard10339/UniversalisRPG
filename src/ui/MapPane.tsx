import { useEffect, useRef, useState } from 'react';
import type { PlayView } from '../runtime/session';
import { bounds, clampPan, sheetAt, waysOut, type Node } from './discovery';

// One authored unit of the world, in CSS pixels. The tutorial island's places
// sit a unit apart, so this is what turns "east of the guide house" into a gap a
// thumb can aim between.
const PER_UNIT = 104;
const MARGIN = 64;

// Where a place is drawn, in pixels, before the pan is applied.
const pixels = (node: Node): { left: number; top: number } => ({ left: node.at.x * PER_UNIT, top: node.at.y * PER_UNIT });

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
  const grab = useRef<{ x: number; y: number; from: { x: number; y: number }; moved: boolean; release: () => void } | null>(null);
  const [plane, setPlane] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [window_, setWindow] = useState({ width: 0, height: 0 });

  const discovered = view?.discovered ?? [];
  const here = view?.location.id ?? '';
  const standing = discovered.find((place) => place.id === here);
  const sheet = sheetAt(discovered, here, plane ?? standing?.z ?? 0);
  const at = plane ?? standing?.z ?? 0;
  const box = bounds(sheet.nodes);
  const span = { width: (box.maxX - box.minX) * PER_UNIT + MARGIN * 2, height: (box.maxY - box.minY) * PER_UNIT + MARGIN * 2 };
  const centre = { x: ((box.minX + box.maxX) / 2) * PER_UNIT, y: ((box.minY + box.maxY) / 2) * PER_UNIT };

  // A place with no way out to it is somewhere the player cannot set off for
  // now, and the map says so by not being tappable rather than by saying why.
  const travels = waysOut(view?.choices ?? []);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const read = (): void => setWindow({ width: node.clientWidth, height: node.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A pan that was legal on a crowded plane is not legal on an empty one, so it
  // is re-clamped against whatever is being drawn now rather than only as it is
  // dragged.
  const held = { x: clampPan(pan.x, span.width, window_.width), y: clampPan(pan.y, span.height, window_.height) };

  const begin = (x: number, y: number, release: () => void): void => {
    grab.current = { x, y, from: held, moved: false, release };
  };

  const moveTo = (x: number, y: number): void => {
    const grabbed = grab.current;
    if (!grabbed) return;
    const next = { x: grabbed.from.x + (x - grabbed.x), y: grabbed.from.y + (y - grabbed.y) };
    grabbed.moved = grabbed.moved || Math.abs(next.x - grabbed.from.x) > 6 || Math.abs(next.y - grabbed.from.y) > 6;
    setPan({ x: clampPan(next.x, span.width, window_.width), y: clampPan(next.y, span.height, window_.height) });
  };

  const end = (): void => {
    grab.current?.release();
    grab.current = null;
  };

  const dragged = (): boolean => grab.current?.moved ?? false;

  return (
    <div
      ref={frame}
      className="relative min-h-0 flex-1 touch-none overflow-hidden"
      // Kept from the pagers either side: a drag over the map is the map being
      // moved, not the page being turned or the layer being changed.
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const move = (native: MouseEvent): void => moveTo(native.clientX, native.clientY);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
        begin(event.clientX, event.clientY, () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', end);
        });
      }}
      onTouchStart={(event) => {
        const first = event.touches[0];
        if (!first || event.touches.length > 1) return;
        event.stopPropagation();
        const move = (native: TouchEvent): void => {
          const touch = native.touches[0];
          if (!touch) return;
          moveTo(touch.clientX, touch.clientY);
          if (native.cancelable) native.preventDefault();
        };
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', end);
        window.addEventListener('touchcancel', end);
        begin(first.clientX, first.clientY, () => {
          window.removeEventListener('touchmove', move);
          window.removeEventListener('touchend', end);
          window.removeEventListener('touchcancel', end);
        });
      }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{ transform: `translate3d(${held.x - centre.x}px, ${held.y - centre.y}px, 0)` }}
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
