import { askedOption } from '../runtime/command';
import type { PlayView } from '../runtime/session';

// Two decisions about the question the engine is asking, both taken off
// published fields alone: what leaving it answers, and where on this driver it
// is drawn. Neither reads a screen's name, so a screen this layer has never
// heard of is dismissed and placed by the same rules as one it has.

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

// Which row the question belongs to, and null for a question that belongs to no
// row. A page that opened one of its own rows is being asked about that row, so
// the answers go under it and the verbs an entry offers are reached from the
// entry (c20). A screen holding a subject of its own is more than a row can
// carry and is drawn over everything instead — which is read off the published
// focus, never off which screen it is.
export function askedOfRow(view: PlayView | null, opened: string | null): string | null {
  if (!view || view.focus !== null || !askedOption(view.modals)) return null;
  return view.carried.some((row) => row.id === opened) ? opened : null;
}
