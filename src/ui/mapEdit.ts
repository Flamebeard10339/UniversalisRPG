import type { Location } from '../content/location';
import { parseModule } from '../content/module';
import { DslError } from '../grammar/parser';
import { MAPPED_KIND, stage, type Section, type Staged } from './authoringSurface';
import { PER_UNIT, placedAt, spotOf, type Node } from './discovery';
import type { Point } from './viewport';

// A drag is a section edit and nothing else. What a finger moved is a drawing;
// what reaches the registry is the same `/dsl` line a typed edit sends, through
// the same validate-and-adopt path, refused whole the same way. There is no
// coordinate channel here — the only thing this module produces is a line.

// Where a drag comes to rest, in the units a location declares. Whole ones,
// because the grammar's number parser takes an integer and nothing else, so a
// half unit is a coordinate the section could not be written with.
export const settledOn = (at: Point): Point => ({ x: Math.round(at.x), y: Math.round(at.y) });

const AXES = ['x', 'y'] as const;

type Axis = (typeof AXES)[number];

// A coordinate as a location declares one, wherever it sits on the line: the
// grammar puts several fields on one line separated by commas, so `x: 0, y: 0`
// and two lines of one field each are the same declaration written twice.
const COORDINATE = /(^|,)([ \t]*)(x|y)([ \t]*:[ \t]*)(-?\d+)/g;

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

// The same text with the coordinates restated, and the pair added where the
// section declared none — a location that named neither is at the origin by
// default, and a drag is the moment it starts saying where it is.
function restated(text: string, to: Point): string {
  const lines = text.split('\n');
  const found = new Set<Axis>();
  const rewritten = lines.map((line, at) => {
    // The heading is the section's name and an indented line belongs to a block
    // inside it; a coordinate is a field of the location itself.
    if (at === 0 || /^[ \t]/.test(line)) return line;
    return line.replace(COORDINATE, (_whole, lead: string, gap: string, axis: string, colon: string) => {
      found.add(axis as Axis);
      return `${lead}${gap}${axis}${colon}${axis === 'x' ? to.x : to.y}`;
    });
  });
  const missing = AXES.filter((axis) => !found.has(axis));
  if (missing.length === 0) return rewritten.join('\n');
  return [rewritten[0], missing.map((axis) => `${axis}: ${to[axis]}`).join(', '), ...rewritten.slice(1)].join('\n');
}

// What a staged edit does from a surface: down the one route to the registry,
// or said out loud where the surface worked out a refusal before a line ever
// existed. The command table has no view of a gesture, so a drag it never heard
// about is refused here or nowhere.
export const answering = (staged: Staged, act: { send(line: string): void; note(text: string): void }): void =>
  void ('refused' in staged ? act.note(staged.refused) : act.send(staged.line));

// The one route a surface has out of a gesture: the section the map is drawing
// for a place, and the line that says where it now is. A place the map draws
// that no module declares is a refusal rather than a silence, because it means
// the list and the sheet disagree and an author has to be told which.
export function placedInto(sections: readonly Section[], address: string, at: Point): Staged {
  const section = sections.find((each) => each.kind === MAPPED_KIND && each.address === address);
  if (!section) return { refused: `the map is drawing ${address}, which no module declares` };
  return movedTo(section, at);
}

// Where a place was let go of, in the units a location declares: the sheet's
// own pixels back into units, and the drawing's nudge undone — a place off the
// floor being looked at is drawn along the diagonal from where it stands.
export function droppedAt(sections: readonly Section[], node: Node, carried: Point): Staged {
  const spot = spotOf(node);
  return placedInto(sections, node.place.id, placedAt({ x: (spot.x + carried.x) / PER_UNIT, y: (spot.y + carried.y) / PER_UNIT }, node.climb));
}

// A location placed relative to another has its position stated as a fact about
// that other one. Dragging it could mean "move me" or "restate me absolutely",
// and choosing the second silently would delete an authored relationship on a
// gesture, so it is refused with the reason and the author decides.
export function movedTo(section: Section, to: Point): Staged {
  if (section.kind !== MAPPED_KIND) return { refused: `# ${section.kind} ${section.address} is not drawn on the map` };

  const value = declared(section.text);
  if (stated(value)) return { refused: value.problem };
  if (value.relative) {
    return { refused: `${section.address} is placed ${value.relative.direction} of ${value.relative.of}, so move that one — or say where this one is instead of how it stands to another` };
  }

  return stage(restated(section.text, settledOn(to)));
}
