import type { Answer, Localized } from './localized';
import type { PlayChoice } from './session';

export interface WayOut {
  readonly to: Answer;
  readonly at: number;
  readonly label: Localized;
  readonly legs: number;
}

export function waysOut(choices: readonly PlayChoice[]): WayOut[] {
  const found: WayOut[] = [];
  choices.forEach((choice, index) => {
    if (choice.leadsTo === undefined || found.some((way) => way.to === choice.leadsTo)) return;
    found.push({ to: choice.leadsTo, at: index + 1, label: choice.label, legs: choice.legs ?? 1 });
  });
  return found;
}
