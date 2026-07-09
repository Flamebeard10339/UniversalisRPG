import type { Translator } from '../../game/i18n';
import type { ContentBundle, ContributionDraft, EntityDefinition, GameAction, LocationNode, ValidationIssue } from '../../game/types';
import { useContributionState } from '../../stores/contributionState';
import { useUniverseState } from '../../stores/universeState';
import { ContributionContentTab } from './ContributionContentTab';
import { ContributionMapEditor } from './ContributionMapEditor';
import { SubmitToGitHub } from './SubmitToGitHub';

export type EditTab = 'content' | 'map' | 'submit';

export type MapPatch = {
  locations?: LocationNode[];
  actions?: GameAction[];
  entities?: EntityDefinition[];
  localePatch?: Record<string, string>;
};

type EditModeProps = {
  activeTab: EditTab;
  appVersion: string;
  bundle: ContentBundle;
  onMapPatch: (patch: MapPatch) => void;
  onTabChange: (tab: EditTab) => void;
  validationIssues: ValidationIssue[];
  t: Translator;
};

const emptyDraft = (universeId: string): ContributionDraft => ({
  universeId,
  updatedAt: Date.now(),
  notes: '',
  basePlayer: undefined,
  combatBalance: undefined,
  experienceCurve: undefined,
  experience: undefined,
  displayProfiles: undefined,
  ui: undefined,
  modules: [],
  modulePacks: [],
  locations: [],
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

const editTabs: EditTab[] = ['content', 'map', 'submit'];

export const EditMode = ({ activeTab, appVersion, bundle, onMapPatch, onTabChange, validationIssues, t }: EditModeProps) => {
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
    <section className="grid gap-4" data-testid="edit-mode">
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

      <div className="flex gap-2 rounded border border-slate-800 bg-slate-900 p-2" data-testid="edit-mode-tabs">
        {editTabs.map((tab) => (
          <button
            className={`min-w-28 flex-1 rounded px-3 py-2 text-sm font-semibold capitalize ${
              activeTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-950 text-slate-300'
            }`}
            data-testid={`edit-mode-tab-${tab}`}
            key={tab}
            onClick={() => onTabChange(tab)}
            type="button"
          >
            {t(`contribution.tab.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === 'content' && (
        <ContributionContentTab
          baseBundle={baseBundle ?? bundle}
          bundle={bundle}
          draft={draft}
          issues={validationIssues}
          onPatch={patchDraft}
          t={t}
        />
      )}

      {activeTab === 'map' && (
        <ContributionMapEditor
          bundle={bundle}
          onActionsChange={(actions) => onMapPatch({ actions })}
          onEntitiesChange={(entities) => onMapPatch({ entities })}
          onLocationsChange={(locations) => onMapPatch({ locations })}
          onLocalesChange={(patch) => onMapPatch({ localePatch: patch })}
          t={t}
        />
      )}

      {activeTab === 'submit' && (
        <SubmitToGitHub appVersion={appVersion} bundle={bundle} draft={draft} t={t} validationIssues={validationIssues} />
      )}
    </section>
  );
};
