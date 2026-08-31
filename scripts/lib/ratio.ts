import { skillLevel } from '../../src/runtime/skills';
import { rateAtLevel } from './pace';

// What the run this sweep started from stands at, skill by skill. Every offer in a sweep is measured
// from the same save, so there is one level per skill and not a range of them — and a rate is read
// against the level of the skill it paid into, never against the run's highest.
export type Levels = Readonly<Record<string, number>>;

export const levelsIn = (xp: Readonly<Record<string, number>>): Levels => Object.fromEntries(Object.entries(xp).map(([skill, earned]) => [skill, skillLevel(earned)]));

// A skill nothing has been earned in stands at the level every skill starts on, so a sweep from a
// blank save is measured against the first level rather than against nothing.
export const levelOf = (levels: Levels, skill: string): number => levels[skill] ?? skillLevel(0);

export interface Ratio {
  skill: string;
  level: number;
  // The pace the curve asks of the best offer within reach at that level, in experience an hour.
  target: number;
  paid: number;
}

export const ratioOf = ({ target, paid }: Pick<Ratio, 'target' | 'paid'>): number => paid / target;

export function ratioFor(skill: string, paid: number, levels: Levels): Ratio {
  const level = levelOf(levels, skill);
  return { skill, level, target: rateAtLevel(level), paid };
}

// One offer's pace into one skill: the mean across the seeds it was run under, and not the best of
// them. A maximum over seeds would rise with `--seeds` alone, so asking for more of them would drop
// every ratio in the sheet with nothing in the world having changed.
export const meanRate = (rates: readonly number[]): number => (rates.length === 0 ? 0 : rates.reduce((total, rate) => total + rate, 0) / rates.length);

export interface Frontier {
  skill: string;
  level: number;
  target: number;
  // The best-paying offer, and what it paid. The pace target binds here and nowhere else: an offer
  // under it is what makes one activity worth half of another rather than a defect.
  best: string;
  at: string;
  paid: number;
  // How many offers pay within twice the frontier, the frontier included. A level whose count is one
  // is a level with one thing to do, which the frontier ruling on its own permits and nobody wants.
  within: number;
  offers: number;
}

export const WITHIN = 2;

export interface Paid {
  skill: string;
  use: string;
  at: string;
  rate: number;
}

// The frontier per skill, and how crowded it is underneath. Subjects are whatever paid into the
// skill, so a mechanic added next month is on this sheet by having paid.
export function frontiers(paid: readonly Paid[], levels: Levels): Frontier[] {
  const bySkill = new Map<string, Paid[]>();
  for (const each of paid) bySkill.set(each.skill, [...(bySkill.get(each.skill) ?? []), each]);

  return [...bySkill]
    .map(([skill, into]) => {
      const best = [...into].sort((one, other) => other.rate - one.rate)[0]!;
      const { level, target } = ratioFor(skill, best.rate, levels);
      return {
        skill,
        level,
        target,
        best: best.use,
        at: best.at,
        paid: best.rate,
        within: into.filter((each) => each.rate * WITHIN >= best.rate).length,
        offers: into.length,
      };
    })
    .sort((one, other) => one.skill.localeCompare(other.skill));
}
