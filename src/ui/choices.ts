import { EXAMINE_FIELD } from '../content/sections/entity';
import { parseUseChoiceId } from '../content/sections/test';
import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

export interface Offer {
  id: Answer;
  label: Localized;
  position: number;
}

export interface OfferGroup {
  source: Localized | null;
  offers: Offer[];
}

// One box on the sheet. What one object offers is one cell under that object's name; what nothing
// in particular offers is a cell each, so a travel and a talk are the same size as everything else
// rather than a row of their own. `examine` is what the cell itself does — its name and the ground
// under it read the thing — which is why it is not among the controls drawn on it.
export interface OfferCell {
  name: Localized | null;
  examine: Offer | null;
  offers: Offer[];
}

const reads = (offer: Offer): boolean => parseUseChoiceId(String(offer.id))?.actionId === EXAMINE_FIELD;

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

export function offerCells(choices: PlayView['choices']): OfferCell[] {
  return groupOffers(choices).flatMap((group): OfferCell[] => {
    if (group.source === null) return group.offers.map((offer) => ({ name: null, examine: null, offers: [offer] }));
    const examine = group.offers.find(reads) ?? null;
    return [{ name: group.source, examine, offers: group.offers.filter((offer) => offer !== examine) }];
  });
}
