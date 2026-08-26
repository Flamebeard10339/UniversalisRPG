import { askedOption } from '../runtime/command';
import type { PlayView } from '../runtime/session';

type Modal = PlayView['modals'][number];
type Option = Modal['options'][number];

export interface Answer {
  key: string;
  value: string;
}

// A screen is left by answering the question it is asking with the value it says it leaves by, so a
// question that is not offering that value cannot be left that way. A screen taking free text offers
// nothing and takes anything: there is no list for the word to be missing from, and the screen's own
// submit is what makes sense of it — which is the only way out a typed question has.
export function dismissal(modals: readonly Modal[]): Answer | null {
  const leaving = modals[modals.length - 1]?.leaving;
  const asking = askedOption(modals);
  if (!leaving || !asking) return null;
  if (asking.values !== null && !asking.values.some((choice) => choice.value === leaving)) return null;
  return { key: asking.key, value: leaving };
}

// A question whose only answer is the one that leaves is not a question: what the
// screen is showing is the whole of it, and clicking away is what there is to do.
export const onlyLeaves = (option: Option, leaving: string | undefined): boolean => leaving !== undefined && option.values?.length === 1 && option.values[0].value === leaving;

// The same judgement made of a view, for anyone holding one rather than the two things the sheet is
// handed. True is the moment the app draws a screen with no question written above it.
export function asksNothing(modals: readonly Modal[]): boolean {
  const asking = askedOption(modals);
  return asking !== undefined && onlyLeaves(asking, dismissal(modals)?.value);
}
