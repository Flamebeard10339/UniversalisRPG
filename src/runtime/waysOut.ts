import type { Answer, Localized } from './localized';
import type { PlayChoice } from './session';

export interface WayOut {
  readonly to: Answer;
  // Where the choice sits in the view's own list, which is how a player answers it.
  readonly at: number;
  readonly label: Localized;
}

// Where the player can go from here and what takes them there: every choice that says it leads
// somewhere, the first one to a place winning. The map is drawn from this and `/map` reads it out,
// so no surface works out for itself what is reachable.
export function waysOut(choices: readonly PlayChoice[]): WayOut[] {
  const found: WayOut[] = [];
  choices.forEach((choice, index) => {
    if (choice.leadsTo === undefined || found.some((way) => way.to === choice.leadsTo)) return;
    found.push({ to: choice.leadsTo, at: index + 1, label: choice.label });
  });
  return found;
}
