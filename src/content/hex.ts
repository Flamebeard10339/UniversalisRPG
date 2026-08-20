export const DIRECTIONS = ['e', 'ne', 'nw', 'w', 'sw', 'se'] as const;
export type Direction = (typeof DIRECTIONS)[number];

const SIXTHS_PER_TURN = DIRECTIONS.length;
const SIXTHS_PER_HALF_TURN = SIXTHS_PER_TURN / 2;

export interface Hex {
  readonly q: number;
  readonly r: number;
}

export const NEIGHBOR_DELTA: Readonly<Record<Direction, Hex>> = {
  e: { q: 1, r: 0 },
  ne: { q: 1, r: -1 },
  nw: { q: 0, r: -1 },
  w: { q: -1, r: 0 },
  sw: { q: -1, r: 1 },
  se: { q: 0, r: 1 },
};

export function opposite(direction: Direction): Direction {
  const i = DIRECTIONS.indexOf(direction);
  return DIRECTIONS[(i + SIXTHS_PER_HALF_TURN) % SIXTHS_PER_TURN];
}

export function rotate(direction: Direction, steps: number): Direction {
  const i = DIRECTIONS.indexOf(direction);
  const normalized = ((steps % SIXTHS_PER_TURN) + SIXTHS_PER_TURN) % SIXTHS_PER_TURN;
  return DIRECTIONS[(i + normalized) % SIXTHS_PER_TURN];
}

export function rotationOnto(from: Direction, to: Direction): number {
  const i = DIRECTIONS.indexOf(from);
  const j = DIRECTIONS.indexOf(to);
  return (((j - i) % SIXTHS_PER_TURN) + SIXTHS_PER_TURN) % SIXTHS_PER_TURN;
}

export type PlaneNode = { readonly hex: Hex; readonly kind: 'position'; readonly position: number } | { readonly hex: Hex; readonly kind: 'slot'; readonly direction: Direction };

export const hexKey = (hex: Hex): string => `${hex.q},${hex.r}`;

const HEX_KEY = /^(-?\d+),(-?\d+)$/;

export function parseHexKey(key: string): Hex | undefined {
  const parts = HEX_KEY.exec(key);
  if (!parts) return undefined;
  const hex = { q: Number(parts[1]), r: Number(parts[2]) };
  return hexKey(hex) === key ? hex : undefined;
}
