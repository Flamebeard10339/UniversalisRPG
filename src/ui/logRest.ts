import type { Transcript } from './transcript';

// Which line a turn began at, which is the line a reader wants to be looking at when it is over.
// A turn that only said again what was already the last line began at that line: being told
// something twice is still this turn's answer, and the transcript records it by counting rather
// than by minting. A turn that wrote nothing at all began nowhere and moves the log nowhere.
export function startedAt(before: Transcript, after: Transcript): number | null {
  const minted = after.entries.find((entry) => entry.id >= before.nextId);
  if (minted) return minted.id;

  const last = after.entries[after.entries.length - 1];
  const held = before.entries[before.entries.length - 1];
  if (last === undefined || held === undefined || last.id !== held.id) return null;
  return last.repeats > held.repeats ? last.id : null;
}

// Where the log comes to rest: the turn's first line at the top of the column, but never scrolled
// past the end of what there is. A turn shorter than the column therefore rests at the bottom,
// which is the reading a scrollback has always had; only a turn long enough to push its own opening
// off the screen moves anywhere else.
export const restingAt = (anchorTop: number, scrollHeight: number, clientHeight: number): number => Math.max(0, Math.min(anchorTop, scrollHeight - clientHeight));
