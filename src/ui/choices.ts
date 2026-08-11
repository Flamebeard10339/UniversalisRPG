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

// Somewhere the engine says is more than one road away. It is on the table and
// it is not on this table: the sheet is what the room offers, and a place a
// walk away is offered by the map, which is where a player picks it out.
const aWalkAway = (choice: PlayView['choices'][number]): boolean => choice.legs !== undefined && choice.legs > 1;

export function groupOffers(choices: PlayView['choices']): OfferGroup[] {
  const groups: OfferGroup[] = [];
  choices.forEach((choice, at) => {
    if (aWalkAway(choice)) return;
    const source = choice.detail ?? null;
    const offer = { id: choice.id, label: choice.label, position: at + 1 };
    const group = groups.find((each) => each.source === source);
    if (group) group.offers.push(offer);
    else groups.push({ source, offers: [offer] });
  });
  return groups;
}
