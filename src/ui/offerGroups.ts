import { literalOf, type Offer } from '../content/completion';

export interface OfferGroup {
  head: string | null;
  offers: readonly Offer[];
}

export interface OfferFamily {
  name: string | null;
  groups: readonly OfferGroup[];
}

export const AS_A_BLOCK = 'then an indented block';

const headOf = (offer: Offer): string => (offer.kind === undefined ? literalOf(offer.form).trimEnd() : '');

function gather(offers: readonly Offer[]): OfferGroup[] {
  const held: { head: string; offers: Offer[] }[] = [];
  for (const offer of offers) {
    const head = headOf(offer);
    const last = held[held.length - 1];
    if (head !== '' && last !== undefined && last.head === head) last.offers.push(offer);
    else held.push({ head, offers: [offer] });
  }
  return held.map((group) => ({ head: group.offers.length > 1 ? group.head : null, offers: group.offers }));
}

export function gathered(offers: readonly Offer[]): OfferFamily[] {
  const held = new Map<string, { name: string | null; offers: Offer[] }>();
  for (const offer of offers) {
    const name = offer.family ?? offer.kind ?? null;
    const family = held.get(name ?? '') ?? { name, offers: [] };
    family.offers.push(offer);
    held.set(name ?? '', family);
  }
  return [...held.values()].map((family) => ({ name: family.name, groups: gather(family.offers) }));
}

export const shownIn = (group: OfferGroup, offer: Offer): string => (group.head === null ? offer.form : offer.form.slice(group.head.length).trimStart() || AS_A_BLOCK);
