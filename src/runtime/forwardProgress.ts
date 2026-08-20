import { RuntimeError } from './error';

export type BoundarySource =
  | { kind: 'requested' }
  | { kind: 'buff'; actorId: string; source: string }
  | { kind: 'action'; ownerRef: string; actionSlug: string }
  | { kind: 'resource'; resourceId: string };

export interface Boundary {
  at: number;
  source: BoundarySource;
}

export const STALL_BOUND = 8;

export function boundarySourceName(source: BoundarySource): string {
  switch (source.kind) {
    case 'requested':
      return 'the requested time';
    case 'buff':
      return `buff ${source.source} on ${source.actorId}`;
    case 'action':
      return `action ${source.ownerRef}.${source.actionSlug}`;
    case 'resource':
      return `resource ${source.resourceId}`;
    default: {
      const unreached: never = source;
      return unreached;
    }
  }
}

export function requireBoundaryNotPast(boundary: Boundary, now: number): void {
  if (boundary.at < now) {
    throw new RuntimeError(`resolve: ${boundarySourceName(boundary.source)} put a boundary at ${boundary.at}, before the current instant ${now}`);
  }
}

export function requireForwardProgress(boundary: Boundary, before: number, after: number, consecutiveStalls: number): number {
  if (after > before) return 0;
  const stalls = consecutiveStalls + 1;
  if (stalls > STALL_BOUND) {
    throw new RuntimeError(`resolve: ${boundarySourceName(boundary.source)} held time at ${before} for ${stalls} consecutive segments without advancing it`);
  }
  return stalls;
}
