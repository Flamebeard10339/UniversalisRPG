import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, ValidationIssue } from '../../game/types';
import { useContributionState } from '../../stores/contributionState';
import { useUniverseState } from '../../stores/universeState';
import { ModuleEditor } from './ModuleEditor';

type ContributionModeProps = {
  activeTab: ContributionTab;
  bundle: ContentBundle;
  onTabChange: (tab: ContributionTab) => void;
  validationIssues: ValidationIssue[];
  t: Translator;
};

export type ContributionTab = 'content' | 'submit';

const emptyDraft = (universeId: string): ContributionDraft => ({
  universeId,
  updatedAt: Date.now(),
  notes: '',
  basePlayer: undefined,
  combatBalance: undefined,
  displayProfiles: undefined,
  ui: undefined,
  modules: [],
  modulePacks: [],
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
  dropTables: [],
  dialogues: [],
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
    dropTables: [],
    dialogues: [],
    modules: [],
  },
});

export const ContributionMode = ({ bundle, validationIssues, t }: ContributionModeProps) => {
  const draft = useContributionState((state) => state.drafts[bundle.manifest.id] ?? emptyDraft(bundle.manifest.id));
  const updateDraft = useContributionState((state) => state.updateDraft);
  const resetDraft = useContributionState((state) => state.resetDraft);
  const baseBundle = useUniverseState((state) => state.baseBundle);
  const manifests = useUniverseState((state) => state.manifests);
  const refreshContributionPreview = useUniverseState((state) => state.refreshContributionPreview);

  const patchDraft = (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => {
    updateDraft(bundle.manifest.id, patch);
    queueMicrotask(refreshContributionPreview);
  };

  const moveModule = (module: ContributionDraft['modules'][number], originalId: string, targetUniverseId: string) => {
    updateDraft(bundle.manifest.id, {
      modules: (draft.modules ?? []).filter((candidate) => candidate.id !== originalId && candidate.id !== module.id),
    });
    const targetDraft = useContributionState.getState().getDraft(targetUniverseId) ?? emptyDraft(targetUniverseId);
    updateDraft(targetUniverseId, {
      modules: [
        { ...module, universe: targetUniverseId },
        ...(targetDraft.modules ?? []).filter((candidate) => candidate.id !== originalId && candidate.id !== module.id),
      ],
    });
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

      <section className="grid gap-4">
        <ModuleEditor
          bundle={baseBundle ?? bundle}
          draft={draft}
          issues={validationIssues}
          onMoveModule={moveModule}
          onPatch={patchDraft}
          t={t}
          universeIds={manifests.map((manifest) => manifest.id)}
        />
      </section>
    </section>
  );
};
