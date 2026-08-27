import { useEffect, useRef, useState } from 'react';
import type { PlayView } from '../runtime/session';
import { DragSheet, useSheetHold, type Grip } from './DragSheet';
import { names } from './authoringSurface';
import { drawnFor, onWalk, spotOf, walkingAt, walkLine, type Node, type Walked, type Walking } from './discovery';
import { carriedWith } from '../runtime/mapEdit';
import { DevOnly } from './DevOnly';
import type { MapWhere } from './editorMemory';
import { centredOn, created, droppedAt, gatherLine, gripOnRegion, joinedInto, MAP_MODES, placeLine, regionGripped, settledOn, shiftedBy, shiftLine, stagedKey, type MapMode } from './mapEdit';
import { useTestSurface } from './useTestSurface';
import { MARCHING, MARCHING_BACK, useMoment } from './transient';
import { gotoLine, tappedPlace } from './devMode';
import { heading, leaving, panOnto, tapTarget, type Point, type Size } from './viewport';
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
    'data-found': node.found ? undefined : 'no',
    'data-walk': walking,
    style: { left: spot.x + carried.x, top: spot.y + carried.y },
    className: `absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-2 text-xs ${flash} ${
      walking === undefined ? 'border-border bg-panel' : WALKING_CLASS[walking]
    } ${node.climb !== 0 ? 'opacity-70' : ''} ${node.found ? '' : 'border-dashed opacity-60'} ${go === null && !grip ? 'text-text-subtle' : ''} ${chosen ? 'ring-2 ring-danger' : ''}`,
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
//
// Each end stops at its own label rather than at the widest one on the map, which is what left a road
// out of a short name hanging in the air a name's width short of it.
function Road({ from, to, open, mutual, walking, grid, boxes }: { from: Node; to: Node; open: boolean; mutual: boolean; walking: Walked | null; grid: number; boxes: [Size, Size] }): JSX.Element {
  const ends = [spotOf(from, grid), spotOf(to, grid)];
  const along = heading(ends[0], ends[1]);
  const a = leaving(ends[0], ends[1], boxes[0]);
  const b = leaving(ends[1], ends[0], boxes[1]);
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
      {mutual ? null : <polyline points={arrowAt(a, b, along)} {...look} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
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

// The shape a region draws, and the tag that names it. The tag is the region's own handle — dragging
// it in place mode carries every room the region holds, where dragging a room carries only that room,
// so both gestures say what they do and neither has to guess which the author meant. It is a button
// beside the places rather than lettering inside the drawing, for the same reason a place is: a thing
// meant to be pressed is drawn where a press lands.
function RegionShape({ region, grid, carried, chosen }: { region: Sheet['regions'][number]; grid: number; carried: Point; chosen: boolean }): JSX.Element | null {
  const path = roundedRing(cornersOf(region, grid, carried));
  if (path === '') return null;
  return (
    <g data-region={region.id} data-chosen={chosen ? 'yes' : undefined}>
      <path d={path} className={chosen ? 'fill-danger/10 stroke-danger/60' : 'fill-accent/5 stroke-accent/40'} strokeWidth={2} strokeDasharray="7 5" />
    </g>
  );
}

const cornersOf = (region: Sheet['regions'][number], grid: number, carried: Point): Point[] =>
  region.hull.map((point) => ({ x: point.x * grid + carried.x, y: point.y * grid + carried.y }));

function RegionTag({
  region,
  grid,
  carried,
  chosen,
  grip,
  onChoose,
}: {
  region: Sheet['regions'][number];
  grid: number;
  carried: Point;
  chosen: boolean;
  grip: Grip | null;
  onChoose: (() => void) | null;
}): JSX.Element | null {
  const corners = cornersOf(region, grid, carried);
  if (corners.length === 0) return null;
  // Above the shape rather than inside it, where a room would be standing on the letters.
  const spot = { x: corners.reduce((sum, point) => sum + point.x, 0) / corners.length, y: Math.min(...corners.map((point) => point.y)) };
  const look = {
    'data-region-tag': region.id,
    style: { left: spot.x, top: spot.y - 6 },
    className: `absolute -translate-x-1/2 -translate-y-full whitespace-nowrap px-1 text-[11px] uppercase tracking-wide ${chosen ? 'text-danger' : 'text-text-subtle'}`,
  };
  const grabbable = `${look.className} rounded border border-dashed ${chosen ? 'border-danger' : 'border-border'} bg-surface`;

  if (grip) {
    return (
      <button data-drive="map.shift" data-still type="button" {...grip} {...look} className={grabbable}>
        {region.title}
      </button>
    );
  }

  if (onChoose) {
    return (
      <button data-drive="map.gather" type="button" onClick={onChoose} {...look} className={grabbable}>
        {region.title}
      </button>
    );
  }

  return <span {...look}>{region.title}</span>;
}

const HEAD = 10;
const BARB = 7;

// The point of a one-way road, drawn at the middle of it and pointing the way the road runs. Which
// way that is comes from the places themselves rather than from the trimmed line between them: a road
// short enough that its two ends meet has no direction of its own left to read.
export function arrowAt(a: Point, b: Point, along: Point): string {
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
  const [ghost, setGhost] = useState<number | null>(null);
  const [gathering, setGathering] = useState('');

  // An author is shown every place on the floor they are looking at, found or not: a map that draws
  // only what a player has found is no use for putting the next place beside the last one. The floor
  // being pointed at rather than stood on comes with it, so an author can see what is under the one
  // they are laying out without leaving it.
  const { plane: at, here, sheet } = drawnFor(view, plane, dev ? 'every' : 'found', ghost);
  const grid = view.mapGrid;
  const spots = sheet.nodes.map((node) => spotOf(node, grid));
  const hold = useSheetHold(spots, bubbles, JSON.stringify(sheet.nodes.map((node) => node.place.title)), where, (id, by) => letGo(id, by));
  const drawn = new Map(sheet.nodes.map((node) => [String(node.place.id), node]));
  // How big each place is drawn, by the id on it: the same measurement the sheet is sized from, read
  // a second way so a road knows the label it has to stop short of.
  const boxes = new Map(sheet.nodes.map((node, at) => [String(node.place.id), hold.sizes[at] ?? hold.node]));
  const boxOf = (id: string): Size => boxes.get(String(id)) ?? hold.node;

  const walk = walkLine(here, view.journey);

  const recentre = (): void => {
    const floor = view.discovered.find((place) => place.id === here)?.z ?? null;
    const drawn = drawnFor(view, floor, dev ? 'every' : 'found');
    const standing = drawn.sheet.nodes.find((each) => each.place.id === here);
    setPlane(floor);
    hold.settle(standing ? panOnto(spotOf(standing, grid), 1) : { x: 0, y: 0 }, 1);
  };

  const lineFor = (id: string): string | null => tappedPlace(dev, id, drawn.get(id)?.goes ?? null);

  const go = (id: string): void => {
    const line = lineFor(id);
    if (line !== null) onSend(line);
  };

  const place = (id: string, at: Point): void => onSend(placeLine(id, settledOn(at)));

  // Which places move with whatever is under the finger is the engine's judgement — a room and
  // whatever is written off it, or every room a region holds — so it is asked once, and asked while
  // the finger is still down as well as on the drop, so a house and the shape round it move together.
  const holdsOf = (held: string): string[] => {
    const region = regionGripped(held);
    return region === null ? [held] : (view.regions.find((each) => String(each.id) === region)?.holds ?? []).map(String);
  };

  const carrying = hold.carried === null ? null : carriedWith(sheet.nodes.map((node) => node.place), holdsOf(hold.carried.id));

  const carriedBy = (ids: readonly string[]): Point => (hold.carried !== null && ids.some((id) => carrying!.includes(String(id))) ? hold.carried.by : NOT_CARRIED);

  function letGo(id: string, by: Point): void {
    const region = regionGripped(id);
    if (region !== null) return onSend(shiftLine(region, shiftedBy(by, grid)));
    const node = sheet.nodes.find((each) => String(each.place.id) === id);
    if (node) onSend(placeLine(id, droppedAt(node, by, grid)));
  }

  const link = (id: string): void => {
    if (from === id) return setFrom(null);
    if (from === null) return setFrom(id);
    onSend(joinedInto(sheet, from, id));
    setFrom(null);
  };

  const shift = (region: string, by: Point): void => onSend(shiftLine(region, settledOn(by)));

  const chosenRegion = (id: string): boolean => mode === 'region' && gathering.trim() !== '' && names(id, gathering.trim());

  const holding = (region: string, place: string): boolean => (view.regions.find((each) => names(each.id, region))?.holds ?? []).some((held) => String(held) === place);

  // Tapping a room while a region is named puts it in or takes it out; tapping one while no region is
  // named picks up the region it already belongs to, which is how an existing one is got hold of
  // without knowing what it is called.
  const gather = (region: string, place: string): void => {
    if (region === '') {
      const held = view.regions.find((each) => each.holds.some((one) => String(one) === place));
      return held === undefined ? onNote(`${place} is in no region: name one to gather it into`) : setGathering(String(held.id));
    }
    onSend(gatherLine(region, place, !holding(region, place)));
  };

  const make = (id: string): void => {
    if ([...view.discovered, ...view.undiscovered].some((place) => names(place.id, id))) return onNote(`${id} already names a location`);
    const staged = created(id, centredOn(hold, grid), at);
    if ('refused' in staged) return onNote(staged.refused);
    onSend(staged.line);
    onSend(gotoLine(stagedKey(id)));
    setNaming('');
  };

  const map = { plane: at, ghost, zoom: hold.zoom, pan: hold.pan, sheet, mode, from, gathering };

  useEffect(() => {
    onWhere({ pan: hold.pan, zoom: hold.zoom, plane });
  }, [hold.pan.x, hold.pan.y, hold.zoom, plane]);

  useTestSurface('map', { map, controls: { settle: hold.settle, plane: setPlane, ghost: setGhost, recentre, mode: setMode, place, go, link, make, gather, shift } });

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
            {mode === 'region' ? (
              <div className="flex items-center gap-2">
                <input
                  data-drive="map.gather"
                  aria-label={words('region')}
                  value={gathering}
                  onChange={(event) => setGathering(event.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="w-32 select-text rounded-xl border border-border bg-surface px-3 font-mono text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-xs text-text-subtle">{words('region-hint')}</span>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              {MAP_MODES.filter((which) => which !== 'go').map((which) => (
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
            <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-border bg-surface" onPointerLeave={() => setGhost(null)}>
              {[...map.sheet.planes].reverse().map((floor) => (
                <button
                  key={floor}
                  data-drive="map.plane"
                  type="button"
                  onClick={() => setPlane(floor)}
                  onPointerEnter={() => setGhost(floor === map.plane ? null : floor)}
                  onFocus={() => setGhost(floor === map.plane ? null : floor)}
                  onBlur={() => setGhost(null)}
                  data-floor={floor}
                  data-drawn={floor === map.plane ? 'yes' : undefined}
                  data-ghosting={floor === ghost ? 'yes' : undefined}
                  className={`px-2 text-xs tabular-nums ${floor === map.plane ? 'bg-accent-strong font-semibold text-accent-text' : floor === ghost ? 'bg-panel text-accent' : 'text-text-subtle'}`}
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
          <RegionShape key={region.id} region={region} grid={grid} carried={carriedBy(region.drawn)} chosen={chosenRegion(region.id)} />
        ))}
        {map.sheet.roads.map((road) => (
          <Road
            key={`${road.from}>${road.to}`}
            from={drawn.get(road.from)!}
            to={drawn.get(road.to)!}
            open={road.open}
            mutual={road.mutual}
            grid={grid}
            boxes={[boxOf(road.from), boxOf(road.to)]}
            walking={onWalk(walk, road.from, road.to)}
          />
        ))}
      </svg>

      {map.sheet.regions.map((region) => (
        <RegionTag
          key={region.id}
          region={region}
          grid={grid}
          carried={carriedBy(region.drawn)}
          chosen={chosenRegion(region.id)}
          grip={mode === 'place' ? hold.grip(gripOnRegion(String(region.id))) : null}
          onChoose={mode === 'region' ? () => setGathering(String(region.id)) : null}
        />
      ))}

      {map.sheet.nodes.map((node, at) => (
        <Bubble
          key={`${node.place.id}-${arrivals.includes(node.place.id) ? generation : 0}`}
          node={node}
          arrived={arrivals.includes(node.place.id)}
          walking={walkingAt(walk, node)}
          grid={grid}
          go={mode === 'link' ? () => link(node.place.id) : mode === 'region' ? () => gather(gathering.trim(), node.place.id) : lineFor(node.place.id) === null ? null : () => go(node.place.id)}
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
