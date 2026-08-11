import type { PlayView } from '../runtime/session';

export type Place = PlayView['discovered'][number];

export interface MapRow {
  place: Place;
  // How many roads from where the player is standing, and null for a place no
  // chain of discovered roads reaches.
  distance: number | null;
  here: boolean;
}

// The discovered places, read outward from where the player is standing: here
// first, then everywhere one road away, then two. A place discovered by being
// told about it rather than by walking to it has no road home yet, so it comes
// last rather than being left out.
export function mapRows(discovered: readonly Place[], here: string): MapRow[] {
  const byId = new Map(discovered.map((place) => [place.id, place]));
  const distance = new Map<string, number>();
  let edge = byId.has(here) ? [here] : [];
  for (let step = 0; edge.length > 0; step += 1) {
    for (const id of edge) distance.set(id, step);
    edge = edge.flatMap((id) => byId.get(id)?.adjacent ?? []).filter((id) => !distance.has(id) && byId.has(id));
  }

  return [...discovered]
    .map((place) => ({ place, distance: distance.get(place.id) ?? null, here: place.id === here }))
    .sort((left, right) => (left.distance ?? Infinity) - (right.distance ?? Infinity));
}

// Which places arrived between one view and the next. The map's own reading of
// the same event the engine already published, so nothing has to be remembered
// beyond the last list.
export function newlyFound(before: readonly Place[], after: readonly Place[]): string[] {
  const known = new Set(before.map((place) => place.id));
  return after.map((place) => place.id).filter((id) => !known.has(id));
}
