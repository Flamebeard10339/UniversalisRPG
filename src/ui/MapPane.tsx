import { useEffect, useRef, useState } from 'react';
import type { PlayView } from '../runtime/session';
import { names, type Section } from './authoringSurface';
import { DragSheet, useSheetHold, type Grip } from './DragSheet';
import { drawnFor, folded, onWalk, spotOf, walkingAt, walkLine, type Node, type Walked, type Walking } from './discovery';
import { DevOnly } from './DevOnly';
import type { MapWhere } from './editorMemory';
import { answering, carriedWith, centredOn, created, draggedTo, joinedInto, placedInto, stagedKey, type MapMode } from './mapEdit';
import { useTestSurface } from './useTestSurface';
import { MARCHING, MARCHING_BACK, useMoment } from './transient';
import { gotoLine, tappedPlace } from './devMode';
import { folding, leaving, panOnto, tapTarget, type Point, type Size } from './viewport';
import type { Sheet } from '../runtime/map';
import type { Words } from './words';

const DEBUGGING = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

const NOT_CARRIED: Point = { x: 0, y: 0 };

// Each of the four things a place can be while a journey is on, said in a colour of its own. Written
// as a record over the states themselves, so a state added to the walk has to be drawn before this
// compiles. Where the player stands is the one that is filled; the rest are edges and lettering,
// because a filled bubble reads as somewhere you already are.
const WALKING_CLASS: Record<Walking, string> = {
  here: 'border-accent bg-accent-strong font-semibold text-accent-text',
  next: 'border-accent-strong font-semibold text-accent ring-2 ring-accent-strong',
  ahead: 'border-accent text-accent',
  target: 'border-warning font-semibold text-warning ring-2 ring-warning',
};

