import { useEffect, useRef, useState } from 'react';
import type { PlayView } from '../runtime/session';
import type { Section } from './authoringSurface';
import { DragSheet, useSheetHold, type Grip } from './DragSheet';
import { drawnFor, onWalk, spotOf, walkLine, type Node } from './discovery';
import { DevOnly } from './DevOnly';
import type { MapWhere } from './editorMemory';
import { answering, droppedAt, placedInto } from './mapEdit';
import { useTestSurface } from './useTestSurface';
import { useMoment } from './transient';
import { tappedPlace } from './devMode';
import { bounds, panOnto, tapTarget, type Point } from './viewport';
import type { Words } from './words';

const DEBUGGING = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

const NOT_CARRIED: Point = { x: 0, y: 0 };

function Bubble({
  node,
  arrived,
  walking,
  scale,
  held,
  go,
  dragged,
  carried,
  grip,
}: {
  node: Node;
  arrived: boolean;
  walking: 'going' | 'crossing' | undefined;
  scale: number;
  held: (element: HTMLButtonElement | null) => void;
  go: (() => void) | null;
  dragged: () => boolean;
  carried: Point;
  grip: Grip | null;
}): JSX.Element {
  const spot = spotOf(node);
  const flash = useMoment('arrival', arrived, node.place.id);

  const look = {
    ref: held,
    'data-place': node.place.id,
    'data-walk': walking,
    style: { left: spot.x + carried.x, top: spot.y + carried.y },
    className: `absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-2 text-xs ${flash} ${
      node.here ? 'border-accent bg-accent-strong font-semibold text-accent-text' : 'border-border bg-panel'
    } ${walking === 'going' ? 'border-accent-strong font-semibold text-accent ring-2 ring-accent-strong' : ''} ${
      walking === 'crossing' ? 'border-accent text-accent' : ''
    } ${node.climb !== 0 ? 'opacity-70' : ''} ${go === null && !grip ? 'text-text-subtle' : ''}`,
  };

  const inside = (
    <>
      <span data-tap-target className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: tapTarget(scale), height: tapTarget(scale) }} />
      <span className="block max-w-[8rem] truncate">{node.place.title}</span>
    </>
  );

  if (grip) {
    return (
      <button data-drive="map.place" type="button" {...grip} {...look}>
        {inside}
      </button>
    );
  }

  return (
    <button
      data-drive="map.go"
      type="button"
      disabled={go === null}
      onClick={() => {
        if (dragged() || go === null) return;
        go();
      }}
      {...look}
    >
      {inside}
    </button>
  );
}

