import { DslError, Parser } from './parser';

export interface Range {
  min: number;
  max: number;
}

export const point = (value: number): Range => ({ min: value, max: value });

export const isRange = (value: unknown): value is Range => {
  if (typeof value !== 'object' || value === null) return false;
  const { min, max } = value as { min?: unknown; max?: unknown };
  return typeof min === 'number' && Number.isFinite(min) && typeof max === 'number' && Number.isFinite(max) && min <= max;
};

export const isPoint = (range: Range): boolean => range.min === range.max;

export const addRanges = (a: Range, b: Range): Range => ({
  min: a.min + b.min,
  max: a.max + b.max,
});

export const scaleRange = (range: Range, factor: number): Range => ({
  min: Math.min(range.min * factor, range.max * factor),
  max: Math.max(range.min * factor, range.max * factor),
});

export const midpoint = (range: Range): number => (range.min + range.max) / 2;

export const sampleRange = (range: Range, roll: number): number => range.min + (range.max - range.min) * roll;

export const sampleCount = (range: Range, roll: number): number => Math.min(range.max, Math.floor(range.min + (range.max - range.min + 1) * roll));

const RANGE = /(?<lo>-?\d+(?:\.\d+)?)(?:-(?<hi>-?\d+(?:\.\d+)?))?/;

export const range: Parser<Range> = {
  parse(cursor) {
    const start = cursor.pos;
    const match = cursor.peek(RANGE);
    const span = {
      start: cursor.abs(start),
      end: cursor.abs(start + (match?.[0].length ?? 0)),
    };
    if (!match) throw new DslError('expected a number or a range like 4-7', span);
    cursor.pos += match[0].length;

    const min = Number(match.groups!.lo);
    if (match.groups!.hi === undefined) return point(min);
    const max = Number(match.groups!.hi);
    if (max < min) throw new DslError(`range upper bound must be at least its lower bound, got ${match[0]}`, span);
    return { min, max };
  },
  print: (value) => (isPoint(value) ? String(value.min) : `${value.min}-${value.max}`),
  examples: ['5', '4-7', '-3', '1.5', '0.5-2', '-3--1'],
};
