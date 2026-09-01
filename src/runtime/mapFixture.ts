import { loadUniverseWithDiagnostics } from '../content/load';
import type { ModuleSource } from '../content/universe';
import { placing } from './mapEdit';

export interface MapFixture {
  MOVED_PLACE: string;
  MOVED_TO: { x: number; y: number };
  MOVED_TO_FIELDS: string;
  MOVE_LINE: string;
  emptySquare: (nth?: number) => { x: number; y: number };
}

export function mapFixtureFor(sources: readonly ModuleSource[]): MapFixture {
  const registry = loadUniverseWithDiagnostics(sources).registry;
  const places = [...registry.locations.values()];
  const corner = { x: Math.max(...places.map((place) => place.x)), y: Math.max(...places.map((place) => place.y)) };

  const emptySquare = (nth = 0): { x: number; y: number } => ({ x: corner.x + 1 + nth, y: corner.y + 1 + nth });

  const MOVED_PLACE = places.find((place) => place.starting)!.id;
  const MOVED_TO = emptySquare();
  const MOVED_TO_FIELDS = `x: ${MOVED_TO.x}, y: ${MOVED_TO.y}`;

  const landing = placing(registry, '', MOVED_PLACE, MOVED_TO);
  if ('refused' in landing) throw new Error(`nothing below can stage an edit: moving ${MOVED_PLACE} to ${MOVED_TO_FIELDS} is refused — ${landing.refused}`);

  return { MOVED_PLACE, MOVED_TO, MOVED_TO_FIELDS, MOVE_LINE: `/dsl location ${MOVED_PLACE} ${MOVED_TO_FIELDS}`, emptySquare };
}
