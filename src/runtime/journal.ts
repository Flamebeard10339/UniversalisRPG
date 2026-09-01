import type { ActionResult } from '../grammar/actionResult';
import type { Condition } from '../grammar/condition';
import type { Registry } from '../content/registry';
import { begun, stageNow, stagesReached, type Quest, type QuestStage, type QuestStanding } from '../content/sections/quest';
import { listedToPlayer } from '../content/sections';
import { evaluateCondition, renderSegments } from './conditions';
import { groupStandingFor, type GroupRow } from './grouping';
import { localizerOf, type Answer, type Localized, type Localizer } from './localized';
import { withoutNote } from '../grammar/note';
import type { GameState } from './state';

export type { QuestStanding };

export interface JournalLine {
  stage: Answer;
  said: Localized;
  authored: string;
  struck: boolean;
}

export interface JournalEntry {
  quest: Answer;
  title: Localized;
  stage: Answer;
  standing: QuestStanding;
  group?: GroupRow;
  lines: JournalLine[];
}

const standingOn = (entry: JournalEntry): JournalLine | undefined => entry.lines.find((line) => !line.struck);

export const standingLine = (entry: JournalEntry): Localized | null => standingOn(entry)?.said ?? null;

export const standingAuthored = (entry: JournalEntry): string | null => standingOn(entry)?.authored ?? null;

const spoken = (localizer: Localizer, state: GameState, registry: Registry, result: ActionResult | undefined): { said: Localized; authored: string } | null =>
  result === undefined || result.kind !== 'say' || result.key === undefined
    ? null
    : { said: localizer.line(result.key, (segments) => renderSegments(segments, state, registry)), authored: withoutNote(result.text).trim() };

const standingOf = (at: QuestStage, started: boolean): QuestStanding => (!started ? 'unstarted' : at.complete === true ? 'complete' : 'started');

function entryFor(registry: Registry, state: GameState, quest: Quest): JournalEntry | null {
  const holds = (asked: Condition): boolean => evaluateCondition(asked, state, registry);
  const at = stageNow(quest, holds);
  if (at === undefined) return null;
  const localizer = localizerOf(registry, state);
  const standing = standingOf(at, begun(quest, at, (flag) => state.flags[flag] !== undefined && state.flags[flag] !== false));
  const opening = spoken(localizer, state, registry, quest.log);
  const lines =
    standing === 'unstarted'
      ? opening === null
        ? []
        : [{ stage: at.name as Answer, ...opening, struck: false }]
      : stagesReached(quest, holds).flatMap((stage) => {
          const line = spoken(localizer, state, registry, stage.log);
          return line === null ? [] : [{ stage: stage.name as Answer, ...line, struck: standing === 'complete' || stage !== at }];
        });
  const group = groupStandingFor(registry, localizer, standing);
  return { quest: quest.id as Answer, title: localizer.title('quest', quest.id), stage: at.name as Answer, standing, ...(group === undefined ? {} : { group }), lines };
}

export function journal(registry: Registry, state: GameState): JournalEntry[] {
  return listedToPlayer(registry.quests.values()).flatMap((quest) => entryFor(registry, state, quest) ?? []);
}
