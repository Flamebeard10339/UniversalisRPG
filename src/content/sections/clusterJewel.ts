import { list } from '../../grammar/list';
import { Cursor, DslError, Parser, Span, Written } from '../../grammar/parser';
import { AnySchema, HydrateContext, parseAnySection, printSection } from '../../grammar/section';
import { RawLine } from '../../grammar/structure';
import { id, number, oneOf, text } from '../../grammar/values';
import { DIRECTIONS, Direction } from '../hex';
import { getShape, Shape, SHAPES } from '../shapes';
import { PrintContext, schemaGrammar, section } from './define';
import { TITLE_FIELD } from './info';

const NON_ROOT_DIRECTIONS: readonly Direction[] = DIRECTIONS.filter((direction) => direction !== 'w');

export const DEFAULT_MOD_SLOTS = 2;

export interface ClusterJewel {
  id: string;
  title: string;
  examine?: string;
  shape: string;
  openConnections: string[];
  positions: [number, string][];
  modSlots: number;
}

export interface FilledPositions {
  positions: readonly (readonly [number, string])[];
}

export const passiveAt = (jewel: FilledPositions, position: number): string | undefined => jewel.positions.find(([at]) => at === position)?.[1];

const positionsFilled = (jewel: FilledPositions): number[] => jewel.positions.map(([at]) => at);

export const passivesCarried = (jewel: FilledPositions): string[] => jewel.positions.map(([, passive]) => passive);

export const positionValue: Parser<[number, string]> = {
  parse(cursor: Cursor) {
    const position = number.parse(cursor);
    cursor.take(/[ \t]+/);
    return [position, id.parse(cursor)];
  },
  print: ([position, passive]) => `${number.print(position)} ${id.print(passive)}`,
  lands: [{ how: 'ref', field: '1', names: 'passive' }],
  forms: ['<position> <passive>'],
  examples: ['0 keen-eye', '3 tough-hide'],
};

export function clusterJewelProblem(clusterJewel: ClusterJewel, shape: Shape): string | undefined {
  if (clusterJewel.openConnections.length === 0) return 'open-connections: needs at least one edge, or the plane never has anywhere left to grow';
  const seen = new Set<string>();
  for (const direction of clusterJewel.openConnections) {
    if (direction === 'w') return 'open-connections: names the west edge, which the root occupies';
    if (!(NON_ROOT_DIRECTIONS as readonly string[]).includes(direction)) return `open-connections: names an unknown direction: ${direction}`;
    if (seen.has(direction)) return `open-connections: names ${direction} more than once`;
    seen.add(direction);
  }

  const filled = new Set<number>();
  for (const position of positionsFilled(clusterJewel)) {
    if (position < 1 || position > shape.positionCount) return `passives: position ${position} is outside ${clusterJewel.shape}'s 1-${shape.positionCount} range`;
    if (filled.has(position)) return `position ${position} is filled twice`;
    filled.add(position);
  }
  return undefined;
}

const shapeNamed = oneOf(
  'shape',
  SHAPES.map((each) => each.name),
  { complaint: 'a shape' },
);

export const clusterJewel = section<ClusterJewel>()({
  kind: 'cluster-jewel',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'clusterJewels',
  text: ['title', 'examine'],
  fields: {
    title: TITLE_FIELD,
    examine: { parser: text },
    shape: { parser: shapeNamed, note: `how many positions it has, which is what \`positions:\` may name — ${SHAPES.map((each) => `${each.name} ${String(each.positionCount)}`).join(', ')}` },
    openConnections: {
      parser: list(id),
      default: () => [],
      keyword: 'open-connections',
      printed: 'always',
    },
    positions: {
      parser: list(positionValue),
      default: () => [],
      keyword: 'passives',
    },
    modSlots: {
      parser: number,
      default: () => DEFAULT_MOD_SLOTS,
      keyword: 'mod-slots',
      printed: 'unless-default',
    },
  },
  validate: (value) => {
    try {
      return clusterJewelProblem(value, getShape(value.shape));
    } catch (raw) {
      if (!(raw instanceof DslError)) throw raw;
      return raw.message;
    }
  },
});

const bodySchema = (): AnySchema => {
  const schema = clusterJewel.schema!;
  return { ...schema, fields: Object.fromEntries(Object.entries(schema.fields).filter(([name]) => !clusterJewel.text.includes(name))) };
};

const AS_A_BODY: PrintContext = { moduleId: '', id: '', authored: () => true };

const IS_THE_ITEMS = "is the item's, and a cluster-jewel written under one says what the item says";

const spanning = (lines: readonly RawLine[]): Span => ({ start: lines[0]!.span.start, end: lines[lines.length - 1]!.span.end });

function parseBody(lines: RawLine[]): object {
  const span = spanning(lines);
  const authored = parseAnySection({ kind: clusterJewel.kind, id: 'a-jewel-being-read', body: lines, span }, clusterJewel.schema!) as Record<string, unknown>;
  for (const field of clusterJewel.text) if (field in authored) throw new DslError(`${field}: ${IS_THE_ITEMS}: take the line out`, span);
  const { id: _read, ...body } = authored;
  return body;
}

export const jewelCarried = (body: object, carrier: { id: string }, context: HydrateContext): ClusterJewel =>
  clusterJewel.build({ ...Object.fromEntries(clusterJewel.text.map((field) => [field, (carrier as unknown as Record<string, unknown>)[field]])), ...body, id: carrier.id }, context);

export const carriedJewel: Parser<string> & {
  parseBlock(lines: RawLine[]): object;
  printBlock(bodies: readonly unknown[]): string[];
  lines(): readonly Written[];
} = {
  ...id,
  parseBlock: parseBody,
  printBlock: (bodies) => printSection(bodies[0] as object, bodySchema(), AS_A_BODY, () => []).slice(1),
  lines: () => schemaGrammar(bodySchema()),
};
