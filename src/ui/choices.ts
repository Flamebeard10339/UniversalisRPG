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

export interface OfferCell {
  of: Answer | null;
  name: Localized | null;
  group?: GroupRow;
  examine: Offer | null;
  offers: Offer[];
}

const reads = (offer: Offer): boolean => parseUseChoiceId(String(offer.id))?.actionId === EXAMINE_FIELD;

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

export const drawsNothing = (choices: readonly OfferedChoice[]): boolean => offerCells(choices).length === 0;

export function offerCells(choices: readonly OfferedChoice[]): OfferCell[] {
  return groupOffers(choices).flatMap((group): OfferCell[] => {
    const fill = group.group === undefined ? {} : { group: group.group };
    if (group.of === null) return group.offers.map((offer) => ({ of: null, name: null, ...fill, examine: null, offers: [offer] }));
    const examine = group.offers.find(reads) ?? null;
    return [{ of: group.of, name: group.source, ...fill, examine, offers: group.offers.filter((offer) => offer !== examine) }];
  });
}
