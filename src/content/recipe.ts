import { list } from '../grammar/list';
import { Parser } from '../grammar/parser';
import { SectionSchema } from '../grammar/section';
import { decimal, id, number, numberOrStat, produced, Produced, Quantified, quantified, text } from '../grammar/values';

export interface Recipe {
  id: string;
  requiresCapability?: string; // absent means craftable anywhere
  in: Quantified[];
  // Produced, so a fletching craft can yield 5-10 arrows; `in` is consumed and
  // stays a count, because `inputLimit` must be able to divide by it.
  out: Produced[];
  skill?: { skill: string; amount: number };
  say?: string;
  // The compiled craft's cadence, the same one axis an action carries: absent
  // compiles to an instant craft, either of these to a spannable one.
  time?: number;
  rate?: number | string;
  accuracy?: string;
  // Contested against `accuracy:`, the same field a rat's dodge uses.
  evasion?: string;
  burnt: Produced[];
}

export const recipeSkillValue: Parser<{ skill: string; amount: number }> = {
  parse(cursor) {
    const skill = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return { skill, amount: number.parse(cursor) };
  },
  print: (value) => `${id.print(value.skill)} ${number.print(value.amount)}`,
  examples: ['smithing 5'],
};

export const recipeSchema: SectionSchema<Recipe> = {
  kind: 'recipe',
  fields: {
    requiresCapability: { parser: id, keyword: 'station' },
    in: { parser: list(quantified), default: () => [] },
    out: { parser: list(produced), default: () => [] },
    skill: { parser: recipeSkillValue },
    say: { parser: text },
    time: { parser: decimal },
    rate: { parser: numberOrStat },
    accuracy: { parser: id },
    evasion: { parser: id },
    burnt: { parser: list(produced), default: () => [] },
  },
};
