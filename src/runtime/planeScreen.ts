import { hexKey } from '../content/hex';
import { Item } from '../content/item';
import { Registry } from '../content/registry';
import { carriedName } from './carriedName';
import { BASE_LANGUAGE, Localized, Localizer, localizerFor, localizerOf } from './localized';
import { carriedEntries, carriedFrame } from './carriedScreen';
import { ORIGIN } from './clusterPlane';
import { growLine } from './growth';
import { isSaid, say, type Said } from './said';
import { itemCopies, wornCopySlot } from './itemInstance';
import { type ModalChoice, type ModalFrame, type ModalOption } from './modals';
import { ClusterReport, PlaneFocus, PlaneReport, planeReport } from './planeReport';
import { GameState } from './state';

// One item's plane, with one hexagon of it in hand. The screen asks a single
// question and every answer to it either moves the focus or grows the plane;
// nothing here decides whether a growth is allowed, which is why every value it
// publishes is a line the growth verbs read for themselves.

// The value that leaves (c15). It goes back to the screen this one replaced
// rather than closing the world, which is the other half of c3.
export const BACK = 'Back to inventory';

// The one thing this screen asks. An answer to it is a value it published, so
// neither driver needs a way to type into it.
export const PLANE = 'plane';

export type PlaneFrame = Extract<ModalFrame, { name: 'item-plane' }>;

export function planeFrame(target: string, hex: string = hexKey(ORIGIN), said?: Said): PlaneFrame {
  const frame: PlaneFrame = { name: 'item-plane', answers: {}, target, hex };
  return said === undefined ? frame : { ...frame, said };
}

// What one published value does. `line` is the whole growth directive — the
// value with the target and the focused hexagon the frame holds filled back in
// — and is null for a value that only moves the focus (c5).
interface PlaneMove {
  readonly value: string;
  // The words offered for it, which move with the played language while the
  // value does not — the two halves of one `ModalChoice`.
  readonly shown: Localized;
  readonly line: string | null;
  readonly focus: string;
}

// c4: a value and the line it becomes are one directive, and the only
// difference between them is the arguments the frame already holds. Which ones
// those are is the verb's — `feed:` grows a copy wherever the focus happens to
// be, the other two grow a hexagon of one — so the fill is written per verb
// rather than as one shared prefix, and a frame that one day holds more than
// one hexagon fills more in rather than needing a grammar to say so.
// The tail is spelled twice over: once in the base language the answer is
// replayed in and once in the ids the directive takes, because a jewel is named
// to the parser by its id and to a `# test` by the name it carries in the one
// language every recording shares. What the player reads is neither of those —
// it is the move's own `shown`.
interface Tail {
  readonly base: string;
  readonly spelled: string;
}

const same = (tail: string): Tail => ({ base: tail, spelled: tail });

function onCopy(frame: PlaneFrame, verb: string, tail: Tail, shown: Localized): PlaneMove {
  return { value: `${verb}: ${tail.base}`, shown, line: `${verb}: ${frame.target} ${tail.spelled}`, focus: frame.hex };
}

function onHexagon(frame: PlaneFrame, verb: string, tail: Tail, shown: Localized): PlaneMove {
  return { value: `${verb}: ${tail.base}`, shown, line: `${verb}: ${frame.target} at ${frame.hex} ${tail.spelled}`, focus: frame.hex };
}

function goes(hex: string, shown: Localized): PlaneMove {
  return { value: `Go to ${hex}`, shown, line: null, focus: hex };
}

// The hexagons a step away, whichever side of the slot joining them this one
// is. A cluster that entered another way is still somewhere to walk to.
function reachable(report: PlaneReport, here: ClusterReport): string[] {
  const standing = new Set(report.clusters.map((cluster) => cluster.hex));
  const beyond = here.slots.flatMap((slot) => slot.beyond ?? []);
  if (here.entry) beyond.push(here.entry.hex);
  return [...new Set(beyond)].filter((hex) => standing.has(hex));
}

// What a stack the player can spend holds, by the field that says the item is
// the kind a growth verb consumes. A grown copy is never taken, so a jewel that
// has itself been grown is not one to slot.
function stacked(state: GameState, registry: Registry, spent: (item: Item) => boolean): Array<{ id: string; name: Localized; base: string }> {
  const localizer = localizerOf(registry, state);
  const base = localizerFor(registry, BASE_LANGUAGE);
  return [...itemCopies(state)].flatMap(([id, { stack }]) => {
    const item = registry.items.get(id);
    return stack > 0 && item !== undefined && spent(item) ? [{ id, name: carriedName(localizer, 'item', id, null), base: carriedName(base, 'item', id, null) }] : [];
  });
}

