import { useMemo } from 'react';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, ContributionDslModuleFile, ValidationIssue } from '../../game/types';
import { changedContributionJsonFiles } from '../../game/contributionFiles';
import { createPrefilledIssueUrl, formatContributionIssueBody } from '../../lib/githubIssues';
import { useDslEditorState } from '../../stores/dslEditorState';

type SubmitToGitHubProps = {
  appVersion: string;
  bundle: ContentBundle;
  draft: ContributionDraft;
  validationIssues: ValidationIssue[];
  t: Translator;
};

export const SubmitToGitHub = ({ appVersion, bundle, draft, validationIssues, t }: SubmitToGitHubProps) => {
  const dslDrafts = useDslEditorState((state) => state.drafts);
  const dslModules: ContributionDslModuleFile[] = useMemo(
    () =>
      Object.values(dslDrafts)
        .filter((dslDraft) => dslDraft.lastValidSource !== undefined && dslDraft.lastValidSource !== dslDraft.baselineSource)
        .map((dslDraft) => ({
          path: `modules/${dslDraft.moduleId}.md`,
          baselineSource: dslDraft.baselineSource,
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
      changedFiles: changedContributionJsonFiles(bundle, draft),
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
    <section className="grid gap-3 grid-rows-[auto_auto_1fr] h-full rounded border border-slate-700 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">{t('contribution.github.title')}</h3>
        <p className="text-xs text-slate-400">{t('contribution.github.description')}</p>
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
