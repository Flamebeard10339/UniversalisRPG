import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { qualify } from '../content/namespace';
import type { Edge, Location } from '../content/sections/location';
import { parseModule } from '../content/sections';
import { DslError } from '../grammar/parser';
import { MAPPED_KIND, names, stage, type Section, type Staged } from './authoringSurface';
import { PER_UNIT, placedAt, spotOf, type Node } from './discovery';
import { centreOf, type Box, type Point } from './viewport';

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
  const section = sections.find((each) => each.kind === MAPPED_KIND && names(each.address, address));
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

export const MAP_MODES = ['go', 'place', 'link'] as const;

export type MapMode = (typeof MAP_MODES)[number];

export const modeNamed = (value: unknown): MapMode | undefined => MAP_MODES.find((mode) => mode === value);

export function centredOn(hold: { pan: Point; zoom: number; box: Box }): Point {
  const middle = centreOf(hold.box);
  return { x: (middle.x - hold.pan.x / hold.zoom) / PER_UNIT, y: (middle.y - hold.pan.y / hold.zoom) / PER_UNIT };
}

const NAMED = /^[a-z][a-z0-9-]*$/;

export const stagedKey = (id: string): string => qualify(LOCAL_CHANGES_MODULE_ID, id);

export function created(id: string, at: Point, plane: number): Staged {
  if (!NAMED.test(id)) return { refused: `a location is named in lower case with dashes, as in north-shore, and not ${JSON.stringify(id)}` };
  const spot = settledOn(at);
  const where = plane === 0 ? `x: ${spot.x}, y: ${spot.y}` : `x: ${spot.x}, y: ${spot.y}, z: ${plane}`;
  return stage([`# location ${id}`, where].join('\n'));
}

const ADJACENT = /^adjacent[ \t]*:(.*)$/;

const indented = (line: string): boolean => line.trim() === '' || /^[ \t]/.test(line);

const target = (written: string): string => written.trim().split(/[ \t]/)[0];

const adjacentAt = (lines: readonly string[]): number => lines.findIndex((line, at) => at > 0 && ADJACENT.test(line));

function blockEnd(lines: readonly string[], at: number): number {
  let end = at + 1;
  while (end < lines.length && indented(lines[end])) end += 1;
  return end;
}

export function linksTo(section: Section, to: string): boolean {
  const value = declared(section.text);
  if (stated(value)) return false;
  return Array.isArray(value.adjacent) && (value.adjacent as Edge[]).some((edge) => names(edge.target, to));
}

export function linkedTo(section: Section, to: string): Staged {
  if (section.kind !== MAPPED_KIND) return { refused: `# ${section.kind} ${section.address} is not drawn on the map` };
  const lines = section.text.split('\n');
  const at = adjacentAt(lines);
  if (at < 0) return stage([lines[0], 'adjacent:', `  ${to}`, ...lines.slice(1)].join('\n'));

  const written = ADJACENT.exec(lines[at])![1];
  if (written.trim() !== '') return stage([...lines.slice(0, at), `${lines[at]}, ${to}`, ...lines.slice(at + 1)].join('\n'));
  const end = blockEnd(lines, at);
  return stage([...lines.slice(0, end), `  ${to}`, ...lines.slice(end)].join('\n'));
}

export function unlinkedFrom(section: Section, to: string): Staged {
  const lines = section.text.split('\n');
  const at = adjacentAt(lines);
  if (at < 0) return { refused: `${section.address} has no way to ${to} to take away` };

  const written = ADJACENT.exec(lines[at])![1];
  if (written.trim() !== '') {
    const kept = written.split(',').filter((each) => each.trim() !== '' && !names(target(each), to));
    return stage([...lines.slice(0, at), ...(kept.length === 0 ? [] : [`adjacent: ${kept.map((each) => each.trim()).join(', ')}`]), ...lines.slice(at + 1)].join('\n'));
  }

  const end = blockEnd(lines, at);
  const kept = lines.slice(at + 1, end).filter((line) => line.trim() === '' || !names(target(line), to));
  return stage([...lines.slice(0, at), ...(kept.some((line) => line.trim() !== '') ? [lines[at], ...kept] : []), ...lines.slice(end)].join('\n'));
}

export const joined = (section: Section, to: string): Staged => (linksTo(section, to) ? unlinkedFrom(section, to) : linkedTo(section, to));

export function joinedInto(sections: readonly Section[], from: string, to: string): Staged {
  const section = sections.find((each) => each.kind === MAPPED_KIND && names(each.address, from));
  if (!section) return { refused: `the map is drawing ${from}, which no module declares` };
  return joined(section, to);
}
