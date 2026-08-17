import { useEffect, useRef, useState } from 'react';
import type { PlayView } from '../runtime/session';
import type { Section } from './authoringSurface';
import { DragSheet, useSheetHold, type Grip } from './DragSheet';
import { drawnFor, onWalk, spotOf, walkLine, type Node } from './discovery';
import { DevOnly } from './DevOnly';
import type { MapWhere } from './editorMemory';
import { answering, droppedAt, placedInto } from './mapEdit';
import { useTestSurface } from './testSurface';
import { useMoment } from './transient';
import { tappedPlace } from './devMode';
import { bounds, panOnto, tapTarget, type Point } from './viewport';
import type { Words } from './words';

// The map draws its own working out — the box a pan is held against — for
// whoever is building the map. Read once, off the address, because a debug
// surface that can be reached from inside the game is a debug surface that has
// to be designed.
const DEBUGGING = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

// A place under the finger is drawn where the finger has taken it and is not
// there yet: the registry learns about it once, on release, through the same
// door a typed edit takes. A live drag that wrote coordinates as it went would
// be a second path, unvalidated for the length of the gesture, and a refused
// edit would be a state the map was already drawn in.
const NOT_CARRIED: Point = { x: 0, y: 0 };

// One place on the sheet. Its own component because the arrival it plays is
// asked for through the channel, and a channel is reached by a hook.
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
  // What tapping this place does, and nothing when tapping it does nothing.
  go: (() => void) | null;
  dragged: () => boolean;
  // Where the finger has carried it since it was picked up, in sheet pixels.
  carried: Point;
  // Null when places are not being moved, which is what makes a press a tap.
  grip: Grip | null;
}): JSX.Element {
  const spot = spotOf(node);
  const flash = useMoment('arrival', arrived, node.place.id);

  // What the bubble looks like either way, and what is inside it. A control
  // names on its own tag the action that drives it, and a tag cannot say
  // "choose, unless places are being moved" — so the two behaviours are two
  // controls over one appearance rather than one control that lies in a mode.
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
      {/* Inside the control, so what it covers is what the control answers, and
          sized against the zoom the sheet is drawn at. */}
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
  // Whose session this is, which is the whole of what the tap below decides on.
  dev: boolean;
  // The map's slice of the one list, which is what a drag stages an edit out of.
  sections: readonly Section[];
  where: MapWhere;
  onWhere: (where: MapWhere) => void;
  onSend: (line: string) => void;
  onNote: (text: string) => void;
}): JSX.Element {
  const bubbles = useRef<Array<HTMLElement | null>>([]);
  const [plane, setPlane] = useState<number | null>(where.plane);
  const [moving, setMoving] = useState(false);

  // A place with no way out to it is somewhere the player cannot set off for
  // now, and the map says so by not being tappable rather than by saying why.
  const { plane: at, here, sheet, travels } = drawnFor(view, plane);
  const spots = sheet.nodes.map(spotOf);
  const hold = useSheetHold(spots, bubbles, JSON.stringify(sheet.nodes.map((node) => node.place.title)), where, (id, by) => letGo(id, by));

  // The walk under way, as the engine published it, with the place the player
  // is standing in at the head so a road on it is a pair of neighbours.
  const walk = walkLine(here, view.journey);
  const going = walk[walk.length - 1];

  // Back to where the player is standing, on the floor they are standing on, at
  // rest. The one control on the map that undoes a gesture rather than making
  // one: a player who has wandered off across three z-layers has no other way
  // back to themselves.
  const recentre = (): void => {
    const floor = view.discovered.find((place) => place.id === here)?.z ?? null;
    const drawn = drawnFor(view, floor);
    const standing = drawn.sheet.nodes.find((each) => each.place.id === here);
    setPlane(floor);
    hold.settle(standing ? panOnto(spotOf(standing), bounds(drawn.sheet.nodes.map(spotOf)), 1) : { x: 0, y: 0 }, 1);
  };

  // The one handler a tap on a place goes through, whichever of the two things
  // it turns out to do. Both spell a line, so there is one route into the
  // session from this page and the decision is made once (c9).
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

  // The one value the map both draws and hands over, assembled here and not
  // twice. A registration that says a floor the map is not drawing is markup
  // that says it too, so what a driving agent is told is what a player sees or
  // a render test fails.
  const map = { plane: at, zoom: hold.zoom, pan: hold.pan, sheet, travels, moving };

  // Where the map is looking, kept where the edits are so that reopening the
  // page opens it here. Reported rather than written from inside the gesture,
  // because the sheet comes to rest on every frame and a slot does not.
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
          {/* Moving places is a mode, because a drag on a place and a drag on
              the sheet are the same gesture and only one of them can be it. */}
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
            // The floors, named by the number the author gave them. A word for
            // up or down would be this layer writing prose; the number is the
            // content's.
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
          // Where the walk ends, somewhere it still has to cross, or neither.
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
