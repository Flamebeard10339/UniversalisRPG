import type { PlayView } from '../runtime/session';
import { bare, signed, tidy } from './format';
import { LABELS } from './labels';
import type { Entry } from './sheet';

// The plane the view says is in hand, read into rows. Everything here is
// decided from two published fields — the focus and the planes it points into —
// so a screen is never asked what it is called and one this driver has never
// heard of draws its subject too.

type Plane = PlayView['planes'][number];
type Cluster = Plane['clusters'][number];
type Position = Cluster['positions'][number];
type Slot = Cluster['slots'][number];
type Payload = Position['payloads'][number];
type Standing = Position['standing'];

// What a standing is worth to a player holding points, rather than what the
// plane calls it: where the next point may go, where one has already gone, and
// the two ways a node is out of reach.
const STANDING: Record<Standing, string> = {
  allocated: LABELS.spent,
  available: LABELS.ready,
  unreached: LABELS.locked,
  blocked: LABELS.dead,
};

export interface PlaneRow {
  // Which node of the hexagon this is, and unique within one, so it is also
  // what the row is drawn under.
  node: string;
  standing: string;
  // The passive a position carries, or the hexagon a slot leads to; empty
  // where there is neither.
  what: string;
  worth: string;
}

export interface PlaneHex {
  hex: string;
  jewel: string;
  // The one the screen has in hand, which is what every growth line it
  // publishes leaves unsaid.
  focused: boolean;
  rows: PlaneRow[];
}

export interface PlaneView {
  instance: string;
  title: string;
  facts: Entry[];
  hexes: PlaneHex[];
}

function magnitude(bonus: Payload['effective']): string {
  if (bonus.percent) return `${signed(bonus.amount)}%`;
  const { min, max } = bonus.amount;
  return min === max ? signed(min) : `${signed(min)}-${tidy(Math.abs(max))}`;
}

// The effective number leads and the factor that made it trails, so a player
// never multiplies to know what a position pays.
function payload(report: Payload): string {
  const scale = report.scale === 1 ? '' : ` ×${tidy(report.scale)}`;
  return `${magnitude(report.effective)} ${bare(report.statId)}${scale}`;
}

function positionRow(position: Position): PlaneRow {
  return {
    node: `${LABELS.position} ${position.position}`,
    standing: position.free ? LABELS.free : STANDING[position.standing],
    what: position.title ?? '',
    worth: position.payloads.map(payload).join(', '),
  };
}

function slotRow(slot: Slot): PlaneRow {
  return {
    node: `${LABELS.slot} ${slot.direction}`,
    standing: STANDING[slot.standing],
    what: slot.beyond ?? '',
    worth: '',
  };
}

export function focusedPlane(view: PlayView | null): PlaneView | null {
  const focus = view?.focus;
  if (!view || !focus) return null;

  const plane = view.planes.find((each) => each.instance === focus.instance);
  if (!plane) return null;

  return {
    instance: plane.instance,
    title: plane.title,
    facts: [
      { name: LABELS.level, value: `${tidy(plane.level)}/${tidy(plane.maxLevel)}` },
      { name: LABELS.points, value: tidy(plane.remaining) },
    ],
    hexes: plane.clusters.map((cluster) => ({
      hex: cluster.hex,
      jewel: cluster.title,
      focused: cluster.hex === focus.hex,
      rows: [...cluster.positions.map(positionRow), ...cluster.slots.map(slotRow)],
    })),
  };
}
