import type { ModalChoice, ModalOption } from './modalOption';
import { hexKey } from '../content/hex';
import { Item } from '../content/item';
import { Registry } from '../content/registry';
import { carriedName } from './carriedName';
import { Answer, Localized, Localizer, localizerOf } from './localized';
import { carriedEntries, carriedFrame } from './carried';
import { ORIGIN } from './clusterPlane';
import { growLine } from './growth';
import { isSaid, say, type Said } from './said';
import { itemCopies, wornCopySlot } from './itemInstance';
import { ClusterReport, PlaneFocus, PlaneReport, planeReport } from './planeReport';
import { GameState, type ModalFrame } from './state';

export const BACK: Answer = 'back';

export const PLANE: Answer = 'plane';

export type PlaneFrame = Extract<ModalFrame, { name: 'item-plane' }>;

export function planeFrame(target: string, hex: string = hexKey(ORIGIN), said?: Said): PlaneFrame {
  const frame: PlaneFrame = { name: 'item-plane', answers: {}, target, hex };
  return said === undefined ? frame : { ...frame, said };
}

interface PlaneMove {
  readonly value: Answer;
  readonly shown: Localized;
  readonly line: string | null;
  readonly focus: string;
  readonly on?: Answer;
  readonly subject?: Localized;
}

function onCopy(frame: PlaneFrame, verb: string, tail: string, shown: Localized, subject?: Localized): PlaneMove {
  return { value: `${verb}: ${tail}`, shown, line: `${verb}: ${frame.target} ${tail}`, focus: frame.hex, subject };
}

function onHexagon(frame: PlaneFrame, verb: string, tail: string, shown: Localized, on?: Answer, subject?: Localized): PlaneMove {
  return { value: `${verb}: ${tail}`, shown, line: `${verb}: ${frame.target} at ${frame.hex} ${tail}`, focus: frame.hex, on, subject };
}

function goes(hex: string, shown: Localized): PlaneMove {
  return { value: `go: ${hex}`, shown, line: null, focus: hex, on: hex };
}

function reachable(report: PlaneReport, here: ClusterReport): string[] {
  return report.clusters.map((cluster) => cluster.hex).filter((hex) => hex !== here.hex);
}

function stacked(state: GameState, registry: Registry, spent: (item: Item) => boolean): Array<{ id: string; name: Localized }> {
  const localizer = localizerOf(registry, state);
  return [...itemCopies(state)].flatMap(([id, { stack }]) => {
    const item = registry.items.get(id);
    return stack > 0 && item !== undefined && spent(item) ? [{ id, name: carriedName(localizer, 'item', id, null) }] : [];
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
      moves.push(onHexagon(frame, 'slot', `${slot.direction} with ${jewel.id}`, shown, slot.node, jewel.name));
    }
  }
  for (const slot of here.slots) {
    if (slot.standing !== 'available') continue;
    moves.push(onHexagon(frame, 'allocate', `slot ${slot.direction}`, localizer.engine('engine.plane.allocate.slot', { direction: localizer.identifier(slot.direction) }), slot.node));
  }
  for (const position of here.positions) {
    if (position.standing !== 'available') continue;
    moves.push(onHexagon(frame, 'allocate', `position ${position.position}`, localizer.engine('engine.plane.allocate.position', { position: position.position }), position.node));
  }
  for (const food of stacked(state, registry, (item) => item.itemExperience !== undefined)) {
    moves.push(onCopy(frame, 'feed', `with ${food.id}`, localizer.engine('engine.plane.feed', { item: food.name }), food.name));
  }
  return moves;
}

function heading(localizer: Localizer, frame: PlaneFrame, report: PlaneReport | undefined): Localized {
  const plane = report?.name ?? localizer.identifier(frame.target);
  const hex = localizer.identifier(frame.hex);
  if (frame.said === undefined) return localizer.engine('engine.plane.heading', { plane, hex });
  return localizer.engine('engine.plane.heading.said', { plane, hex, said: say(localizer, frame.said) });
}

export function planeOptions(frame: PlaneFrame, state: GameState, registry: Registry): ModalOption[] {
  const report = planeReport(registry, state, frame.target);
  const localizer = localizerOf(registry, state);
  const offered: ModalChoice[] = movesOn(frame, report, state, registry).map((move) => ({ value: move.value, shown: move.shown, on: move.on, subject: move.subject }));
  return [{ key: PLANE, label: heading(localizer, frame, report), values: [...offered, { value: BACK, shown: localizer.engine('engine.plane.back') }] }];
}

function inventory(target: string, state: GameState, registry: Registry): ModalFrame {
  const entry = carriedEntries(state, registry).find((each) => each.id === target);
  return carriedFrame(entry ? { item: entry.id } : {});
}

export function planeSubmit(frame: PlaneFrame, state: GameState, registry: Registry): ModalFrame | null {
  const answer = frame.answers[PLANE];
  const move = movesOn(frame, planeReport(registry, state, frame.target), state, registry).find((each) => each.value === answer);
  if (!move) return inventory(frame.target, state, registry);
  if (move.line === null) return planeFrame(frame.target, move.focus);

  const growth = growLine(state, registry, move.line);
  return growth.ok ? planeFrame(growth.instance, move.focus) : planeFrame(frame.target, frame.hex, growth.refused);
}

export function planeFocus(frame: PlaneFrame): PlaneFocus {
  return { instance: frame.target, hex: frame.hex };
}

export function isPlaneFrameBody(value: Record<string, unknown>): boolean {
  if (typeof value.target !== 'string' || typeof value.hex !== 'string') return false;
  return value.said === undefined || isSaid(value.said);
}

export function planeStale(frame: PlaneFrame, state: GameState, registry: Registry): Localized | null {
  const localizer = localizerOf(registry, state);
  const report = planeReport(registry, state, frame.target);
  const slot = wornCopySlot(frame.target);
  if (!report) return slot === undefined ? localizer.engine('engine.plane.stale.uncarried', { item: localizer.identifier(frame.target) }) : localizer.engine('engine.plane.stale.slot', { slot: localizer.identifier(slot) });
  if (!report.clusters.some((cluster) => cluster.hex === frame.hex)) return localizer.engine('engine.plane.stale.hex', { hex: localizer.identifier(frame.hex) });
  return null;
}

export function samePlane(a: PlaneFrame, b: PlaneFrame): boolean {
  return a.target === b.target && a.hex === b.hex;
}
