import { EXAMINE_FIELD } from '../content/sections/entity';
import { parseUseChoiceId } from '../content/sections/test';
import type { Answer, Localized } from '../runtime/localized';
import type { GroupRow, OfferedChoice } from '../runtime/session';

export interface Offer {
  id: Answer;
  label: Localized;
  position: number;
}

export interface OfferGroup {
  of: Answer | null;
  source: Localized | null;
  group?: GroupRow;
  offers: Offer[];
}

// One box on the sheet. What one object offers is one cell under that object's name; what nothing
// in particular offers is a cell each, so a travel and a talk are the same size as everything else
// rather than a row of their own. `examine` is what the cell itself does — its name and the ground
// under it read the thing — which is why it is not among the controls drawn on it.
export interface OfferCell {
  of: Answer | null;
  name: Localized | null;
  group?: GroupRow;
  examine: Offer | null;
  offers: Offer[];
}

const reads = (offer: Offer): boolean => parseUseChoiceId(String(offer.id))?.actionId === EXAMINE_FIELD;

// Keyed by the address the view states rather than by the name it draws, because everything the
// player has not read is drawn under the same placeholder and two unread things are still two.
export function groupOffers(choices: readonly OfferedChoice[]): OfferGroup[] {
  const groups: OfferGroup[] = [];
  for (const choice of choices) {
    const of = choice.of ?? null;
    const offer = { id: choice.id, label: choice.label, position: choice.position };
    const held = groups.find((each) => each.of === of);
    if (held) held.offers.push(offer);
    else groups.push({ of, source: choice.detail ?? null, ...(choice.group === undefined ? {} : { group: choice.group }), offers: [offer] });
  }
  return groups;
}

// A panel with no cells in it reads as the game having broken rather than as a quiet room, so the
// sheet says so in words. Asked of what would be drawn rather than of the view's own list, because
// what reaches a cell is `offerCells`'s judgement and not the caller's.
export const drawsNothing = (choices: readonly OfferedChoice[]): boolean => offerCells(choices).length === 0;

export function offerCells(choices: readonly OfferedChoice[]): OfferCell[] {
  return groupOffers(choices).flatMap((group): OfferCell[] => {
    const fill = group.group === undefined ? {} : { group: group.group };
    if (group.of === null) return group.offers.map((offer) => ({ of: null, name: null, ...fill, examine: null, offers: [offer] }));
    const examine = group.offers.find(reads) ?? null;
    return [{ of: group.of, name: group.source, ...fill, examine, offers: group.offers.filter((offer) => offer !== examine) }];
  });
}
