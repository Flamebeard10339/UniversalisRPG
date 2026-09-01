import { fillingWords, type Offering } from '../content/completion';
import { gathered } from '../content/offerGroups';

const lineTo = (text: string, cursor: number): string => text.slice(text.lastIndexOf('\n', cursor - 1) + 1, cursor).trim();

const shapesIn = (offering: Offering): number =>
  gathered(offering.offers.filter((each) => each.kind === undefined)).reduce((sum, family) => sum + family.groups.length, 0);

export function pathOf(offering: Offering, text: string, cursor: number, starting: (shapes: number) => string): string[] {
  const shape = offering.reads ?? offering.filling?.form ?? null;
  if (shape === null) {
    const written = lineTo(text, cursor);
    const shapes = shapesIn(offering);
    if (written === '') return [...offering.where];
    return [...offering.where, shapes > 1 ? `${written} … ${starting(shapes)}` : `${written} …`];
  }
  return [...offering.where, shape, ...(offering.filling === null ? [] : [fillingWords(offering.filling)])];
}
