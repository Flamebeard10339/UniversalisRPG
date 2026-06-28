import { useState } from 'react';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, ValidationIssue } from '../../game/types';
import { useContributionState } from '../../stores/contributionState';
import { useUniverseState } from '../../stores/universeState';
import { ContentDataEditor } from './ContentDataEditor';
import { LocalUniverseManager } from './LocalUniverseManager';
import { LocalizationEditor } from './LocalizationEditor';
import { SubmitToGitHub } from './SubmitToGitHub';

type ContributionModeProps = {
  bundle: ContentBundle;
  validationIssues: ValidationIssue[];
  t: Translator;
};

type ContributionTab = 'content' | 'localization' | 'submit';

const emptyDraft = (universeId: string): ContributionDraft => ({
  universeId,
  updatedAt: Date.now(),
  notes: '',
  combatBalance: undefined,
  locations: [],
  edges: [],
  actions: [],
  skills: [],
  stats: [],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  locales: {},
  removed: {
    locations: [],
    edges: [],
    actions: [],
    skills: [],
    stats: [],
    items: [],
    flags: [],
    resources: [],
    effects: [],
    interactionTypes: [],
    enemies: [],
  },
});

export const ContributionMode = ({ bundle, validationIssues, t }: ContributionModeProps) => {
  const [activeTab, setActiveTab] = useState<ContributionTab>('content');
  const draft = useContributionState((state) => state.drafts[bundle.manifest.id] ?? emptyDraft(bundle.manifest.id));
  const updateDraft = useContributionState((state) => state.updateDraft);
  const resetDraft = useContributionState((state) => state.resetDraft);
  const baseBundle = useUniverseState((state) => state.baseBundle);
  const refreshContributionPreview = useUniverseState((state) => state.refreshContributionPreview);

  const patchDraft = (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => {
    updateDraft(bundle.manifest.id, patch);
    queueMicrotask(refreshContributionPreview);
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{t('contribution.title')}</h2>
          <p className="text-sm text-slate-400">{t('contribution.description')}</p>
        </div>
        <button
          className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
          onClick={() => {
            resetDraft(bundle.manifest.id);
            queueMicrotask(refreshContributionPreview);
          }}
          type="button"
        >
          {t('contribution.resetDraft')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded border border-slate-800 bg-slate-900 p-2">
        {(['content', 'localization', 'submit'] as ContributionTab[]).map((tab) => (
          <button
            className={`rounded px-3 py-2 text-sm font-semibold capitalize ${
              activeTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-950 text-slate-300'
            }`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {t(`contribution.tab.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === 'content' && (
        <ContentDataEditor baseBundle={baseBundle ?? bundle} bundle={bundle} draft={draft} onPatch={patchDraft} t={t} />
      )}

      {activeTab === 'localization' && (
        <LocalizationEditor bundle={bundle} draft={draft} onChange={(locales) => patchDraft({ locales })} t={t} />
      )}

      {activeTab === 'submit' && (
        <>
          <section className="grid gap-2 rounded border border-slate-700 p-3">
            <h3 className="text-sm font-semibold text-slate-100">{t('contribution.validation.title')}</h3>
            {validationIssues.length === 0 ? (
              <p className="text-sm text-emerald-300">{t('contribution.validation.empty')}</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {validationIssues.map((issue) => (
                  <li className={issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'} key={`${issue.path}-${issue.message}`}>
                    {issue.severity}: {issue.path} - {t(issue.message, issue.params)}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <textarea
            className="min-h-24 rounded bg-slate-950 p-3 text-sm text-slate-200"
            onChange={(event) => patchDraft({ notes: event.target.value })}
            placeholder={t('contribution.notesPlaceholder')}
            value={draft.notes}
          />
          <LocalUniverseManager bundle={bundle} t={t} />
          <SubmitToGitHub appVersion="0.1.0" draft={draft} validationIssues={validationIssues} t={t} />
        </>
      )}
    </section>
  );
};
