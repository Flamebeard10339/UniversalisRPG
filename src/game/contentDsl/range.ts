import { DslError, Parser } from './parser';

// A closed numeric interval. A point range (min === max) behaves exactly like
// the plain number it replaces; a genuine range is *stored* rather than
// collapsed at authoring time, and every use samples it uniformly — so `4-7`
// damage rolls fresh per hit instead of averaging to 5.5 forever.
export interface Range {
  min: number;
  max: number;
}

export const point = (value: number): Range => ({ min: value, max: value });

export const isPoint = (range: Range): boolean => range.min === range.max;

// Ranges from different sources are summed endpoint-wise and sampled ONCE, not
// sampled per source and then added: that keeps a stat's draw count at one
// regardless of how many buffs contribute (see sampleStat's RNG contract).
export const addRanges = (a: Range, b: Range): Range => ({ min: a.min + b.min, max: a.max + b.max });

// A negative factor flips the endpoints, so normalize rather than emit an
// inverted range.
export const scaleRange = (range: Range, factor: number): Range => ({
  min: Math.min(range.min * factor, range.max * factor),
  max: Math.max(range.min * factor, range.max * factor),
});

// Expected value — the deterministic summary for callers that need a number
// without consuming randomness.
export const midpoint = (range: Range): number => (range.min + range.max) / 2;

// `roll` is a uniform in [0, 1) supplied by the caller, which keeps this pure:
// the RNG and its draw-order contract stay in the resolver.
export const sampleRange = (range: Range, roll: number): number => range.min + (range.max - range.min) * roll;

const RANGE = /(?<lo>-?\d+(?:\.\d+)?)(?:-(?<hi>-?\d+(?:\.\d+)?))?/;

// `5` (a point) or `4-7` (an interval); both bounds may be negative or
// fractional, as in `-7--4`.
export const range: Parser<Range> = {
  parse(cursor) {
    const start = cursor.pos;
    const match = cursor.peek(RANGE);
    const span = { start: cursor.abs(start), end: cursor.abs(start + (match?.[0].length ?? 0)) };
    if (!match) throw new DslError('expected a number or a range like 4-7', span);
    cursor.pos += match[0].length;

    const min = Number(match.groups!.lo);
    if (match.groups!.hi === undefined) return point(min);
    const max = Number(match.groups!.hi);
    if (max < min) throw new DslError(`range upper bound must be at least its lower bound, got ${match[0]}`, span);
    return { min, max };
  },
};
