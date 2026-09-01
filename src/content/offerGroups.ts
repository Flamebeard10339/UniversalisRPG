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

export function headOf(offer: Offer): string {
  if (offer.kind !== undefined) return offer.module != null && offer.form.startsWith(`${offer.module}.`) ? offer.module : '';
  const head = literalOf(offer.form).trimEnd();
  return offer.form.length === head.length || offer.form[head.length] === ' ' ? head : '';
}

function candidates(form: string): string[] {
  const out: string[] = [];
  for (let at = form.length - 1; at > 0; at--) if (form[at] === ' ') out.push(form.slice(0, at));
  return out;
}

function gather(offers: readonly Offer[]): OfferGroup[] {
  const held: { head: string; offers: Offer[] }[] = [];
  const counted = new Map<string, number>();
  for (const offer of offers) {
    if (offer.kind !== undefined) continue;
    for (const each of new Set(candidates(offer.form))) counted.set(each, (counted.get(each) ?? 0) + 1);
  }
  const usable = (head: string, form: string): boolean => !form.slice(head.length).includes(':');
  const gatheredUnder = (offer: Offer): string =>
    offer.kind !== undefined ? headOf(offer) : ([offer.form, ...candidates(offer.form)].find((each) => (counted.get(each) ?? 0) > 1 && usable(each, offer.form)) ?? headOf(offer));
  for (const offer of offers) {
    const head = gatheredUnder(offer);
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

export const shownIn = (group: OfferGroup, offer: Offer): string =>
  group.head === null ? offer.form : offer.form.slice(group.head.length).replace(/^[.\s]+/, '');
