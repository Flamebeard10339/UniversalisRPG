import { literalOf, type Offer } from './completion';

export interface OfferGroup {
  head: string | null;
  opens: Offer | null;
  offers: readonly Offer[];
}

export interface OfferFamily {
  name: string | null;
  groups: readonly OfferGroup[];
}

// A keyword can only stand apart from the shapes it takes if a space stands between them; `+<percent>%` gathered under `+` would read as though a space belonged there, and it does not.
// An id stands under the module that declared it, which is the only thing a list of forty of them is ordered by that an author already knows.
export function headOf(offer: Offer): string {
  if (offer.kind !== undefined) return offer.module != null && offer.form.startsWith(`${offer.module}.`) ? offer.module : '';
  const head = literalOf(offer.form).trimEnd();
  if (head !== '' && (offer.form.length === head.length || offer.form[head.length] === ' ')) return head;
  // A shape that opens with a placeholder has no literal to gather under, and two of them that write the
  // same keyword are still one keyword: `<weight>[ if <condition>]:` is what the rows of a `one of:` share,
  // and gathering them under it is what lets the page say the row once with its shapes beside it.
  const colon = offer.form.indexOf(':');
  return colon === -1 || (colon + 1 < offer.form.length && offer.form[colon + 1] !== ' ') ? '' : offer.form.slice(0, colon + 1);
}

// A keyword gathers the shapes it takes wherever they were written, the way a part gathers its keywords.
function gather(offers: readonly Offer[]): OfferGroup[] {
  const held: { head: string; offers: Offer[] }[] = [];
  for (const offer of offers) {
    const head = headOf(offer);
    const last = head === '' ? undefined : held.find((group) => group.head === head);
    if (last !== undefined) last.offers.push(offer);
    else held.push({ head, offers: [offer] });
  }
  return held.map((group) => {
    if (group.offers.length < 2) return { head: null, opens: null, offers: group.offers };
    const opens = group.offers.find((offer) => offer.form === group.head) ?? null;
    return { head: group.head, opens, offers: group.offers.filter((offer) => offer !== opens) };
  });
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

// What is left of a form once its head has been said above it. A keyword is parted from its shapes by a space and a module from its ids by a dot, and neither belongs to what is left.
export const shownIn = (group: OfferGroup, offer: Offer): string =>
  group.head === null ? offer.form : offer.form.slice(group.head.length).replace(/^[.\s]+/, '');
