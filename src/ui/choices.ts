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
