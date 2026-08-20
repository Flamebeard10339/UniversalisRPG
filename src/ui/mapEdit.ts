import type { Location } from '../content/sections/location';
import { parseModule } from '../content/sections';
import { DslError } from '../grammar/parser';
import { MAPPED_KIND, stage, type Section, type Staged } from './authoringSurface';
import { PER_UNIT, placedAt, spotOf, type Node } from './discovery';
import type { Point } from './viewport';

export const settledOn = (at: Point): Point => ({ x: Math.round(at.x), y: Math.round(at.y) });

const AXES = ['x', 'y'] as const;

type Axis = (typeof AXES)[number];

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

function restated(text: string, to: Point): string {
  const lines = text.split('\n');
  const found = new Set<Axis>();
  const rewritten = lines.map((line, at) => {
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

export const answering = (staged: Staged, act: { send(line: string): void; note(text: string): void }): void =>
  void ('refused' in staged ? act.note(staged.refused) : act.send(staged.line));

export function placedInto(sections: readonly Section[], address: string, at: Point): Staged {
  const section = sections.find((each) => each.kind === MAPPED_KIND && each.address === address);
  if (!section) return { refused: `the map is drawing ${address}, which no module declares` };
  return movedTo(section, at);
}

export function droppedAt(sections: readonly Section[], node: Node, carried: Point): Staged {
  const spot = spotOf(node);
  return placedInto(sections, node.place.id, placedAt({ x: (spot.x + carried.x) / PER_UNIT, y: (spot.y + carried.y) / PER_UNIT }, node.climb));
}

export function movedTo(section: Section, to: Point): Staged {
  if (section.kind !== MAPPED_KIND) return { refused: `# ${section.kind} ${section.address} is not drawn on the map` };

  const value = declared(section.text);
  if (stated(value)) return { refused: value.problem };
  if (value.relative) {
    return { refused: `${section.address} is placed ${value.relative.direction} of ${value.relative.of}, so move that one — or say where this one is instead of how it stands to another` };
  }

  return stage(restated(section.text, settledOn(to)));
}
