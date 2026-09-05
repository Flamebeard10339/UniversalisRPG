import { actionResultLists, seconds } from '../../grammar/action';
import { Action } from '../../grammar/action';
import { ActionResult } from '../../grammar/actionResult';
import { list } from '../../grammar/list';
import { Parser } from '../../grammar/parser';
import { point } from '../../grammar/range';
import { id, number, numberOrStat, produced, Produced, Quantified, quantified, text } from '../../grammar/values';
import { ActionDeclaration } from './action';
import { section } from './define';

export const CRAFT_ADDRESS = 'craft';

export interface Recipe {
  id: string;
  requiresCapability?: string;
  in: Quantified[];
  out: Produced[];
  skill?: { skill: string; amount: number };
  say?: string;
  time?: number;
  rate?: number | string;
  accuracy?: string;
  evasion?: string | number;
  burnt: Produced[];
}

export const recipeSkillValue: Parser<{ skill: string; amount: number }> = {
  parse(cursor) {
    const skill = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return { skill, amount: number.parse(cursor) };
  },
  print: (value) => `${id.print(value.skill)} ${number.print(value.amount)}`,
  lands: [{ how: 'ref', field: 'skill', names: 'skill' }],
  forms: ['<skill> <xp>'],
  examples: ['smithing 40'],
};

function compile(recipe: Recipe): ActionDeclaration {
  const takes: ActionResult[] = recipe.in.map((q) => ({
    kind: 'take',
    item: q.item,
    amount: q.amount,
  }));
  const gives: ActionResult[] = recipe.out.map((q) => ({
    kind: 'give',
    item: q.item,
    amount: q.amount,
  }));
  const results: ActionResult[] = [...takes, ...gives];
  if (recipe.skill)
    results.push({
      kind: 'xp',
      skill: recipe.skill.skill,
      amount: point(recipe.skill.amount),
    });
  if (recipe.say) results.push({ kind: 'say', text: recipe.say });

  const rate = typeof recipe.rate === 'string' ? { id: recipe.rate } : recipe.rate;
  const cadence: Pick<Action, 'rate' | 'time'> = rate !== undefined ? { rate } : recipe.time !== undefined ? { time: recipe.time } : {};
  const action: ActionDeclaration = {
    id: CRAFT_ADDRESS,
    label: CRAFT_ADDRESS,
    generatedLabel: true,
    kind: 'rate' in cadence || 'time' in cadence ? 'continuous' : 'instant',
    results,
    ...cadence,
    ...(recipe.accuracy
      ? {
          accuracy: {
            left: { id: recipe.accuracy },
            ...(recipe.evasion === undefined ? {} : { right: typeof recipe.evasion === 'number' ? recipe.evasion : { id: recipe.evasion } }),
          },
        }
      : {}),
  };

  if (recipe.accuracy) {
    action.attempts = 1;
    const burnt: ActionResult[] = recipe.burnt.map((q) => ({
      kind: 'give',
      item: q.item,
      amount: q.amount,
    }));
    action.onAttemptsExhausted = [...takes, ...burnt];
  }

  return action;
}

const compiled = new WeakMap<Recipe, ActionDeclaration>();

function recipeAction(recipe: Recipe): ActionDeclaration {
  const already = compiled.get(recipe);
  if (already) return already;
  const made = compile(recipe);
  compiled.set(recipe, made);
  return made;
}

export const recipe = section<Recipe>()({
  says: (value) => actionResultLists(recipeAction(value)),
  kind: 'recipe',
  ids: 'owned',
  vocabulary: 'declared',
  maps: {
    recipes: (value) => [[value.id, value]],
    recipeActions: (value) => [[value.id, recipeAction(value)]],
  },
  text: ['title'],
  fields: {
    requiresCapability: { parser: id, keyword: 'station', names: { id: 'station' } },
    in: { parser: list(quantified), default: () => [], block: true, needsEvery: true },
    out: { parser: list(produced), default: () => [], block: true, needsEvery: true },
    skill: { parser: recipeSkillValue, note: 'the experience one craft pays into that skill' },
    say: { parser: text },
    time: { parser: seconds, note: 'how long one craft takes' },
    rate: { parser: numberOrStat, note: 'how many crafts an hour of game time holds, as a count per minute — the other way of saying `time:`, and an action takes one or the other' },
    accuracy: { parser: id, names: { id: 'stat' } },
    evasion: {
      parser: numberOrStat,
      note: 'what the accuracy: stat is weighed against. A number is how hard this dish is, written on the dish — nothing stands across the bench to read a stat off, so a recipe that leaves this out is contested against nothing and every dish of every tier risks the same',
    },
    burnt: { parser: list(produced), default: () => [], block: true, needsEvery: true },
  },
  validate: (value) => (value.burnt.length > 0 && !value.accuracy ? 'burnt: needs an accuracy: stat, or nothing can ever burn' : undefined),
});
