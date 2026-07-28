import { list } from '../grammar/list';
import { Parser } from '../grammar/parser';
import { SectionSchema } from '../grammar/section';
import { decimal, id, number, Quantified, quantified, text } from '../grammar/values';

export interface Recipe {
  id: string;
  requiresCapability?: string; // absent means craftable anywhere
  in: Quantified[];
  out: Quantified[];
  skill?: { skill: string; amount: number };
  say?: string;
  // Absent or 0 compiles to an instant craft, positive to a spannable one.
  time?: number;
  speed?: string;
  accuracy?: string;
  // Contested against `accuracy:`, the same field a rat's dodge uses.
  evasion?: string;
  burnt: Quantified[];
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
    requiresCapability: { parser: id, keyword: 'station' },
    in: { parser: list(quantified), default: () => [] },
    out: { parser: list(quantified), default: () => [] },
    skill: { parser: recipeSkill },
    say: { parser: text },
    time: { parser: decimal },
    speed: { parser: id },
    accuracy: { parser: id },
    evasion: { parser: id },
    burnt: { parser: list(quantified), default: () => [] },
  },
};