function Bubble({
  node,
  arrived,
  walking,
  grid,
  scale,
  held,
  go,
  dragged,
  carried,
  grip,
  chosen,
}: {
  node: Node;
  arrived: boolean;
  walking: Walking | undefined;
  grid: number;
  scale: number;
  held: (element: HTMLButtonElement | null) => void;
  go: (() => void) | null;
  dragged: () => boolean;
  carried: Point;
  grip: Grip | null;
  chosen: boolean;
}): JSX.Element {
  const spot = spotOf(node, grid);
  const flash = useMoment('arrival', arrived, node.place.id);

  const look = {
    ref: held,
    'data-place': node.place.id,
    'data-walk': walking,
    style: { left: spot.x + carried.x, top: spot.y + carried.y },
    className: `absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-2 text-xs ${flash} ${
      walking === undefined ? 'border-border bg-panel' : WALKING_CLASS[walking]
    } ${node.climb !== 0 ? 'opacity-70' : ''} ${go === null && !grip ? 'text-text-subtle' : ''} ${chosen ? 'ring-2 ring-danger' : ''}`,
  };

  const inside = (
    <>
      <span data-tap-target className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: tapTarget(scale), height: tapTarget(scale) }} />
      <span className="block max-w-[8rem] truncate">{node.place.title}</span>
    </>
  );

  // `data-still` is what tells the sheet under it that a press here is not a press on the sheet. The
  // grip stops the pointer event it holds, but the sheet listens for a mouse and a touch, which are
  // events of their own — so without this a finger on a place both carries the place and drags the map.
  if (grip) {
    return (
      <button data-drive="map.place" data-still type="button" {...grip} {...look}>
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

// Whether a road is walked both ways is what the line is: solid for a road walked both, dashed and pointed for one walked only towards where it points. Whether it is open is the weight and the colour, so the two facts do not share a channel.
function Road({ from, to, open, mutual, walking, grid, bubble }: { from: Node; to: Node; open: boolean; mutual: boolean; walking: Walked | null; grid: number; bubble: Size }): JSX.Element {
  const ends = [spotOf(from, grid), spotOf(to, grid)];
  const a = leaving(ends[0], ends[1], bubble);
  const b = leaving(ends[1], ends[0], bubble);
  const now = walking?.stretch === 'now';
  const look = {
    className: walking ? 'stroke-accent-strong' : open ? 'stroke-accent' : 'stroke-text-subtle',
    strokeWidth: walking ? 7 : open ? 3 : 2,
  };
  return (
    <g data-road={mutual ? 'both ways' : 'one way'}>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        data-walk={walking?.stretch}
        {...look}
        className={`${look.className} ${now ? (walking!.along ? MARCHING : MARCHING_BACK) : ''}`}
        strokeDasharray={mutual || now ? undefined : '5 4'}
        strokeLinecap="round"
      />
      {mutual ? null : <polyline points={arrowAt(a, b)} {...look} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  );
}

// The shape drawn round a region: its own ring, with the corners taken off. How round a corner is is
// how far the curve reaches back along each side, so a shape stays the shape the engine gave it and
// only stops having points on it.
const CORNER = 0.28;

export function roundedRing(points: readonly Point[], reach = CORNER): string {
  if (points.length < 3) return '';
  const along = (from: Point, to: Point, part: number): Point => ({ x: from.x + (to.x - from.x) * part, y: from.y + (to.y - from.y) * part });
  const steps = points.map((point, at) => {
    const before = points[(at + points.length - 1) % points.length]!;
    const after = points[(at + 1) % points.length]!;
    return { in: along(point, before, reach), out: along(point, after, reach), corner: point };
  });
  const [first, ...rest] = steps;
  const path = [`M ${first!.out.x} ${first!.out.y}`];
  for (const step of [...rest, first!]) path.push(`L ${step!.in.x} ${step!.in.y}`, `Q ${step!.corner.x} ${step!.corner.y} ${step!.out.x} ${step!.out.y}`);
  return `${path.join(' ')} Z`;
}

function RegionShape({ region, grid, carried }: { region: Sheet['regions'][number]; grid: number; carried: Point }): JSX.Element | null {
  const path = roundedRing(region.hull.map((point) => ({ x: point.x * grid + carried.x, y: point.y * grid + carried.y })));
  if (path === '') return null;
  return <path data-region={region.id} d={path} className="fill-accent/5 stroke-accent/40" strokeWidth={2} strokeDasharray="7 5" />;
}

const HEAD = 10;
const BARB = 7;

// The point of a one-way road, set at the middle of it. A place is a label of whatever width its title needs, so an arrow drawn where the road arrives would be under one.
export function arrowAt(a: Point, b: Point): string {
  const run = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const along = { x: (b.x - a.x) / run, y: (b.y - a.y) / run };
  const tip = { x: (a.x + b.x) / 2 + (along.x * HEAD) / 2, y: (a.y + b.y) / 2 + (along.y * HEAD) / 2 };
  const back = { x: tip.x - along.x * HEAD, y: tip.y - along.y * HEAD };
  const side = { x: -along.y * BARB, y: along.x * BARB };
  return [`${back.x + side.x},${back.y + side.y}`, `${tip.x},${tip.y}`, `${back.x - side.x},${back.y - side.y}`].join(' ');
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
  const [mode, setMode] = useState<MapMode>('go');
  const [from, setFrom] = useState<string | null>(null);
  const [naming, setNaming] = useState('');

  const { plane: at, here, sheet: whole } = drawnFor(view, plane);
  const grid = view.mapGrid;
  const spots = whole.nodes.map((node) => spotOf(node, grid));
  const hold = useSheetHold(spots, bubbles, JSON.stringify(whole.nodes.map((node) => node.place.title)), where, (id, by) => letGo(id, by));
  // Folded up while the map is too far out to read a label on, which is the one thing about the map
  // that is a question about the screen rather than about the world. The room the sheet takes up is
  // the unfolded one either way, so folding moves nothing under the finger holding it.
  const sheet = folding(hold.zoom) ? folded(whole) : whole;
  const drawn = new Map(sheet.nodes.map((node) => [String(node.place.id), node]));

  const walk = walkLine(here, view.journey);

  const recentre = (): void => {
    const floor = view.discovered.find((place) => place.id === here)?.z ?? null;
    const drawn = drawnFor(view, floor);
    const standing = drawn.sheet.nodes.find((each) => each.place.id === here);
    setPlane(floor);
    hold.settle(standing ? panOnto(spotOf(standing, grid), 1) : { x: 0, y: 0 }, 1);
  };

  const lineFor = (id: string): string | null => tappedPlace(dev, id, drawn.get(id)?.goes ?? null);

  const go = (id: string): void => {
    const line = lineFor(id);
    if (line !== null) onSend(line);
  };

  const answer = { send: onSend, note: onNote };

  const place = (id: string, at: Point): void => answering(placedInto(sections, id, at), answer);

  // Read while the finger is still down as well as on the drop, so the places and the shape round
  // them move together rather than the shape catching up afterwards.
  const carrying = hold.carried === null ? null : carriedWith(whole, hold.carried.id);

  const carriedBy = (ids: readonly string[]): Point => (hold.carried !== null && ids.some((id) => carrying!.has(String(id))) ? hold.carried.by : NOT_CARRIED);

  function letGo(id: string, by: Point): void {
    const moving = carriedWith(whole, id);
    for (const staged of draggedTo(sections, whole.nodes.filter((each) => moving.has(String(each.place.id))), by, grid)) answering(staged, answer);
  }

  const roadsFrom = (id: string): string[] => (view.discovered.find((place) => place.id === id)?.adjacent ?? []).map((edge) => String(edge.to));

  const link = (id: string): void => {
    if (from === id) return setFrom(null);
    if (from === null) return setFrom(id);
    answering(joinedInto(sections, from, id, roadsFrom(from)), answer);
    setFrom(null);
  };

  const make = (id: string): void => {
    if (view.locations.some((place) => names(place.id, id))) return onNote(`${id} already names a location`);
    const staged = created(id, centredOn(hold, grid), at);
    if ('refused' in staged) return onNote(staged.refused);
    onSend(staged.line);
    onSend(gotoLine(stagedKey(id)));
    setNaming('');
  };

  const map = { plane: at, zoom: hold.zoom, pan: hold.pan, sheet, mode, from };

  useEffect(() => {
    onWhere({ pan: hold.pan, zoom: hold.zoom, plane });
  }, [hold.pan.x, hold.pan.y, hold.zoom, plane]);

  useTestSurface('map', { map, controls: { settle: hold.settle, plane: setPlane, recentre, mode: setMode, place, go, link, make } });

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
          <div className="absolute bottom-3 left-3 flex flex-col items-start gap-2">
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                make(naming.trim());
              }}
            >
              <input
                data-drive="map.make"
                aria-label={words('new')}
                value={naming}
                onChange={(event) => setNaming(event.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="w-32 select-text rounded-xl border border-border bg-surface px-3 font-mono text-xs text-text outline-none focus:border-accent"
              />
              <button
                data-drive="map.make"
                type="submit"
                className="shrink-0 rounded-xl border border-border bg-surface px-3 text-xs text-text-subtle transition-transform duration-75 active:scale-[0.97]"
              >
                {words('new')}
              </button>
            </form>
            <div className="flex items-center gap-2">
              {(['place', 'link'] as const).map((which) => (
                <button
                  key={which}
                  data-drive="map.mode"
                  type="button"
                  data-mode={which}
                  data-drawn={which === mode ? 'yes' : undefined}
                  onClick={() => {
                    setFrom(null);
                    setMode(mode === which ? 'go' : which);
                  }}
                  className={`rounded-xl border px-3 text-xs transition-transform duration-75 active:scale-[0.97] ${
                    which === mode ? 'border-accent bg-accent-strong font-semibold text-accent-text' : 'border-border bg-surface text-text-subtle'
                  }`}
                >
                  {words(which)}
                </button>
              ))}
            </div>
          </div>
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
        {map.sheet.regions.map((region) => (
          <RegionShape key={region.id} region={region} grid={grid} carried={carriedBy(region.drawn)} />
        ))}
        {map.sheet.roads.map((road) => (
          <Road
            key={`${road.from}>${road.to}`}
            from={drawn.get(road.from)!}
            to={drawn.get(road.to)!}
            open={road.open}
            mutual={road.mutual}
            grid={grid}
            bubble={hold.node}
            walking={onWalk(walk, road.from, road.to)}
          />
        ))}
      </svg>

      {map.sheet.nodes.map((node, at) => (
        <Bubble
          key={`${node.place.id}-${arrivals.includes(node.place.id) ? generation : 0}`}
          node={node}
          arrived={arrivals.includes(node.place.id)}
          walking={walkingAt(walk, node)}
          grid={grid}
          go={mode === 'link' ? () => link(node.place.id) : lineFor(node.place.id) === null ? null : () => go(node.place.id)}
          chosen={node.place.id === from}
          scale={map.zoom}
          held={(element) => void (bubbles.current[at] = element)}
          dragged={hold.dragged}
          carried={carriedBy([node.place.id])}
          grip={mode === 'place' ? hold.grip(node.place.id) : null}
        />
      ))}
    </DragSheet>
  );
}
