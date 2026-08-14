// Simulated seconds as a clock face. Numbers only: a unit word would be this
// layer's prose, and the engine publishes no unit.
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

export function tidy(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// Ids arrive namespaced and every surface spells the short name, so a stat is
// read the way the verbs and the DSL write it.
export function bare(id: string): string {
  return id.split('.').pop() ?? id;
}

// A bonus reads as what it does to the number it lands on, so the sign is
// always there and a gain is not left to look like a total.
export function signed(value: number): string {
  return value < 0 ? tidy(value) : `+${tidy(value)}`;
}
