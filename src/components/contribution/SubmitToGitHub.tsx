import { useMemo } from 'react';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, ValidationIssue } from '../../game/types';
import { buildContributionBundle, type ContributionDraftInput } from '../../game/contentDsl/contributionBundle';
import { createPrefilledIssueUrl, formatContributionIssueBody } from '../../lib/githubIssues';
import { useDslEditorState } from '../../stores/dslEditorState';
import { useUniverseState } from '../../stores/universeState';

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
  const baseBundle = useUniverseState((state) => state.baseBundle);

  // Package every changed draft into one multi-module file: modules the author
  // wrote from scratch verbatim, plus an auto-generated <coreId>-PATCHES for
  // each shipped module they edited (a shipped module is one that ships in the
  // universe — its edits become a `# patch` rather than shipping the whole
  // file). See src/game/contentDsl/contributionBundle.ts.
  const { dslModules, warnings } = useMemo(() => {
    const shippedIds = new Set((baseBundle?.modules ?? []).map((module) => module.id));
    const inputs: ContributionDraftInput[] = Object.values(dslDrafts)
      .filter((dslDraft) => dslDraft.lastValidSource !== undefined)
      .map((dslDraft) => ({
        moduleId: dslDraft.moduleId,
        baselineSource: dslDraft.baselineSource,
        currentSource: dslDraft.lastValidSource!,
        isCoreModule: shippedIds.has(dslDraft.moduleId),
      }));
    const result = buildContributionBundle(inputs);
    return {
      dslModules: result.source ? [{ path: 'modules/contribution.md', source: result.source }] : [],
      warnings: result.warnings,
    };
  }, [dslDrafts, baseBundle]);

  const contributionPackage = useMemo(
    () => ({
      appVersion,
      targetUniverseId: draft.universeId,
      notes: draft.notes,
      validationIssues,
      t,
      dslModules,
      warnings,
    }),
    [appVersion, draft, dslModules, warnings, t, validationIssues],
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
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <button className="rounded bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={copyIssueBody} type="button">
            {t('contribution.github.copy')}
          </button>
          <a className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" href={issueUrl} rel="noreferrer" target="_blank">
            {t('contribution.github.open')}
          </a>
        </div>
        {warnings.length > 0 && (
          <div className="rounded border border-amber-500 bg-amber-950/30 p-2 text-xs text-amber-200" data-testid="contribution-warnings">
            <p className="font-semibold">{t('contribution.github.warningsTitle', 'Some edits could not be packaged as a patch:')}</p>
            <ul className="mt-1 list-disc pl-4">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <textarea className="min-h-0 rounded bg-slate-950 p-3 text-xs text-slate-300" readOnly value={issueBody} />
    </section>
  );
};
