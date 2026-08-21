import { literalOf, type Offer } from '../content/completion';

export interface OfferGroup {
  head: string | null;
  offers: readonly Offer[];
}

const headOf = (offer: Offer): string => (offer.kind === undefined ? literalOf(offer.form).trimEnd() : '');

export function grouped(offers: readonly Offer[]): OfferGroup[] {
  const held: { head: string; offers: Offer[] }[] = [];
  for (const offer of offers) {
    const head = headOf(offer);
    const last = held[held.length - 1];
    if (head !== '' && last !== undefined && last.head === head) last.offers.push(offer);
    else held.push({ head, offers: [offer] });
  }
  return held.map((group) => ({ head: group.offers.length > 1 ? group.head : null, offers: group.offers }));
}

export const shownIn = (group: OfferGroup, offer: Offer): string => (group.head === null ? offer.form : offer.form.slice(group.head.length).trimStart() || '(on its own)');
