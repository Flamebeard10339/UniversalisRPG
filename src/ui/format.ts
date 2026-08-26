export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const pad = (value: number): string => String(value).padStart(2, '0');
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(whole % 60)}` : `${minutes}:${pad(whole % 60)}`;
}

export function fillPercent(current: number, max: number): number {
  return max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
}

export { signed, tidy } from '../runtime/figures';

// `×3` beside a bar is how a reader tells a fresh foe at full health from the one they were hitting
// healing itself back up. A numeral reads the same in every language a pool line is written in, so
// it rides beside the meter rather than through the localizer.
export function remainingBadge(remaining: number | null): string | null {
  return remaining === null ? null : `×${remaining}`;
}
