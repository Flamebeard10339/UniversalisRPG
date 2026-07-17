import { list } from './list';
import { Parser } from './parser';
import { SectionSchema } from './section';
import { id, number, Quantified, quantified, text } from './values';

export interface Recipe {
  id: string;
  station?: string;
  in: Quantified[];
  out: Quantified[];
  skill?: { skill: string; amount: number };
  say?: string;
}

const recipeSkill: Parser<{ skill: string; amount: number }> = {
  parse(cursor) {
    const skill = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return { skill, amount: number.parse(cursor) };
  },
};

export const recipeSchema: SectionSchema<Recipe> = {
  kind: 'recipe',
  fields: {
    station: { parser: id },
    in: { parser: list(quantified), default: () => [] },
    out: { parser: list(quantified), default: () => [] },
    skill: { parser: recipeSkill },
    say: { parser: text },
  },
};
