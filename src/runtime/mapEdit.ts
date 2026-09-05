import { listLocalSections } from '../content/localChanges';
import { patchedInto, refused } from '../content/patch';
import { sectionFor } from '../content/sections';
import { moduleLocalId, type AnySchema } from '../grammar/section';
import type { Registry } from '../content/registry';
import { DIRECTION_VECTORS, relativeValue, stackedLocations, type Direction, type Location } from '../content/sections/location';
import { homelessId } from '../content/resolve';

export const MAPPED_KIND = 'location';

export interface Patch {
  kind: string;
  id: string;
  text: string;
}

export type Editing = { patches: Patch[] } | { refused: string };

const schemaOf = (kind: string): AnySchema => sectionFor(kind)!.schema!;

const asWritten = (address: string, target: string): string => {
  const at = address.lastIndexOf('.');
  return at < 0 ? target : moduleLocalId(address.slice(0, at), target);
};

const staged = (local: string, kind: string, id: string): string | undefined => listLocalSections(local).find((section) => section.kind === kind && section.id === id)?.text;

function patch(local: string, kind: string, id: string, lines: readonly string[]): Patch | { refused: string } {
  const written = [`# ${kind} ${id}`, ...lines].join('\n');
  const held = staged(local, kind, id);
  if (held === undefined) return { kind, id, text: written };
  const folded = patchedInto(held, written, schemaOf(kind));
  return refused(folded) ? folded : { kind, id, text: folded.text };
}

const found = (registry: Registry, id: string): Location | undefined => registry.locations.get(id);

export function carriedWith(places: readonly Pinned[], from: readonly string[]): string[] {
  const moving = new Set(from.map(String));
  for (let grew = true; grew; ) {
    grew = false;
    for (const place of places) {
      if (place.relative === undefined || moving.has(String(place.id))) continue;
      if (!moving.has(String(place.relative.of))) continue;
      moving.add(String(place.id));
      grew = true;
    }
  }
  const known = new Set(places.map((place) => String(place.id)));
  return [...moving].filter((held) => known.has(held));
}

export interface Pinned {
  id: string;
  relative?: { of: string };
}

export interface Spot {
  x: number;
  y: number;
  z?: number;
}

type Spot3 = { x: number; y: number; z: number };

const written = (at: Spot3): string => (at.z === 0 ? `x: ${at.x}, y: ${at.y}` : `x: ${at.x}, y: ${at.y}, z: ${at.z}`);

function staging(registry: Registry, local: string, landed: ReadonlyMap<string, Spot3>, loosed: string | null): Editing {
  const patches: Patch[] = [];
  for (const [id, at] of landed) {
    if (found(registry, id)!.relative && id !== loosed) continue;
    const one = patch(local, MAPPED_KIND, id, [written(at)]);
    if ('refused' in one) return one;
    patches.push(one);
  }
  return { patches };
}

const everyPlace = (registry: Registry): Location[] => [...registry.locations.values()];

const landing = (registry: Registry, held: readonly string[], by: Spot3): Map<string, Spot3> =>
  new Map(
    held.map((id) => {
      const each = found(registry, id)!;
      return [id, { x: each.x + by.x, y: each.y + by.y, z: each.z + by.z }];
    }),
  );

function stackedAfter(registry: Registry, landed: ReadonlyMap<string, Spot3>): string | undefined {
  const still = everyPlace(registry).filter((place) => !landed.has(place.id));
  return stackedLocations([...still.map((place) => ({ id: place.id, x: place.x, y: place.y, z: place.z })), ...[...landed].map(([id, at]) => ({ id, ...at }))])?.says;
}

function making(registry: Registry, local: string, id: string, at: Spot3, lines: readonly string[]): Editing {
  const homeless = homelessId(MAPPED_KIND, id);
  if (homeless !== null) return { refused: homeless };
  const stacked = stackedAfter(registry, new Map([[id, at]]));
  if (stacked !== undefined) return { refused: stacked };
  const one = patch(local, MAPPED_KIND, id, lines);
  return 'refused' in one ? one : { patches: [one] };
}

export function placing(registry: Registry, local: string, id: string, to: Spot): Editing {
  const place = found(registry, id);
  const at = { x: to.x, y: to.y, z: to.z ?? 0 };
  if (!place) return making(registry, local, id, at, [written(at)]);
  const by = { x: to.x - place.x, y: to.y - place.y, z: (to.z ?? place.z) - place.z };
  const held = carriedWith(everyPlace(registry), [id]);
  const landed = landing(registry, held, by);
  const stacked = stackedAfter(registry, landed);
  if (stacked !== undefined) return { refused: stacked };
  return staging(registry, local, landed, place.relative ? id : null);
}

export function pinning(registry: Registry, local: string, id: string, direction: Direction, of: string): Editing {
  const anchor = found(registry, of);
  if (!anchor) return { refused: `no # location is called ${of}` };
  if (id === of) return { refused: `${id} cannot be written off itself` };
  const [dx, dy, dz] = DIRECTION_VECTORS[direction];
  const at = { x: anchor.x + dx, y: anchor.y + dy, z: anchor.z + dz };
  const line = relativeValue.print({ direction, of: asWritten(id, of) });
  const place = found(registry, id);
  if (!place) return making(registry, local, id, at, [line]);
  for (let up: Location | undefined = anchor; up?.relative; up = found(registry, up.relative.of)) {
    if (up.relative.of === id) return { refused: `${of} already hangs off ${id}, so writing ${id} off ${of} would leave neither of them anywhere` };
  }
  const by = { x: at.x - place.x, y: at.y - place.y, z: at.z - place.z };
  const stacked = stackedAfter(registry, landing(registry, carriedWith(everyPlace(registry), [id]), by));
  if (stacked !== undefined) return { refused: stacked };
  const one = patch(local, MAPPED_KIND, id, [line]);
  return 'refused' in one ? one : { patches: [one] };
}

export function shifting(registry: Registry, local: string, id: string, by: { x: number; y: number }): Editing {
  const region = registry.regions.get(id);
  if (!region) return { refused: `no # region is called ${id}` };
  const landed = landing(registry, carriedWith(everyPlace(registry), region.holds), { ...by, z: 0 });
  const stacked = stackedAfter(registry, landed);
  return stacked === undefined ? staging(registry, local, landed, null) : { refused: stacked };
}

export function gathering(registry: Registry, local: string, id: string, places: readonly string[], holding: boolean): Editing {
  const region = registry.regions.get(id);
  if (!region && !holding) return { refused: `no # region is called ${id}` };
  for (const place of places) if (!found(registry, place)) return { refused: `no # location is called ${place}` };
  const left = (region?.holds ?? []).filter((each) => !places.includes(each));
  if (!holding && left.length === 0) {
    return { refused: `${id} would be left holding nothing, and a region with no places in it has no shape to draw: leave it one, or take the section away with /local delete region ${id}` };
  }
  const one = patch(local, 'region', id, places.map((place) => `${holding ? '+' : '-'}holds: ${asWritten(id, place)}`));
  return 'refused' in one ? one : { patches: [one] };
}

export function joining(registry: Registry, local: string, from: string, to: string, road: boolean): Editing {
  if (!found(registry, from)) return { refused: `no # location is called ${from}` };
  if (!found(registry, to)) return { refused: `no # location is called ${to}` };
  if (from === to) return { refused: `${from} is already where it is, so no road runs from it to itself` };
  const one = patch(local, MAPPED_KIND, from, [`${road ? '+' : '-'}adjacent: ${asWritten(from, to)}`]);
  return 'refused' in one ? one : { patches: [one] };
}
