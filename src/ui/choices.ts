import type { PlayView } from '../runtime/session';

// The position the engine listed this choice at, kept because grouping moves
// the buttons and the shared table answers to the number, not to the button.
export interface Offer {
  id: string;
  label: string;
  position: number;
}

// What offers this, or nothing where the engine named no owner. The engine's
// own field, not a title this layer composed.
export interface OfferGroup {
  source: string | null;
  offers: Offer[];
}

export function groupOffers(choices: PlayView['choices']): OfferGroup[] {
  const groups: OfferGroup[] = [];
  choices.forEach((choice, at) => {
    const source = choice.detail ?? null;
    const offer = { id: choice.id, label: choice.label, position: at + 1 };
    const group = groups.find((each) => each.source === source);
    if (group) group.offers.push(offer);
    else groups.push({ source, offers: [offer] });
  });
  return groups;
}
