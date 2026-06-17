import type { ContentBundle, ContributionDraft, ValidationIssue } from '../../game/types';
import { useContributionState } from '../../stores/contributionState';
import { useUniverseState } from '../../stores/universeState';
import { ActionEditor } from './ActionEditor';
import { EdgeEditor } from './EdgeEditor';
import { LocalUniverseManager } from './LocalUniverseManager';
import { LocaleEditor } from './LocaleEditor';
import { LocationEditor } from './LocationEditor';
import { SkillEditor } from './SkillEditor';
import { SubmitToGitHub } from './SubmitToGitHub';

type ContributionModeProps = {
  bundle: ContentBundle;
  validationIssues: ValidationIssue[];
};

const emptyDraft = (universeId: string): ContributionDraft => ({
  universeId,
  updatedAt: Date.now(),
  notes: '',
  locations: [],
  edges: [],
  actions: [],
  skills: [],
  locales: {},
});

export const ContributionMode = ({ bundle, validationIssues }: ContributionModeProps) => {
  const draft = useContributionState((state) => state.drafts[bundle.manifest.id] ?? emptyDraft(bundle.manifest.id));
  const updateDraft = useContributionState((state) => state.updateDraft);
  const resetDraft = useContributionState((state) => state.resetDraft);
  const refreshContributionPreview = useUniverseState((state) => state.refreshContributionPreview);

  const patchDraft = (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => {
    updateDraft(bundle.manifest.id, patch);
    queueMicrotask(refreshContributionPreview);
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Contribution Mode</h2>
          <p className="text-sm text-slate-400">Local draft changes are merged into the current universe preview.</p>
        </div>
        <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={() => resetDraft(bundle.manifest.id)} type="button">
          Reset draft
        </button>
      </div>

      <textarea
        className="min-h-24 rounded bg-slate-950 p-3 text-sm text-slate-200"
        onChange={(event) => patchDraft({ notes: event.target.value })}
        placeholder="Contributor notes"
        value={draft.notes}
      />

      <LocationEditor draft={draft} onChange={(locations) => patchDraft({ locations })} />
      <EdgeEditor draft={draft} onChange={(edges) => patchDraft({ edges })} />
      <ActionEditor draft={draft} onChange={(actions) => patchDraft({ actions })} />
      <SkillEditor draft={draft} onChange={(skills) => patchDraft({ skills })} />
      <LocaleEditor draft={draft} locale={bundle.manifest.locales[0] ?? 'en'} onChange={(locales) => patchDraft({ locales })} />
      <LocalUniverseManager bundle={bundle} />

      <section className="grid gap-2 rounded border border-slate-700 p-3">
        <h3 className="text-sm font-semibold text-slate-100">Validation</h3>
        {validationIssues.length === 0 ? (
          <p className="text-sm text-emerald-300">No validation issues.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {validationIssues.map((issue) => (
              <li className={issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'} key={`${issue.path}-${issue.message}`}>
                {issue.severity}: {issue.path} - {issue.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SubmitToGitHub appVersion="0.1.0" draft={draft} validationIssues={validationIssues} />
    </section>
  );
};
