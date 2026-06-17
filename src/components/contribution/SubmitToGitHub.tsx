import { useMemo } from 'react';
import type { ContributionDraft, ValidationIssue } from '../../game/types';
import { createPrefilledIssueUrl, formatContributionIssueBody } from '../../lib/githubIssues';

type SubmitToGitHubProps = {
  appVersion: string;
  draft: ContributionDraft;
  validationIssues: ValidationIssue[];
};

export const SubmitToGitHub = ({ appVersion, draft, validationIssues }: SubmitToGitHubProps) => {
  const contributionPackage = useMemo(
    () => ({
      appVersion,
      targetUniverseId: draft.universeId,
      notes: draft.notes,
      validationIssues,
      changedFiles: [
        { path: 'locations.json', json: draft.locations },
        { path: 'edges.json', json: draft.edges },
        { path: 'actions.json', json: draft.actions },
        { path: 'skills.json', json: draft.skills },
        { path: 'items.json', json: draft.items },
        { path: 'locales.json', json: draft.locales },
      ].filter((file) => {
        if (Array.isArray(file.json)) {
          return file.json.length > 0;
        }
        return Object.keys(file.json as Record<string, unknown>).length > 0;
      }),
    }),
    [appVersion, draft, validationIssues],
  );
  const issueBody = useMemo(() => formatContributionIssueBody(contributionPackage), [contributionPackage]);
  const issueUrl = useMemo(() => createPrefilledIssueUrl(contributionPackage), [contributionPackage]);

  const copyIssueBody = async () => {
    await navigator.clipboard.writeText(issueBody);
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">Submit to GitHub</h3>
        <p className="text-xs text-slate-400">
          Review the generated issue body before sending the contribution upstream.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="rounded bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950" href={issueUrl} rel="noreferrer" target="_blank">
          Open issue
        </a>
        <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={copyIssueBody} type="button">
          Copy body
        </button>
      </div>
      <textarea className="min-h-56 rounded bg-slate-950 p-3 text-xs text-slate-300" readOnly value={issueBody} />
    </section>
  );
};
