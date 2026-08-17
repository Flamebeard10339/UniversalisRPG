import { devTokenIn } from '../runtime/command';

// Every dev power the shell reaches for, as the line the shared table parses.
// Nothing here touches a session: the table decides what a command does, so the
// guarantee an author gets from a screen is byte-for-byte the one the REPL gets
// and neither driver reaches a power the other has not got (c7, c8).

export const devLine = (on: boolean): string => `/dev ${on ? 'on' : 'off'}`;

export const speedLine = (multiplier: number): string => `/speed ${multiplier}`;

// The one decision a tap on a place makes (c9). With dev off it is the choice
// the engine published for setting off — arrival delay and all — and with dev
// on it is that walk taken out. Nothing where neither stands: a place with no
// way out to it, tapped from a session that is the player's.
export function tappedPlace(dev: boolean, place: string, goes: number | null): string | null {
  if (dev) return `/goto ${place}`;
  return goes === null ? null : String(goes);
}

// What the shell says instead of running a dev-only line while the session is
// the player's. The set is read off the command table's own marks, so the tenth
// dev power is refused here the day it is marked rather than the day somebody
// remembers to widen a list (c11).
export function devRefusal(line: string, dev: boolean): string | null {
  if (dev) return null;
  const token = devTokenIn(line);
  return token === undefined ? null : `${token} is a dev power, and this session is the player's: turn dev mode on to reach it.`;
}
