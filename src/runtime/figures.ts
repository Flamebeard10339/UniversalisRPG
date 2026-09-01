import type { Range } from '../grammar/range';

export function tidy(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function signed(value: number): string {
  return value < 0 ? tidy(value) : `+${tidy(value)}`;
}

export function amounts(added: Range, increased: number): string[] {
  const said: string[] = [];
  if (added.min !== 0 || added.max !== 0) said.push(added.min === added.max ? signed(added.min) : `${signed(added.min)}-${tidy(added.max)}`);
  if (increased !== 0) said.push(`${signed(increased)}%`);
  return said;
}
