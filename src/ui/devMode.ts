import { devTokenIn } from '../runtime/command';

export const devLine = (on: boolean): string => `/dev ${on ? 'on' : 'off'}`;

export const speedLine = (typed: string): string => `/speed ${typed}`;

export function tappedPlace(dev: boolean, place: string, goes: number | null): string | null {
  if (dev) return `/goto ${place}`;
  return goes === null ? null : String(goes);
}

export function devRefusal(line: string, dev: boolean): string | null {
  if (dev) return null;
  const token = devTokenIn(line);
  return token === undefined ? null : `${token} is a dev power, and this session is the player's: turn dev mode on to reach it.`;
}

export const RATES = [1, 2, 8, 64] as const;
