import { askedOption } from '../runtime/command';
import type { PlayView } from '../runtime/session';
import type { LogEntry } from './transcript';

type Modal = PlayView['modals'][number];
type Option = Modal['options'][number];

export interface Answer {
  key: string;
  value: string;
}

export function dismissal(modals: readonly Modal[]): Answer | null {
  const leaving = modals[modals.length - 1]?.leaving;
  const asking = askedOption(modals);
  if (!leaving || !asking?.values?.some((choice) => choice.value === leaving)) return null;
  return { key: asking.key, value: leaving };
}

// A question whose only answer is the one that leaves is not a question: what the
// screen is showing is the whole of it, and clicking away is what there is to do.
export const onlyLeaves = (option: Option, leaving: string | undefined): boolean => leaving !== undefined && option.values?.length === 1 && option.values[0].value === leaving;

// What a screen that darkens everything behind it is answering. A scrim takes the words away at
// exactly the moment they are needed, so the lines just spoken come into the sheet with the choices
// that answer them. The run stops at the first line that is not somebody speaking, which is what
// makes it this beat rather than the whole history.
export function answering(entries: readonly LogEntry[]): readonly LogEntry[] {
  let at = entries.length;
  while (at > 0 && entries[at - 1]!.kind === 'said') at -= 1;
  return entries.slice(at);
}

// The same judgement made of a view, for anyone holding one rather than the two things the sheet is
// handed. True is the moment the app draws a screen with no question written above it.
export function asksNothing(modals: readonly Modal[]): boolean {
  const asking = askedOption(modals);
  return asking !== undefined && onlyLeaves(asking, dismissal(modals)?.value);
}
