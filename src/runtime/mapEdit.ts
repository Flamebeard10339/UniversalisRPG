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

const schemaOf = (): AnySchema => sectionFor(MAPPED_KIND)!.schema!;

// The address the way the module that owns it writes it, so a road inside one module reads as one
// word and goes home to that module's file looking like the lines around it.
const asWritten = (address: string, target: string): string => {
  const at = address.lastIndexOf('.');
  return at < 0 ? target : moduleLocalId(address.slice(0, at), target);
};

const staged = (local: string, id: string): string | undefined => listLocalSections(local).find((section) => section.kind === MAPPED_KIND && section.id === id)?.text;

// One patch, folded onto whatever patch is already staged at that address rather than replacing it,
// so a place moved and then joined to somewhere says both.
function patch(local: string, id: string, lines: readonly string[]): Patch | { refused: string } {
  const written = [`# ${MAPPED_KIND} ${id}`, ...lines].join('\n');
  const held = staged(local, id);
  if (held === undefined) return { kind: MAPPED_KIND, id, text: written };
  const folded = patchedInto(held, written, schemaOf());
  return refused(folded) ? folded : { kind: MAPPED_KIND, id, text: folded.text };
}

const found = (registry: Registry, id: string): Location | undefined => registry.locations.get(id);

// Every place one move carries: the named place, the rest of the region it belongs to, and whatever
// hangs off any of those. A place that hangs off one being carried is given no line of its own — its
// coordinates are worked out from the place it names, so it arrives on its own.
export function carriedWith(regions: readonly { holds: readonly string[] }[], places: readonly Pinned[], id: string): string[] {
  const region = regions.find((each) => each.holds.map(String).includes(id));
  const moving = new Set(region ? region.holds.map(String) : [id]);
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

export function placing(registry: Registry, local: string, id: string, to: Spot): Editing {
  const place = found(registry, id);
  if (!place) return { refused: `no # location is called ${id}` };
  if (place.relative) return { refused: `${id} is placed ${place.relative.direction} of ${place.relative.of}, so move that one — or say where this one is instead of how it stands to another` };

  const by = { x: to.x - place.x, y: to.y - place.y, z: (to.z ?? place.z) - place.z };
  const patches: Patch[] = [];
  for (const held of carriedWith([...registry.regions.values()], [...registry.locations.values()], id)) {
    const each = found(registry, held)!;
    if (each.relative) continue;
    const where = each.z + by.z === 0 ? `x: ${each.x + by.x}, y: ${each.y + by.y}` : `x: ${each.x + by.x}, y: ${each.y + by.y}, z: ${each.z + by.z}`;
    const one = patch(local, held, [where]);
    if ('refused' in one) return one;
    patches.push(one);
  }
  return { patches };
}

export function joining(registry: Registry, local: string, from: string, to: string, road: boolean): Editing {
  if (!found(registry, from)) return { refused: `no # location is called ${from}` };
  if (!found(registry, to)) return { refused: `no # location is called ${to}` };
  if (from === to) return { refused: `${from} is already where it is, so no road runs from it to itself` };
  const one = patch(local, from, [`${road ? '+' : '-'}adjacent: ${asWritten(from, to)}`]);
  return 'refused' in one ? one : { patches: [one] };
}
