import { DIRECTIONS, Direction } from './hex';
import { Shape } from './shapes';
import { list } from '../grammar/list';
import { Cursor, DslError, Parser } from '../grammar/parser';
import { SectionSchema } from '../grammar/section';
import { humanize, id, number, text } from '../grammar/values';

const NON_ROOT_DIRECTIONS: readonly Direction[] = DIRECTIONS.filter((direction) => direction !== 'w');

export const DEFAULT_MOD_SLOTS = 2;

// `# cluster-jewel` names a shape, says which of the five non-root edges are
// open, and fills numbered positions with passive references. `positions` is
// the `# entity` `stats:` shape (c4): a list hydrated into a map, so it reads
// inline or one pair to a line.
export interface ClusterJewel {
  id: string;
  title: string;
  examine?: string;
  shape: string;
  openConnections: string[];
  positions: Record<number, string>;
  modSlots: number;
}

// `<position> <passive>`, the way src/content/entity.ts's `statAssignment`
// reads `<stat> <range>` for `stats:`.
const positionAssignment: Parser<[number, string]> = {
  parse(cursor: Cursor) {
    const position = number.parse(cursor);
    cursor.take(/[ \t]+/);
    return [position, id.parse(cursor)];
  },
};

// Unlike `# entity stats:`, which lets a later assignment to the same key win,
// a cluster jewel refuses the duplicate outright (c4): two positions is
// authoring a shape wrong, not patching one.
function hydratePositions(parsed: unknown): Record<number, string> {
  const pairs = parsed as [number, string][];
  const positions: Record<number, string> = {};
  for (const [position, passive] of pairs) {
    if (positions[position] !== undefined) throw new DslError(`position ${position} is filled twice`);
    positions[position] = passive;
  }
  return positions;
}

export const clusterJewelSchema: SectionSchema<ClusterJewel> = {
  kind: 'cluster-jewel',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text },
    shape: { parser: id },
    openConnections: { parser: list(id), default: () => [], keyword: 'open-connections' },
    positions: { parser: list(positionAssignment), hydrate: hydratePositions, default: () => ({}), keyword: 'passives' },
    modSlots: { parser: number, default: () => DEFAULT_MOD_SLOTS, keyword: 'mod-slots' },
  },
};

// Everything `# cluster-jewel` refuses at load beyond the shape lookup
// (`getShape` already throws its own error, listing the shapes that exist):
// `open-connections` names 1-5 of the five non-root edges with no repeats and
// never the west edge (c6), and every position sits within the shape's range
// (c4). Pure so it can be unit-tested against a `Shape` without loading a
// module.
export function clusterJewelProblem(clusterJewel: ClusterJewel, shape: Shape): string | undefined {
  if (clusterJewel.openConnections.length === 0) return 'open-connections: needs at least one edge, or the plane never has anywhere left to grow';
  const seen = new Set<string>();
  for (const direction of clusterJewel.openConnections) {
    if (direction === 'w') return 'open-connections: names the west edge, which the root occupies';
    if (!(NON_ROOT_DIRECTIONS as readonly string[]).includes(direction)) return `open-connections: names an unknown direction: ${direction}`;
    if (seen.has(direction)) return `open-connections: names ${direction} more than once`;
    seen.add(direction);
  }

  for (const key of Object.keys(clusterJewel.positions)) {
    const position = Number(key);
    if (position < 1 || position > shape.positionCount) return `passives: position ${position} is outside ${clusterJewel.shape}'s 1-${shape.positionCount} range`;
  }
  return undefined;
}