function Road({ from, to, open, walking }: { from: Node; to: Node; open: boolean; walking: boolean }): JSX.Element {
  const a = spotOf(from);
  const b = spotOf(to);
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
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
  words,
  dev,
  sections,
  where,
  onWhere,
  onSend,
  onNote,
}: {
  view: PlayView;
  arrivals: readonly string[];
  generation: number;
  words: Words;
  dev: boolean;
  sections: readonly Section[];
  where: MapWhere;
  onWhere: (where: MapWhere) => void;
  onSend: (line: string) => void;
  onNote: (text: string) => void;
}): JSX.Element {
  const bubbles = useRef<Array<HTMLElement | null>>([]);
  const [plane, setPlane] = useState<number | null>(where.plane);
  const [moving, setMoving] = useState(false);

  const { plane: at, here, sheet, travels } = drawnFor(view, plane);
  const spots = sheet.nodes.map(spotOf);
  const hold = useSheetHold(spots, bubbles, JSON.stringify(sheet.nodes.map((node) => node.place.title)), where, (id, by) => letGo(id, by));

  const walk = walkLine(here, view.journey);
  const going = walk[walk.length - 1];

  const recentre = (): void => {
    const floor = view.discovered.find((place) => place.id === here)?.z ?? null;
    const drawn = drawnFor(view, floor);
    const standing = drawn.sheet.nodes.find((each) => each.place.id === here);
    setPlane(floor);
    hold.settle(standing ? panOnto(spotOf(standing), bounds(drawn.sheet.nodes.map(spotOf)), 1) : { x: 0, y: 0 }, 1);
  };

  const lineFor = (id: string): string | null => tappedPlace(dev, id, travels.get(id) ?? null);

  const go = (id: string): void => {
    const line = lineFor(id);
    if (line !== null) onSend(line);
  };

  const answer = { send: onSend, note: onNote };

  const place = (id: string, at: Point): void => answering(placedInto(sections, id, at), answer);

  function letGo(id: string, carried: Point): void {
    const node = sheet.nodes.find((each) => each.place.id === id);
    if (node) answering(droppedAt(sections, node, carried), answer);
  }

  const map = { plane: at, zoom: hold.zoom, pan: hold.pan, sheet, travels, moving };

  useEffect(() => {
    onWhere({ pan: hold.pan, zoom: hold.zoom, plane });
  }, [hold.pan.x, hold.pan.y, hold.zoom, plane]);

  useTestSurface('map', { map, controls: { settle: hold.settle, plane: setPlane, recentre, moving: setMoving, place, go } });

  return (
    <DragSheet
      hold={hold}
      debug={
        DEBUGGING ? (
          <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap bg-accent px-1 text-[10px] tabular-nums text-accent-text">
            ×{map.zoom.toFixed(2)}
          </span>
        ) : undefined
      }
      overlay={
        <>
          <button
            data-drive="map.recentre"
            type="button"
            onClick={recentre}
            className="absolute left-3 top-3 rounded-xl border border-border bg-surface px-3 text-xs text-text-subtle transition-transform duration-75 active:scale-[0.97] active:text-accent"
          >
            {words('recentre')}
          </button>
          <DevOnly dev={dev}>
          <button
            data-drive="map.moving"
            type="button"
            data-moving={moving ? 'yes' : undefined}
            onClick={() => setMoving(!moving)}
            className={`absolute bottom-3 left-3 rounded-xl border px-3 text-xs transition-transform duration-75 active:scale-[0.97] ${
              moving ? 'border-accent bg-accent-strong font-semibold text-accent-text' : 'border-border bg-surface text-text-subtle'
            }`}
          >
            {words('place')}
          </button>
          </DevOnly>
          {map.sheet.planes.length > 1 ? (
            <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
              {[...map.sheet.planes].reverse().map((floor) => (
                <button
                  key={floor}
                  data-drive="map.plane"
                  type="button"
                  onClick={() => setPlane(floor)}
                  data-floor={floor}
                  data-drawn={floor === map.plane ? 'yes' : undefined}
                  className={`px-2 text-xs tabular-nums ${floor === map.plane ? 'bg-accent-strong font-semibold text-accent-text' : 'text-text-subtle'}`}
                >
                  {floor}
                </button>
              ))}
            </div>
          ) : null}
        </>
      }
    >
      <svg className="pointer-events-none absolute overflow-visible" width={1} height={1}>
        {map.sheet.roads.map((road) => (
          <Road key={`${road.from.place.id}>${road.to.place.id}`} from={road.from} to={road.to} open={road.open} walking={onWalk(walk, road.from.place.id, road.to.place.id)} />
        ))}
      </svg>

      {map.sheet.nodes.map((node, at) => (
        <Bubble
          key={`${node.place.id}-${arrivals.includes(node.place.id) ? generation : 0}`}
          node={node}
          arrived={arrivals.includes(node.place.id)}
          walking={node.place.id === going ? 'going' : walk.includes(node.place.id) && !node.here ? 'crossing' : undefined}
          go={lineFor(node.place.id) === null ? null : () => go(node.place.id)}
          scale={map.zoom}
          held={(element) => void (bubbles.current[at] = element)}
          dragged={hold.dragged}
          carried={hold.carried?.id === node.place.id ? hold.carried.by : NOT_CARRIED}
          grip={moving ? hold.grip(node.place.id) : null}
        />
      ))}
    </DragSheet>
  );
}
