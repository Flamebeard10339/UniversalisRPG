import type { Range } from '../grammar/range';

// The figures a player reads, wherever one is read. They live under the engine and not under a
// surface because a terminal and a screen showing the same number differently is the same fault as
// showing different numbers.

export function tidy(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function signed(value: number): string {
  return value < 0 ? tidy(value) : `+${tidy(value)}`;
}

// How much a bonus is worth, in the two channels a bonus lands on and in the words every sheet reads
// them in. A channel that moves nothing says nothing, so a bonus on one channel reads as one figure
// rather than as a figure and a zero.
export function amounts(added: Range, increased: number): string[] {
  const said: string[] = [];
  if (added.min !== 0 || added.max !== 0) said.push(added.min === added.max ? signed(added.min) : `${signed(added.min)}-${tidy(added.max)}`);
  if (increased !== 0) said.push(`${signed(increased)}%`);
  return said;
}
