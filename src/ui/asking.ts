import { askedOption } from '../runtime/command';
import type { PlayView } from '../runtime/session';

// One decision about the question the engine is asking, taken off published
// fields alone: what leaving it answers. It reads no screen's name, so a screen
// this layer has never heard of is left by the same rule as one it has.

type Modal = PlayView['modals'][number];

export interface Answer {
  key: string;
  value: string;
}

// What a click away from a screen says: the value the screen publishes as the
// one that leaves it, against the question it is currently asking. Null where
// the screen publishes none, or where the question it is on does not offer it —
// there is nothing for the click to answer, so the screen stays (c19). It is
// only ever a value the option lists, which is what keeps the gesture the same
// answer a prompt types rather than a way out one driver has and the other has
// not (c11).
export function dismissal(modals: readonly Modal[]): Answer | null {
  const leaving = modals[modals.length - 1]?.leaving;
  const asking = askedOption(modals);
  if (!leaving || !asking?.values?.includes(leaving)) return null;
  return { key: asking.key, value: leaving };
}
