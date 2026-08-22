import type { ActionResult } from '../grammar/actionResult';
import type { Registry } from '../content/registry';
import { begun, stageNow, type Quest } from '../content/sections/quest';
import { evaluateCondition, renderSegments } from './conditions';
import { localizerOf, type Answer, type Localized } from './localized';
import type { GameState } from './state';

export interface JournalEntry {
  quest: Answer;
  title: Localized;
  stage: Answer;
  log: Localized | null;
  hint: Localized | null;
  complete: boolean;
}

const entryFor = (registry: Registry, state: GameState, quest: Quest): JournalEntry | null => {
  const stage = stageNow(quest, (asked) => evaluateCondition(asked, state));
  if (stage === undefined || !begun(quest, stage, (flag) => state.flags[flag] !== undefined && state.flags[flag] !== false)) return null;
  const localizer = localizerOf(registry, state);
  const said = (result: ActionResult | undefined): Localized | null =>
    result === undefined || result.kind !== 'say' || result.key === undefined ? null : localizer.line(result.key, (segments) => renderSegments(segments, state));
  return { quest: quest.id, title: localizer.title('quest', quest.id), stage: stage.name, log: said(stage.log), hint: said(stage.hint), complete: stage.complete === true };
};

// What the player has taken on, and where each of it stands. A quest nobody has reached a stage of is not news, so the journal is what has actually happened rather than everything the world declares.
export function journal(registry: Registry, state: GameState): JournalEntry[] {
  return [...registry.quests.values()].flatMap((quest) => entryFor(registry, state, quest) ?? []);
}
