import { list } from './list';
import { Parser } from './parser';
import { SectionSchema } from './section';
import { decimal, id, number, Quantified, quantified, text } from './values';

export interface Recipe {
  id: string;
  requiresCapability?: string; // absent means craftable anywhere
  in: Quantified[];
  out: Quantified[];
  skill?: { skill: string; amount: number };
  say?: string;
  // Seconds per attempt (mirrors Action.time). Absent/0 compiles to an
  // instant, non-repeating craft (today's behavior); >0 compiles to a
  // repeating, spannable craft — see recipeAction in runtime.ts.
  time?: number;
  speed?: string;
  accuracy?: string;
  // Escape-path output when accuracy is set — a missed attempt fails to this
  // instead of retrying (recipeAction compiles accuracy => escapeAfter: 1).
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
    burnt: { parser: list(quantified), default: () => [] },
  },
};
