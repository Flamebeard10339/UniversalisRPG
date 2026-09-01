import type { Transcript } from './transcript';

export function startedAt(before: Transcript, after: Transcript): number | null {
  const minted = after.entries.find((entry) => entry.id >= before.nextId);
  if (minted) return minted.id;

  const last = after.entries[after.entries.length - 1];
  const held = before.entries[before.entries.length - 1];
  if (last === undefined || held === undefined || last.id !== held.id) return null;
  return last.repeats > held.repeats ? last.id : null;
}

export const restingAt = (anchorTop: number, scrollHeight: number, clientHeight: number): number => Math.max(0, Math.min(anchorTop, scrollHeight - clientHeight));
