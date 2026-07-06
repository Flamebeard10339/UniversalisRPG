import { useState } from 'react';
import type { ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { currentQuestStage, deriveQuestStatus, type QuestStatus } from '../game/quests';

type QuestLogPanelProps = {
  bundle: ContentBundle;
  playState: UniversePlayState;
  t: Translator;
};

const statusDotClass: Record<QuestStatus, string> = {
  'not-started': 'bg-red-500',
  'in-progress': 'bg-yellow-400',
  complete: 'bg-emerald-400',
};

export const QuestLogPanel = ({ bundle, playState, t }: QuestLogPanelProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const quests = bundle.quests ?? [];

  if (quests.length === 0) {
    return (
      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm text-slate-500">{t('quests.empty')}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-2 rounded border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-base font-semibold text-slate-100">{t('quests.title')}</h2>
      <ul className="grid gap-2">
        {quests.map((quest) => {
          const status = deriveQuestStatus(playState, quest, bundle);
          const stage = currentQuestStage(playState, quest, bundle);
          const expanded = expandedId === quest.id;

          return (
            <li className="rounded border border-slate-800 bg-slate-950" key={quest.id}>
              <button
                className="flex w-full items-center gap-3 px-3 py-2 text-left"
                onClick={() => setExpandedId(expanded ? null : quest.id)}
                type="button"
              >
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass[status]}`} />
                <span className="text-sm font-semibold text-slate-100">{t(quest.titleKey)}</span>
              </button>
              {expanded && (
                <p className="border-t border-slate-800 px-3 py-2 text-xs text-slate-300">
                  {stage ? t(stage.descriptionKey) : t('quests.status.complete')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
