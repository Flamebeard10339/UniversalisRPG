import { Action } from '../../grammar/action';
import { ActionResult } from '../../grammar/actionResult';
import { list } from '../../grammar/list';
import { Parser } from '../../grammar/parser';
import { point } from '../../grammar/range';
import { decimal, humanizeEn, id, number, numberOrStat, produced, Produced, Quantified, quantified, text } from '../../grammar/values';
import { put, quantified as quantifiedItems, type Loose } from '../refs';
import { CRAFT_ADDRESS } from '../registry';
import { ActionDeclaration } from './action';
import { section } from './define';

export interface Recipe {
  id: string;
  // Absent means craftable anywhere.
  requiresCapability?: string;
  in: Quantified[];
  // Produced, so a fletching craft can yield 5-10 arrows; `in` is consumed and
  // stays a count, because `inputLimit` must be able to divide by it.
  out: Produced[];
  skill?: { skill: string; amount: number };
  say?: string;
  time?: number;
  rate?: number | string;
  accuracy?: string;
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

// Compiled to an Action so a craft runs through the same resolve() machinery as
// any other single-attempt fight. Whatever was authored is carried through
// unexamined, so the table that judges an authored action judges this one
// rather than a recipe-shaped copy of it.
function recipeAction(recipe: Recipe): ActionDeclaration {
  const takes: ActionResult[] = recipe.in.map((q) => ({ kind: 'take', item: q.item, amount: q.amount }));
  const gives: ActionResult[] = recipe.out.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
  const results: ActionResult[] = [...takes, ...gives];
  if (recipe.skill) results.push({ kind: 'xp', skill: recipe.skill.skill, amount: point(recipe.skill.amount) });
  if (recipe.say) results.push({ kind: 'say', text: recipe.say });

  const rate = typeof recipe.rate === 'string' ? { id: recipe.rate } : recipe.rate;
  const cadence: Pick<Action, 'rate' | 'time'> = rate !== undefined ? { rate } : recipe.time !== undefined ? { time: recipe.time } : {};
  const action: ActionDeclaration = {
    id: CRAFT_ADDRESS,
    label: humanizeEn(CRAFT_ADDRESS),
    generatedLabel: true,
    kind: 'rate' in cadence || 'time' in cadence ? 'continuous' : 'instant',
    results,
    ...cadence,
    // One-sided: a craft has one participant, so neither half names a side.
    ...(recipe.accuracy ? { accuracy: { left: { id: recipe.accuracy }, ...(recipe.evasion ? { right: { id: recipe.evasion } } : {}) } } : {}),
  };

  if (recipe.accuracy) {
    // The fail path consumes the SAME inputs as success, so inputLimit still
    // bounds a repeating burn-capable craft.
    action.attempts = 1;
    const burnt: ActionResult[] = recipe.burnt.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
    action.onUnfinished = [...takes, ...burnt];
  }

  return action;
}

export const recipe = section<Recipe>()({
  kind: 'recipe',
  ids: 'owned',
  maps: {
    recipes: (value) => [[value.id, value]],
    recipeActions: (value) => [[value.id, recipeAction(value)]],
  },
  text: ['title'],
  fields: {
    requiresCapability: { parser: id, keyword: 'station' },
    in: { parser: list(quantified), default: () => [], block: true },
    out: { parser: list(produced), default: () => [], block: true },
    skill: { parser: recipeSkillValue },
    say: { parser: text },
    time: { parser: decimal },
    rate: { parser: numberOrStat },
    accuracy: { parser: id },
    evasion: { parser: id },
    burnt: { parser: list(produced), default: () => [], block: true },
  },
  validate: (value) => (value.burnt.length > 0 && !value.accuracy ? 'burnt: needs an accuracy: stat, or nothing can ever burn' : undefined),
  visit: (value, where, visit) => {
    const held = value as unknown as Loose;
    for (const field of ['in', 'out', 'burnt'] as const) quantifiedItems(held[field], 'item', `${where} ${field}:`, visit);
    for (const field of ['rate', 'accuracy', 'evasion'] as const) put(held, field, 'stat', `${where} ${field}:`, visit);
    put(held, 'requiresCapability', 'capability', `${where} station`, visit);
    if (held.skill) put(held.skill as Loose & { skill: string }, 'skill', 'skill', `${where} skill:`, visit);
  },
});

