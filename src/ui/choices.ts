import { EXAMINE_FIELD } from '../content/sections/entity';
import { parseUseChoiceId } from '../content/sections/test';
import type { Answer, Localized } from '../runtime/localized';
import type { GroupRow, PlayView } from '../runtime/session';
import { onActionList } from '../runtime/waysOut';

export interface Offer {
  id: Answer;
  label: Localized;
  position: number;
}

export interface OfferGroup {
  source: Localized | null;
  group?: GroupRow;
  offers: Offer[];
}

// One box on the sheet. What one object offers is one cell under that object's name; what nothing
// in particular offers is a cell each, so a travel and a talk are the same size as everything else
// rather than a row of their own. `examine` is what the cell itself does — its name and the ground
// under it read the thing — which is why it is not among the controls drawn on it.
export interface OfferCell {
  name: Localized | null;
  group?: GroupRow;
  examine: Offer | null;
  offers: Offer[];
}

const reads = (offer: Offer): boolean => parseUseChoiceId(String(offer.id))?.actionId === EXAMINE_FIELD;

export function groupOffers(choices: PlayView['choices']): OfferGroup[] {
  const groups: OfferGroup[] = [];
  choices.forEach((choice, at) => {
    if (!onActionList(choice)) return;
    const source = choice.detail ?? null;
    const offer = { id: choice.id, label: choice.label, position: at + 1 };
    const held = groups.find((each) => each.source === source);
    if (held) held.offers.push(offer);
    else groups.push({ source, ...(choice.group === undefined ? {} : { group: choice.group }), offers: [offer] });
  });
  return groups;
}

export function offerCells(choices: PlayView['choices']): OfferCell[] {
  return groupOffers(choices).flatMap((group): OfferCell[] => {
    const fill = group.group === undefined ? {} : { group: group.group };
    if (group.source === null) return group.offers.map((offer) => ({ name: null, ...fill, examine: null, offers: [offer] }));
    const examine = group.offers.find(reads) ?? null;
    return [{ name: group.source, ...fill, examine, offers: group.offers.filter((offer) => offer !== examine) }];
  });
}
