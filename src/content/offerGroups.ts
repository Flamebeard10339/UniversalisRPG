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
  return offer.form.length === head.length || offer.form[head.length] === ' ' ? head : '';
}

// Every prefix of a shape that stops short of it and ends where a word does, longest first. What two
// shapes have in common is a keyword written twice, wherever in the line it falls and whether or not it
// is what the line opens with. A shape counts only what it writes *before* its last word, so a shape
// that is the whole of another's opening is not swallowed by it: `<flag>` is a condition on its own as
// well as the start of `<flag> <comparison> <number>`, and the page has to say so.
function candidates(form: string): string[] {
  const out: string[] = [];
  for (let at = form.length - 1; at > 0; at--) if (form[at] === ' ') out.push(form.slice(0, at));
  return out;
}

// A keyword gathers the shapes it takes wherever they were written, the way a part gathers its keywords.
function gather(offers: readonly Offer[]): OfferGroup[] {
  const held: { head: string; offers: Offer[] }[] = [];
  // What more than one shape here writes. A keyword only one of them writes is no keyword to gather
  // under, so what is left is what the shapes have in common and nothing that merely looks like it.
  const counted = new Map<string, number>();
  for (const offer of offers) {
    if (offer.kind !== undefined) continue;
    for (const each of new Set(candidates(offer.form))) counted.set(each, (counted.get(each) ?? 0) + 1);
  }
  // A head has to be the whole of a keyword and not a word inside one. `on hit:` and `on success:` both
  // open with `on`, and gathering them under it would put two keywords on one line as though they were
  // two ways of writing one; what says so is the `:` left over, which no shape of one keyword carries.
  const usable = (head: string, form: string): boolean => !form.slice(head.length).includes(':');
  // A shape whose whole form is what others open with is the keyword they gather under, and opens the group.
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

// What is left of a form once its head has been said above it. A keyword is parted from its shapes by a space and a module from its ids by a dot, and neither belongs to what is left.
export const shownIn = (group: OfferGroup, offer: Offer): string =>
  group.head === null ? offer.form : offer.form.slice(group.head.length).replace(/^[.\s]+/, '');
