import type { ActionResult } from '../grammar/actionResult';
import type { Condition } from '../grammar/condition';
import type { Registry } from '../content/registry';
import { begun, stageNow, stagesReached, type Quest, type QuestStage } from '../content/sections/quest';
import { evaluateCondition, renderSegments } from './conditions';
import { localizerOf, type Answer, type Localized, type Localizer } from './localized';
import type { GameState } from './state';

// A quest nobody has touched, one under way, and one finished, which is the whole of what a journal tells them apart by.
export type QuestStanding = 'unstarted' | 'started' | 'complete';

export interface JournalLine {
  stage: Answer;
  said: Localized;
  // Struck through, the way a journal crosses off what is behind you. What the quest is standing on is not struck, because it is what there is left to do.
  struck: boolean;
}

export interface JournalEntry {
  quest: Answer;
  title: Localized;
  stage: Answer;
  standing: QuestStanding;
  // One line to each stage the quest has been through. A quest nobody has begun has been through nothing and reads as nothing, rather than reading out what has not happened yet.
  lines: JournalLine[];
  // What to do next, which is nothing for a quest not under way.
  hint: Localized | null;
}

const spoken = (localizer: Localizer, state: GameState, result: ActionResult | undefined): Localized | null =>
  result === undefined || result.kind !== 'say' || result.key === undefined ? null : localizer.line(result.key, (segments) => renderSegments(segments, state));

// Not begun comes first: a quest whose only stage completes it has still not been begun until something of it has happened.
const standingOf = (at: QuestStage, started: boolean): QuestStanding => (!started ? 'unstarted' : at.complete === true ? 'complete' : 'started');

function entryFor(registry: Registry, state: GameState, quest: Quest): JournalEntry | null {
  const holds = (asked: Condition): boolean => evaluateCondition(asked, state);
  const at = stageNow(quest, holds);
  if (at === undefined) return null;
  const localizer = localizerOf(registry, state);
  const standing = standingOf(at, begun(quest, at, (flag) => state.flags[flag] !== undefined && state.flags[flag] !== false));
  // Before it has begun, a quest reads what it says of itself: what is known of it, and what would begin it. After, it reads what has happened.
  const opening = spoken(localizer, state, quest.log);
  const lines =
    standing === 'unstarted'
      ? opening === null
        ? []
        : [{ stage: at.name as Answer, said: opening, struck: false }]
      : stagesReached(quest, holds).flatMap((stage) => {
          const said = spoken(localizer, state, stage.log);
          return said === null ? [] : [{ stage: stage.name as Answer, said, struck: standing === 'complete' || stage !== at }];
        });
  const hint = standing === 'unstarted' ? spoken(localizer, state, quest.hint) : standing === 'started' ? spoken(localizer, state, at.hint) : null;
  return { quest: quest.id as Answer, title: localizer.title('quest', quest.id), stage: at.name as Answer, standing, lines, hint };
}

// Every quest the world declares, touched or not, in the order the world declares them. A journal that listed only what had been started would be a list of what the player already knows.
export function journal(registry: Registry, state: GameState): JournalEntry[] {
  return [...registry.quests.values()].flatMap((quest) => entryFor(registry, state, quest) ?? []);
}
