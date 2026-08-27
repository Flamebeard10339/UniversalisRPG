import { listLocalSections } from '../content/localChanges';
import { patchedInto, refused } from '../content/patch';
import { sectionFor } from '../content/sections';
import { moduleLocalId, type AnySchema } from '../grammar/section';
import type { Registry } from '../content/registry';
import type { Location } from '../content/sections/location';

// Editing the map: where a place is, and which roads run out of it. Written as patches over whatever
// the world already says — the section that goes into local changes names the fields the edit
// touched and no others — and written here rather than beside the map pane, because a map only a
// screen can edit is a map an agent driving the game cannot.
export const MAPPED_KIND = 'location';

export interface Patch {
  kind: string;
  id: string;
  text: string;
}

export type Editing = { patches: Patch[] } | { refused: string };

const schemaOf = (kind: string): AnySchema => sectionFor(kind)!.schema!;

// The address the way the module that owns it writes it, so a road inside one module reads as one
// word and goes home to that module's file looking like the lines around it.
const asWritten = (address: string, target: string): string => {
  const at = address.lastIndexOf('.');
  return at < 0 ? target : moduleLocalId(address.slice(0, at), target);
};

const staged = (local: string, kind: string, id: string): string | undefined => listLocalSections(local).find((section) => section.kind === kind && section.id === id)?.text;

// One patch, folded onto whatever patch is already staged at that address rather than replacing it,
// so a place moved and then joined to somewhere says both.
function patch(local: string, kind: string, id: string, lines: readonly string[]): Patch | { refused: string } {
  const written = [`# ${kind} ${id}`, ...lines].join('\n');
  const held = staged(local, kind, id);
  if (held === undefined) return { kind, id, text: written };
  const folded = patchedInto(held, written, schemaOf(kind));
  return refused(folded) ? folded : { kind, id, text: folded.text };
}

const found = (registry: Registry, id: string): Location | undefined => registry.locations.get(id);

// Every place one move carries: the places named, and whatever hangs off any of them. A place that
// hangs off one being carried is given no line of its own — its coordinates are worked out from the
// place it names, so it arrives on its own.
//
// What is named is the caller's: one place for a place being moved, everything a region holds for a
// region being moved. A place inside a region is a place, and moving it moves it — the shape follows
// the rooms, so a room may be put where the author wants it inside its own house.
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

// What a place needs to say for a drag to know whether it comes along. Structural rather than the
// registry's own record, so the map pane asks the same question of the view it was handed.
export interface Pinned {
  id: string;
  relative?: { of: string };
}

export interface Spot {
  x: number;
  y: number;
  z?: number;
}

// One move, however many places it carries: every place named is written where it now stands, and a
// place written off another is left alone because it arrives on its own.
function moved(registry: Registry, local: string, held: readonly string[], by: { x: number; y: number; z: number }): Editing {
  const patches: Patch[] = [];
  for (const id of held) {
    const each = found(registry, id)!;
    if (each.relative) continue;
    const where = each.z + by.z === 0 ? `x: ${each.x + by.x}, y: ${each.y + by.y}` : `x: ${each.x + by.x}, y: ${each.y + by.y}, z: ${each.z + by.z}`;
    const one = patch(local, MAPPED_KIND, id, [where]);
    if ('refused' in one) return one;
    patches.push(one);
  }
  return { patches };
}

const everyPlace = (registry: Registry): Location[] => [...registry.locations.values()];

export function placing(registry: Registry, local: string, id: string, to: Spot): Editing {
  const place = found(registry, id);
  if (!place) return { refused: `no # location is called ${id}` };
  if (place.relative) return { refused: `${id} is placed ${place.relative.direction} of ${place.relative.of}, so move that one — or say where this one is instead of how it stands to another` };

  return moved(registry, local, carriedWith(everyPlace(registry), [id]), { x: to.x - place.x, y: to.y - place.y, z: (to.z ?? place.z) - place.z });
}

// A region has no coordinates of its own — it is where its rooms are — so it is moved by how far and
// not to where. That is also what a drag on its shape actually is.
export function shifting(registry: Registry, local: string, id: string, by: { x: number; y: number }): Editing {
  const region = registry.regions.get(id);
  if (!region) return { refused: `no # region is called ${id}` };
  return moved(registry, local, carriedWith(everyPlace(registry), region.holds), { ...by, z: 0 });
}

// Which places a region gathers. Written as a patch like every other map edit, so a region shipped in
// a module keeps everything else it says and an author's change to it is one line of local changes —
// and a name nothing declares yet becomes a region of the author's own, the way a new place does.
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
