import { useMemo } from 'react';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, ValidationIssue } from '../../game/types';
import { changedContributionJsonFiles } from '../../game/contributionFiles';
import { createPrefilledIssueUrl, formatContributionIssueBody } from '../../lib/githubIssues';

type SubmitToGitHubProps = {
  appVersion: string;
  bundle: ContentBundle;
  draft: ContributionDraft;
  validationIssues: ValidationIssue[];
  t: Translator;
};

export const SubmitToGitHub = ({ appVersion, bundle, draft, validationIssues, t }: SubmitToGitHubProps) => {
  const contributionPackage = useMemo(
    () => ({
      appVersion,
      targetUniverseId: draft.universeId,
      notes: draft.notes,
      validationIssues,
      t,
      changedFiles: changedContributionJsonFiles(bundle, draft),
    }),
    [appVersion, bundle, draft, t, validationIssues],
  );
  const issueBody = useMemo(() => formatContributionIssueBody(contributionPackage), [contributionPackage]);
  const issueUrl = useMemo(() => createPrefilledIssueUrl(contributionPackage), [contributionPackage]);

  const copyIssueBody = async () => {
    await navigator.clipboard.writeText(issueBody);
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
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
      <textarea className="min-h-56 rounded bg-slate-950 p-3 text-xs text-slate-300" readOnly value={issueBody} />
    </section>
  );
};
