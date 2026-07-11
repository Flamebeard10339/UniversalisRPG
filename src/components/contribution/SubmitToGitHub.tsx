import { useMemo } from 'react';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, ContributionDslModuleFile, ValidationIssue } from '../../game/types';
import { createPrefilledIssueUrl, formatContributionIssueBody } from '../../lib/githubIssues';
import { useDslEditorState } from '../../stores/dslEditorState';

type SubmitToGitHubProps = {
  appVersion: string;
  bundle: ContentBundle;
  draft: ContributionDraft;
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  validationIssues: ValidationIssue[];
  t: Translator;
};

export const SubmitToGitHub = ({ appVersion, bundle, draft, onPatch, validationIssues, t }: SubmitToGitHubProps) => {
  const dslDrafts = useDslEditorState((state) => state.drafts);
  const dslModules: ContributionDslModuleFile[] = useMemo(
    () =>
      Object.values(dslDrafts)
        .filter((dslDraft) => dslDraft.lastValidSource !== undefined && dslDraft.lastValidSource !== dslDraft.baselineSource)
        .map((dslDraft) => ({
          path: `modules/${dslDraft.moduleId}.md`,
          source: dslDraft.lastValidSource!,
        })),
    [dslDrafts],
  );

  const contributionPackage = useMemo(
    () => ({
      appVersion,
      targetUniverseId: draft.universeId,
      notes: draft.notes,
      validationIssues,
      t,
      dslModules,
    }),
    [appVersion, bundle, draft, dslModules, t, validationIssues],
  );
  const issueBody = useMemo(() => formatContributionIssueBody(contributionPackage), [contributionPackage]);
  const issueUrl = useMemo(() => createPrefilledIssueUrl(contributionPackage), [contributionPackage]);

  const copyIssueBody = async () => {
    await navigator.clipboard.writeText(issueBody);
  };

  return (
    <section className="grid gap-3 grid-rows-[auto_auto_auto_1fr] h-full rounded border border-slate-700 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">{t('contribution.github.title')}</h3>
        <p className="text-xs text-slate-400">{t('contribution.github.description')}</p>
      </div>
      <div className="grid gap-1">
        <label className="text-xs font-semibold text-slate-300" htmlFor="contribution-notes">{t('contribution.github.notesLabel')}</label>
        <textarea
          className="min-h-16 rounded bg-slate-950 p-2 text-xs text-slate-100"
          id="contribution-notes"
          onChange={(event) => onPatch({ notes: event.target.value })}
          placeholder={t('contribution.github.notesPlaceholder')}
          value={draft.notes}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="rounded bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950" href={issueUrl} rel="noreferrer" target="_blank">
          {t('contribution.github.open')}
        </a>
        <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={copyIssueBody} type="button">
          {t('contribution.github.copy')}
        </button>
      </div>
      <textarea className="min-h-0 rounded bg-slate-950 p-3 text-xs text-slate-300" readOnly value={issueBody} />
    </section>
  );
};
