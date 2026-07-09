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
    <section className="grid h-full grid-rows-[1fr] gap-0 overflow-hidden" data-testid="edit-mode">
      <div className="min-h-0 overflow-y-auto">
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
          <div className="p-4">
            <ContributionMapEditor
              bundle={bundle}
              onActionsChange={(actions) => onMapPatch({ actions })}
              onEntitiesChange={(entities) => onMapPatch({ entities })}
              onLocationsChange={(locations) => onMapPatch({ locations })}
              onLocalesChange={(patch) => onMapPatch({ localePatch: patch })}
              t={t}
            />
          </div>
        )}

        {activeTab === 'submit' && (
          <div className="p-4 flex flex-col h-full">
            <SubmitToGitHub appVersion={appVersion} bundle={bundle} draft={draft} t={t} validationIssues={validationIssues} />
          </div>
        )}
      </div>
    </section>
  );
};
