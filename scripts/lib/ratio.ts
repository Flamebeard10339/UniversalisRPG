import { skillLevel } from '../../src/runtime/skills';
import { rateAtLevel } from './pace';

export type Levels = Readonly<Record<string, number>>;

export const levelsIn = (xp: Readonly<Record<string, number>>): Levels => Object.fromEntries(Object.entries(xp).map(([skill, earned]) => [skill, skillLevel(earned)]));

export const levelOf = (levels: Levels, skill: string): number => levels[skill] ?? skillLevel(0);

export interface Ratio {
  skill: string;
  level: number;
  target: number;
  paid: number;
}

export const ratioOf = ({ target, paid }: Pick<Ratio, 'target' | 'paid'>): number => paid / target;

export function ratioFor(skill: string, paid: number, levels: Levels): Ratio {
  const level = levelOf(levels, skill);
  return { skill, level, target: rateAtLevel(level, skill), paid };
}

export const meanRate = (rates: readonly number[]): number => (rates.length === 0 ? 0 : rates.reduce((total, rate) => total + rate, 0) / rates.length);

export interface Frontier {
  skill: string;
  level: number;
  target: number;
  best: string;
  at: string;
  paid: number;
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