function movesOn(frame: PlaneFrame, report: PlaneReport | undefined, state: GameState, registry: Registry): PlaneMove[] {
  const here = report?.clusters.find((cluster) => cluster.hex === frame.hex);
  if (!report || !here) return [];

  const localizer = localizerOf(registry, state);
  const moves = reachable(report, here).map((hex) => goes(hex, localizer.engine('engine.plane.go', { hex: localizer.identifier(hex) })));
  for (const slot of here.slots) {
    if (slot.standing !== 'allocated' || slot.beyond !== null) continue;
    for (const jewel of stacked(state, registry, (item) => item.clusterJewel !== undefined)) {
      const shown = localizer.engine('engine.plane.slot', { direction: localizer.identifier(slot.direction), jewel: jewel.name });
      moves.push(onHexagon(frame, 'slot', { base: `${slot.direction} with ${jewel.base}`, spelled: `${slot.direction} with ${jewel.id}` }, shown));
    }
  }
  for (const slot of here.slots) {
    if (slot.standing !== 'available') continue;
    moves.push(onHexagon(frame, 'allocate', same(`slot ${slot.direction}`), localizer.engine('engine.plane.allocate.slot', { direction: localizer.identifier(slot.direction) })));
  }
  for (const position of here.positions) {
    if (position.standing !== 'available') continue;
    moves.push(onHexagon(frame, 'allocate', same(`position ${position.position}`), localizer.engine('engine.plane.allocate.position', { position: position.position })));
  }
  // Last, and on every hexagon, because what a copy is fed is the one growth
  // that is the copy's rather than one hexagon of it — and without it a base
  // still in its stack would publish only values it has no point to spend on.
  for (const food of stacked(state, registry, (item) => item.itemExperience !== undefined)) {
    moves.push(onCopy(frame, 'feed', { base: `with ${food.base}`, spelled: `with ${food.id}` }, localizer.engine('engine.plane.feed', { item: food.name })));
  }
  return moves;
}

// What the screen is of, where on it, and what it last said — the label being
// the whole of what this screen says beside its values, so a refusal the frame
// came back holding reaches the player here (c7). A plane no report can be
// built for is named by the id the verb addressed it with, which is an id and
// not words.
function heading(localizer: Localizer, frame: PlaneFrame, report: PlaneReport | undefined): Localized {
  const plane = report?.name ?? localizer.identifier(frame.target);
  const hex = localizer.identifier(frame.hex);
  if (frame.said === undefined) return localizer.engine('engine.plane.heading', { plane, hex });
  return localizer.engine('engine.plane.heading.said', { plane, hex, said: say(localizer, frame.said) });
}

export function planeOptions(frame: PlaneFrame, state: GameState, registry: Registry): ModalOption[] {
  const report = planeReport(registry, state, frame.target);
  const localizer = localizerOf(registry, state);
  const offered: ModalChoice[] = movesOn(frame, report, state, registry).map((move) => ({ value: move.value, shown: move.shown }));
  return [{ key: PLANE, label: heading(localizer, frame, report), values: [...offered, { value: BACK, shown: localizer.engine('engine.plane.back') }] }];
}

// c3: leaving a plane is not closing a screen, it is going back to the one this
// replaced with the copy it was opened from still chosen.
function inventory(target: string, state: GameState, registry: Registry): ModalFrame {
  const entry = carriedEntries(state, registry).find((each) => each.id === target);
  return carriedFrame(entry ? { item: entry.value } : {});
}

export function planeSubmit(frame: PlaneFrame, state: GameState, registry: Registry): ModalFrame | null {
  const answer = frame.answers[PLANE];
  const move = movesOn(frame, planeReport(registry, state, frame.target), state, registry).find((each) => each.value === answer);
  // Every published value but BACK is a move, so an answer naming none is the
  // one that leaves — as is a value the plane has since stopped publishing.
  if (!move) return inventory(frame.target, state, registry);
  if (move.line === null) return planeFrame(frame.target, move.focus);

  // Growing a base still in its stack mints it, so the copy the screen holds
  // after a growth is the one the growth itself names.
  const growth = growLine(state, registry, move.line);
  return growth.ok ? planeFrame(growth.instance, move.focus) : planeFrame(frame.target, frame.hex, growth.refused);
}

// The two ids this frame holds are the two a focus is, and planeReport answers
// for the target either way it is carried, so what the frame has in hand is
// already a plane the view publishes rather than one it would have to copy.
export function planeFocus(frame: PlaneFrame): PlaneFocus {
  return { instance: frame.target, hex: frame.hex };
}

// Beyond a name and answers, a saved frame is two ids and whatever the plane
// last said, as the key it was said with. Shape only: whether either id still
// names anything is planeStale's.
export function isPlaneFrameBody(value: Record<string, unknown>): boolean {
  if (typeof value.target !== 'string' || typeof value.hex !== 'string') return false;
  return value.said === undefined || isSaid(value.said);
}

export function planeStale(frame: PlaneFrame, state: GameState, registry: Registry): Localized | null {
  const localizer = localizerOf(registry, state);
  const report = planeReport(registry, state, frame.target);
  // c16: a slot's spelling is the runtime's own word for whichever copy the slot
  // holds, so a sentence about one that has emptied names the slot rather than
  // printing a spelling the player has never seen.
  const slot = wornCopySlot(frame.target);
  if (!report) return slot === undefined ? localizer.engine('engine.plane.stale.uncarried', { item: localizer.identifier(frame.target) }) : localizer.engine('engine.plane.stale.slot', { slot: localizer.identifier(slot) });
  if (!report.clusters.some((cluster) => cluster.hex === frame.hex)) return localizer.engine('engine.plane.stale.hex', { hex: localizer.identifier(frame.hex) });
  return null;
}

// Two plane screens are the same screen when they hold the same copy and the
// same hexagon; what either of them was last told is not part of which one it is.
export function samePlane(a: PlaneFrame, b: PlaneFrame): boolean {
  return a.target === b.target && a.hex === b.hex;
}
