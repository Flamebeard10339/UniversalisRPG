export const MILLI_UNITS = 1000;
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;

export function toMilliUnits(value: number): number {
  return Math.round(value * MILLI_UNITS);
}

export function fromMilliUnits(value: number): number {
  return value / MILLI_UNITS;
}

export function secondsToMs(seconds: number): number {
  return Math.round(seconds * MS_PER_SECOND);
}

export function msToSeconds(ms: number): number {
  return ms / MS_PER_SECOND;
}

// Floor, not truncate: it is what keeps the remainder in [0, MS_PER_MINUTE) and
// so makes the split of a span unobservable even where the rate changes sign.
export function divideRateRemainder(acc: number): { units: number; remainder: number } {
  const units = Math.floor(acc / MS_PER_MINUTE);
  return { units, remainder: acc - units * MS_PER_MINUTE };
}

// The instant a pool draining at `rateMilliPerMinute` reaches zero, as the
// smallest dt for which divideRateRemainder takes `current` to 0 or below.
export function msUntilEmpty(current: number, rateMilliPerMinute: number, remainder: number): number {
  return Math.ceil((MS_PER_MINUTE * (1 - current) - 1 - remainder) / rateMilliPerMinute);
}
