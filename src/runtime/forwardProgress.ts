import { RuntimeError } from './state';

export interface Boundary {
  at: number;
  source: string;
}

export const STALL_BOUND = 8;

export function requireBoundaryNotPast(boundary: Boundary, now: number): void {
  if (boundary.at < now) {
    throw new RuntimeError(`resolve: ${boundary.source} put a boundary at ${boundary.at}, before the current instant ${now}`);
  }
}

export function requireForwardProgress(boundary: Boundary, before: number, after: number, consecutiveStalls: number): number {
  if (after > before) return 0;
  const stalls = consecutiveStalls + 1;
  if (stalls > STALL_BOUND) {
    throw new RuntimeError(`resolve: ${boundary.source} held time at ${before} for ${stalls} consecutive segments without advancing it`);
  }
  return stalls;
}
