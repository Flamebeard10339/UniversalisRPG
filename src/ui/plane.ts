import type { Answer, Localized, Localizer } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import { bare, signed, tidy } from './format';
import type { LabelId } from './labels';
import type { Entry } from './sheet';
import { wordsOf, type Words } from './words';

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
const STANDING: Record<Standing, LabelId> = {
  allocated: 'spent',
  available: 'ready',
  unreached: 'locked',
  blocked: 'dead',
};

export interface PlaneRow {
  // Which node of the hexagon this is, and unique within one, so it is also
  // what the row is drawn under.
  node: Localized;
  standing: Localized;
  // The passive a position carries, or the hexagon a slot leads to; null where
  // there is neither, because an empty row is nothing to say rather than a word
  // for having nothing.
  what: Localized | null;
  worth: Localized | null;
}

export interface PlaneHex {
  hex: Answer;
  jewel: Localized;
  // The one the screen has in hand, which is what every growth line it
  // publishes leaves unsaid.
  focused: boolean;
  rows: PlaneRow[];
}

export interface PlaneView {
  instance: Answer;
  title: Localized;
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

function positionRow(position: Position, words: Words, localizer: Localizer): PlaneRow {
  const paid = position.payloads.map(payload).join(', ');
  return {
    node: words('position', { position: position.position }),
    standing: words(position.free ? 'free' : STANDING[position.standing]),
    what: position.title,
    worth: paid === '' ? null : localizer.identifier(paid),
  };
}

function slotRow(slot: Slot, words: Words, localizer: Localizer): PlaneRow {
  return {
    node: words('slot', { direction: localizer.identifier(slot.direction) }),
    standing: words(STANDING[slot.standing]),
    what: slot.beyond === null ? null : localizer.identifier(slot.beyond),
    worth: null,
  };
}

export function focusedPlane(view: PlayView | null, localizer: Localizer): PlaneView | null {
  const focus = view?.focus;
  if (!view || !focus) return null;

  const plane = view.planes.find((each) => each.instance === focus.instance);
  if (!plane) return null;

  const words = wordsOf(localizer);
  return {
    instance: plane.instance,
    title: plane.title,
    facts: [
      { name: words('level'), value: localizer.identifier(`${tidy(plane.level)}/${tidy(plane.maxLevel)}`) },
      { name: words('points'), value: localizer.identifier(tidy(plane.remaining)) },
    ],
    hexes: plane.clusters.map((cluster) => ({
      hex: cluster.hex,
      jewel: cluster.title,
      focused: cluster.hex === focus.hex,
      rows: [...cluster.positions.map((position) => positionRow(position, words, localizer)), ...cluster.slots.map((slot) => slotRow(slot, words, localizer))],
    })),
  };
}
