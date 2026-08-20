// Axial-coordinate vocabulary for a pointy-top hex plane, per c8. Six
// directions carry constant neighbour deltas, so the plane needs no
// odd/even row case. The order below is the cycle rotation walks around:
// index i and i+3 (mod 6) are always opposite.
export const DIRECTIONS = ["e", "ne", "nw", "w", "sw", "se"] as const;
export type Direction = (typeof DIRECTIONS)[number];

// A place on the plane, and — the same pair read as a vector — the step from
// one place to the neighbour on a direction.
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
  return DIRECTIONS[(i + 3) % 6];
}

// `direction` rotated by `steps` sixths of a turn, wrapping either way.
export function rotate(direction: Direction, steps: number): Direction {
  const i = DIRECTIONS.indexOf(direction);
  const normalized = ((steps % 6) + 6) % 6;
  return DIRECTIONS[(i + normalized) % 6];
}

// The number of sixths that carries `from` onto `to` — c7's rotation rule,
// stated as pure geometry so the runtime need only look up the slot's
// direction and call it.
export function rotationOnto(from: Direction, to: Direction): number {
  const i = DIRECTIONS.indexOf(from);
  const j = DIRECTIONS.indexOf(to);
  return (((j - i) % 6) + 6) % 6;
}

// The two things a point may be spent on, and the two things adjacency runs
// between: a numbered position of the cluster standing in a hex, or a jewel
// slot on one of that hex's edges.
export type PlaneNode =
  | { readonly hex: Hex; readonly kind: "position"; readonly position: number }
  | { readonly hex: Hex; readonly kind: "slot"; readonly direction: Direction };

export const hexKey = (hex: Hex): string => `${hex.q},${hex.r}`;

const HEX_KEY = /^(-?\d+),(-?\d+)$/;

// The inverse of `hexKey` and nothing looser: a spelling this rejects is one
// `hexKey` would never have written, so a plane's keys and an authored address
// are the same alphabet whichever end they arrive from.
export function parseHexKey(key: string): Hex | undefined {
  const parts = HEX_KEY.exec(key);
  if (!parts) return undefined;
  const hex = { q: Number(parts[1]), r: Number(parts[2]) };
  return hexKey(hex) === key ? hex : undefined;
}
