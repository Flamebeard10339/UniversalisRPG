import { askedOption } from '../runtime/command';
import type { PlayView } from '../runtime/session';

type Modal = PlayView['modals'][number];
type Option = Modal['options'][number];

export interface Answer {
  key: string;
  value: string;
}

export function dismissal(modals: readonly Modal[]): Answer | null {
  const leaving = modals[modals.length - 1]?.leaving;
  const asking = askedOption(modals);
  if (!leaving || !asking) return null;
  if (asking.values !== null && !asking.values.some((choice) => choice.value === leaving)) return null;
  return { key: asking.key, value: leaving };
}

export const onlyLeaves = (option: Option, leaving: string | undefined): boolean => leaving !== undefined && option.values?.length === 1 && option.values[0].value === leaving;

export function asksNothing(modals: readonly Modal[]): boolean {
  const asking = askedOption(modals);
  return asking !== undefined && onlyLeaves(asking, dismissal(modals)?.value);
}
