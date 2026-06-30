import { useMemo } from 'react';
import type { Translator } from '../../game/i18n';
import type { ContributionDraft, ValidationIssue } from '../../game/types';
import { createPrefilledIssueUrl, formatContributionIssueBody } from '../../lib/githubIssues';

type SubmitToGitHubProps = {
  appVersion: string;
  draft: ContributionDraft;
  validationIssues: ValidationIssue[];
  t: Translator;
};

export const SubmitToGitHub = ({ appVersion, draft, validationIssues, t }: SubmitToGitHubProps) => {
  const basePlayerPatch = draft.basePlayer?.inventory ? { basePlayer: { inventory: draft.basePlayer.inventory } } : {};
  const contributionPackage = useMemo(
    () => ({
      appVersion,
      targetUniverseId: draft.universeId,
      notes: draft.notes,
      validationIssues,
      t,
      changedFiles: [
        { path: 'universe.json', json: { ...basePlayerPatch, ...(draft.combatBalance ? { combatBalance: draft.combatBalance } : {}), ...(draft.ui ? { ui: draft.ui } : {}) } },
        { path: 'locations.json', json: draft.locations },
        { path: 'edges.json', json: draft.edges },
        { path: 'actions.json', json: draft.actions },
        { path: 'skills.json', json: draft.skills },
        { path: 'stats.json', json: draft.stats },
        { path: 'items.json', json: draft.items },
        { path: 'flags.json', json: draft.flags },
        { path: 'resources.json', json: draft.resourceDefinitions },
        { path: 'effects.json', json: draft.effects },
        { path: 'interaction-types.json', json: draft.interactionTypes },
        { path: 'enemies.json', json: draft.enemies },
        { path: 'removed.json', json: draft.removed },
        { path: 'locales.json', json: draft.locales },
      ].filter((file) => {
        if (Array.isArray(file.json)) {
          return file.json.length > 0;
        }
        if (file.path === 'removed.json') {
          return Object.values(file.json as Record<string, unknown[] | undefined>).some((items) => (items?.length ?? 0) > 0);
        }
        return Object.keys(file.json as Record<string, unknown>).length > 0;
      }),
    }),
    [appVersion, basePlayerPatch, draft, t, validationIssues],
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
