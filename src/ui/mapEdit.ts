import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { qualify } from '../content/namespace';
import { patchedInto, refused } from '../content/patch';
import type { Location } from '../content/sections/location';
import { parseModule, sectionFor } from '../content/sections';
import { DslError } from '../grammar/parser';
import { moduleLocalId, type AnySchema } from '../grammar/section';
import { MAPPED_KIND, names, stage, type Section, type Staged } from './authoringSurface';
import { PER_UNIT, placedAt, spotOf, type Node } from './discovery';
import { lookingAt, type Point } from './viewport';

export const settledOn = (at: Point): Point => ({ x: Math.round(at.x), y: Math.round(at.y) });

const declared = (text: string): Partial<Location> | { problem: string } => {
  try {
    const [section] = parseModule(text);
    return section.value as Partial<Location>;
  } catch (error) {
    if (error instanceof DslError) return { problem: error.message };
    throw error;
  }
};

const stated = (value: Partial<Location> | { problem: string }): value is { problem: string } => 'problem' in value;

export const answering = (staged: Staged, act: { send(line: string): void; note(text: string): void }): void =>
  void ('refused' in staged ? act.note(staged.refused) : act.send(staged.line));

// The address written the way the module that owns it writes it. A patch reads better for saying
// `riverside` where the section it patches says `riverside`, and it goes home to that module's file
// looking like the lines around it rather than like something the map wrote.
const asWritten = (address: string, target: string): string => {
  const at = address.lastIndexOf('.');
  return at < 0 ? target : moduleLocalId(address.slice(0, at), target);
};

// A map edit is a patch: the section says only the fields the edit touched, and the language lays
// those over whatever the id already holds. What the map stages is therefore the patch it has just
// written folded onto whatever patch was already staged there — never over the shipped body, which
// is the whole point: a drag that restated a location's every line was a diff nobody could read.
function staging(section: Section, lines: readonly string[]): Staged {
  const schema = sectionFor(MAPPED_KIND)?.schema;
  if (section.kind !== MAPPED_KIND || schema === undefined) return { refused: `# ${section.kind} ${section.address} is not drawn on the map` };
  const written = [`# ${MAPPED_KIND} ${section.address}`, ...lines].join('\n');
  if (!section.staged) return stage(written);
  const folded = patchedInto(section.text, written, schema as AnySchema);
  return refused(folded) ? folded : stage(folded.text);
}

export function placedInto(sections: readonly Section[], address: string, at: Point): Staged {
  const section = sections.find((each) => each.kind === MAPPED_KIND && names(each.address, address));
  if (!section) return { refused: `the map is drawing ${address}, which no module declares` };
  return movedTo(section, at);
}

export function droppedAt(sections: readonly Section[], node: Node, carried: Point): Staged {
  const spot = spotOf(node);
  return placedInto(sections, node.place.id, placedAt({ x: (spot.x + carried.x) / PER_UNIT, y: (spot.y + carried.y) / PER_UNIT }, node.climb));
}

export function movedTo(section: Section, to: Point): Staged {
  const value = declared(section.text);
  if (stated(value)) return { refused: value.problem };
  if (value.relative) {
    return { refused: `${section.address} is placed ${value.relative.direction} of ${value.relative.of}, so move that one — or say where this one is instead of how it stands to another` };
  }

  const spot = settledOn(to);
  return staging(section, [`x: ${spot.x}, y: ${spot.y}`]);
}

export const MAP_MODES = ['go', 'place', 'link'] as const;

export type MapMode = (typeof MAP_MODES)[number];

export const modeNamed = (value: unknown): MapMode | undefined => MAP_MODES.find((mode) => mode === value);

export function centredOn(hold: { pan: Point; zoom: number }): Point {
  const middle = lookingAt(hold.pan, hold.zoom);
  return { x: middle.x / PER_UNIT, y: middle.y / PER_UNIT };
}

const NAMED = /^[a-z][a-z0-9-]*$/;

export const stagedKey = (id: string): string => qualify(LOCAL_CHANGES_MODULE_ID, id);

export function created(id: string, at: Point, plane: number): Staged {
  if (!NAMED.test(id)) return { refused: `a location is named in lower case with dashes, as in north-shore, and not ${JSON.stringify(id)}` };
  const spot = settledOn(at);
  const where = plane === 0 ? `x: ${spot.x}, y: ${spot.y}` : `x: ${spot.x}, y: ${spot.y}, z: ${plane}`;
  return stage([`# location ${id}`, where].join('\n'));
}

export const linkedTo = (section: Section, to: string): Staged => staging(section, [`+adjacent: ${asWritten(section.address, to)}`]);

export const unlinkedFrom = (section: Section, to: string): Staged => staging(section, [`-adjacent: ${asWritten(section.address, to)}`]);

// Whether a road already runs to there is asked of the world rather than of the section's own text:
// a patch says what it changes and restates none of the roads already written, and a road the far
// end wrote is walked from this one too without this one saying so.
export const joined = (section: Section, to: string, roads: readonly string[]): Staged =>
  (roads.some((target) => names(target, to)) ? unlinkedFrom : linkedTo)(section, to);

export function joinedInto(sections: readonly Section[], from: string, to: string, roads: readonly string[]): Staged {
  const section = sections.find((each) => each.kind === MAPPED_KIND && names(each.address, from));
  if (!section) return { refused: `the map is drawing ${from}, which no module declares` };
  return joined(section, to, roads);
}
