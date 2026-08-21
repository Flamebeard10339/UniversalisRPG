import { fillingWords, type Offering } from '../content/completion';
import { gathered } from './offerGroups';

const lineTo = (text: string, cursor: number): string => text.slice(text.lastIndexOf('\n', cursor - 1) + 1, cursor).trim();

// How many lines the page will draw for the shapes still open: an id carries the kind it is one of and is not one of them, and shapes gathered under one keyword are drawn as one.
const shapesIn = (offering: Offering): number =>
  gathered(offering.offers.filter((each) => each.kind === undefined)).reduce((sum, family) => sum + family.groups.length, 0);

// The path from the section down to where the cursor stands: the blocks the line sits in, the shape the engine reads that line as, and the hole in it the cursor is in. Each step says what kind of line it is rather than which one, because which one is written on the other side of the pane.
export function pathOf(offering: Offering, text: string, cursor: number, starting: (shapes: number) => string): string[] {
  const shape = offering.reads ?? offering.filling?.form ?? null;
  // A line the engine reads as no shape yet is as far as the path goes. What is written and how many shapes still begin that way is everything there is to say about it, and the shapes themselves are named below.
  if (shape === null) {
    const written = lineTo(text, cursor);
    const shapes = shapesIn(offering);
    if (written === '') return [...offering.where];
    return [...offering.where, shapes > 1 ? `${written} … ${starting(shapes)}` : `${written} …`];
  }
  return [...offering.where, shape, ...(offering.filling === null ? [] : [fillingWords(offering.filling)])];
}
