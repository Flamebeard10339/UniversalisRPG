import { actionResultLists } from '../../grammar/action';
import { Action } from '../../grammar/action';
import { ActionResult } from '../../grammar/actionResult';
import { list } from '../../grammar/list';
import { Parser } from '../../grammar/parser';
import { point } from '../../grammar/range';
import { decimal, humanizeEn, id, number, numberOrStat, produced, Produced, Quantified, quantified, text } from '../../grammar/values';
import { put, quantified as quantifiedItems, type Loose } from '../refs';
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
  forms: ['<skill> <level>'],
  examples: ['smithing 5'],
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
    label: humanizeEn(CRAFT_ADDRESS),
    generatedLabel: true,
    kind: 'rate' in cadence || 'time' in cadence ? 'continuous' : 'instant',
    results,
    ...cadence,
    ...(recipe.accuracy
      ? {
          accuracy: {
            left: { id: recipe.accuracy },
            ...(recipe.evasion ? { right: { id: recipe.evasion } } : {}),
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
    action.onUnfinished = [...takes, ...burnt];
  }

  return action;
}

const compiled = new WeakMap<Recipe, ActionDeclaration>();

// One compiled craft per recipe, because keying the words it speaks stamps the
// result objects themselves — the registry and the prose walk must hold the same.
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
    in: { parser: list(quantified), default: () => [], block: true },
    out: { parser: list(produced), default: () => [], block: true },
    skill: { parser: recipeSkillValue },
    say: { parser: text },
    time: { parser: decimal },
    rate: { parser: numberOrStat },
    accuracy: { parser: id, names: { id: 'stat' } },
    evasion: { parser: id, names: { id: 'stat' } },
    burnt: { parser: list(produced), default: () => [], block: true },
  },
  validate: (value) => (value.burnt.length > 0 && !value.accuracy ? 'burnt: needs an accuracy: stat, or nothing can ever burn' : undefined),
  visit: (value, where, visit) => {
    const held = value as unknown as Loose;
    for (const field of ['in', 'out', 'burnt'] as const) quantifiedItems(held[field], 'item', `${where} ${field}:`, visit);
    if (held.skill) put(held.skill as Loose & { skill: string }, 'skill', 'skill', `${where} skill:`, visit);
  },
});
