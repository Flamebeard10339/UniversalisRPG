import { App as CapacitorApp } from '@capacitor/app';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActionDetails } from './components/ActionDetails';
import { FloatingSkillText } from './components/FloatingSkillText';
import { NameEditorModal } from './components/NameEditorModal';
import { ActionPanel } from './components/ActionPanel';
import { ChatPanel } from './components/ChatPanel';
import { MovementArrows } from './components/MovementArrows';
import { BankPanel } from './components/BankPanel';
import { CharacterStats } from './components/CharacterStats';
import { CollectionLogPanel } from './components/CollectionLogPanel';
import { QuestLogPanel } from './components/QuestLogPanel';
import { DialoguePanel } from './components/DialoguePanel';
import { InventoryPanel } from './components/InventoryPanel';
import { EditMode, type EditTab } from './components/contribution/EditMode';
import { ExamineButton } from './components/ExamineButton';
import { SkillBars } from './components/SkillBars';
import { TravelStatus } from './components/TravelStatus';
import { WorldMap } from './components/WorldMap';
import { StructuredDataEditor, type StructuredValue } from './components/structuredData/StructuredData';
import { modulePackSchema } from './components/structuredData/contentSchemas';
import { interactionTitleKey, itemTitleKey, locationExamineKey, locationTitleKey, resourceTitleKey, skillTitleKey, universeDescriptionKey, universeTitleKey } from './game/contentIds';
import { getActionTitleText } from './game/actionLocalization';
import {
  applyDisplayPalette,
  createCustomDisplayProfile,
  darkDisplayProfile,
  displayColorKeys,
  isLightPalette,
  lightDisplayProfile,
  profileTitleKey,
  resolveDisplayPalette,
} from './game/displayProfiles';
import { getInteractionType, isContinuousAction } from './game/adversarial';
import { compileAndCommitDslModule } from './game/contentDsl/applyModuleEdit';
import { executeChatInput, type CliRuntime } from './game/cli';
import type { ContentBundle, ContentModule, ContentModulePack, ContributionDraft, DisplayColorPalette, DisplayProfileDefinition, EntityDefinition, GameAction, IdleReport, LocationNode, UniversePlayState } from './game/types';
import { createModEditService, localContributionsModId } from './game/modEditService';
import { createDraftModStore } from './game/modStore';
import { getNextResourceBoundaryAt } from './game/resources';
import { aggregateIdleRewards } from './game/rewards';
import { findTravelPath } from './game/travel';
import { load, save } from './lib/storage';
import { useNow } from './hooks/useNow';
import { useDebugState } from './stores/debugState';
import { useContributionState } from './stores/contributionState';
import { useDslEditorState } from './stores/dslEditorState';
import { contributionRuntimeId } from './stores/contributionPlayState';
import { useGameState } from './stores/gameState';
import { useUniverseState } from './stores/universeState';
import { workingLocale } from './components/contribution/contributionLocalization';
import { createTestHarness, type ProfileFixture } from './game/testHarness';
import { domAdapter } from './game/testHarnessDom';

const getStartingLocationId = (bundle: NonNullable<ReturnType<typeof useUniverseState.getState>['bundle']>) =>
  bundle.locations.find((location) => location.starting)?.id ?? bundle.locations[0]?.id ?? '';

// Dev-only: fixtures for src/game/testHarness.ts's profile.load/save, so a saved
// profile can be committed and reused across sessions (see .playtests/profiles/).
// eager:true keeps this simple (small JSON files, dev-only, tree-shaken out of prod
// builds since the whole block is import.meta.env.DEV-gated at the call site).
const profileFixtureModules = import.meta.env.DEV
  ? import.meta.glob('/.playtests/profiles/*.json', { eager: true, import: 'default' })
  : {};

type AppTab = 'map' | 'home' | 'character' | 'settings' | 'edit';
type HomeTab = 'actions' | 'details';
type CharacterTab = 'skills' | 'inventory' | 'stats' | 'quests' | 'collectionLog';
type SettingsTab = 'settings' | 'mods';
type FontSizePreference = 'tiny' | 'small' | 'normal' | 'large' | 'huge';
type AppearanceSettings = {
  chatCompressionEnabled?: boolean;
  customDisplayProfile?: DisplayProfileDefinition;
  displayProfileSelections?: Record<string, string>;
  fontSize: FontSizePreference;
  showGui?: boolean;
  showTravelActions?: boolean;
  theme?: 'system' | 'dark' | 'light';
};
type ContributionUiSettings = {
  contributionMode?: boolean;
  contributionTab?: EditTab;
  homeTab?: HomeTab;
};
const APP_VERSION = '0.1.0';
const SOURCE_URL = 'https://github.com/Flamebeard10339/UniversalisRPG';
const appearanceKey = 'universalis:settings:appearance';
const contributionUiKey = 'universalis:settings:contribution-ui';
const editTabs: EditTab[] = ['content', 'map', 'submit'];
const homeTabs: HomeTab[] = ['actions', 'details'];
const emptyIdleReport: IdleReport = { kind: 'none' };
const emptyContributionDraft = (universeId: string): ContributionDraft => ({
  universeId, updatedAt: Date.now(), notes: '', basePlayer: undefined, combatBalance: undefined, experienceCurve: undefined, experience: undefined, displayProfiles: undefined, ui: undefined, modules: [], modulePacks: [], locations: [], actions: [], skills: [], stats: [], items: [], flags: [], resourceDefinitions: [], effects: [], interactionTypes: [], enemies: [], dropTables: [], dialogues: [], locales: {},
  removed: { locations: [], actions: [], skills: [], stats: [], items: [], flags: [], resources: [], effects: [], interactionTypes: [], enemies: [], dropTables: [], dialogues: [], modules: [] },
});
const colorInputClass = 'h-9 w-12 rounded border border-slate-700 bg-slate-900 p-1';

const uniqueById = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];

const packModuleIds = (pack: ContentModulePack): string[] => [
  ...(pack.modules ?? []),
  ...(pack.packs ?? []).flatMap(packModuleIds),
];

const encodeSave = (playState: UniversePlayState) =>
  btoa(unescape(encodeURIComponent(JSON.stringify(playState))));

const decodeSave = (value: string) =>
  JSON.parse(decodeURIComponent(escape(atob(value.trim())))) as UniversePlayState;

const formatDuration = (
  milliseconds: number,
  t: ReturnType<typeof useUniverseState.getState>['t'],
) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return t('time.duration.hoursMinutes', { hours, minutes });
  }

  if (minutes > 0) {
    return t('time.duration.minutesSeconds', { minutes, seconds });
  }

  return t('time.duration.seconds', { seconds });
};

export default function App() {
  const [contributionMode, setContributionMode] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [homeTab, setHomeTab] = useState<HomeTab>('actions');
  const [contributionTab, setContributionTab] = useState<EditTab>('content');
  const [characterTab, setCharacterTab] = useState<CharacterTab>('skills');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('settings');
  const [fontSizePreference, setFontSizePreference] = useState<FontSizePreference>('normal');
  const [chatCompressionEnabled, setChatCompressionEnabled] = useState(true);
  const [showTravelActions, setShowTravelActions] = useState(true);
  const [showGui, setShowGui] = useState(true);
  const [customDisplayProfile, setCustomDisplayProfile] = useState<DisplayProfileDefinition>(() => createCustomDisplayProfile());
  const [displayProfileSelections, setDisplayProfileSelections] = useState<Record<string, string>>({});
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const [contributionUiLoaded, setContributionUiLoaded] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogText, setChangelogText] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [mapFlashUntil, setMapFlashUntil] = useState(0);
  const discoveredLocationCountRef = useRef<number | null>(null);
  const [saveExport, setSaveExport] = useState('');
  const [saveImport, setSaveImport] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [idleReport, setIdleReport] = useState<IdleReport>(emptyIdleReport);
  const idleRewards = idleReport.kind === 'actionCompleted' ? aggregateIdleRewards(idleReport.rewards) : [];
  const [appActive, setAppActive] = useState(() => typeof document === 'undefined' || !document.hidden);
  const {
    activeUniverseId,
    bundle,
    manifests,
    validationIssues,
    baseBundle,
    loading,
    error,
    localePreference,
    enabledModules,
    moduleCleanupReport,
    clearModuleCleanupReport,
    initialize,
    setActiveUniverse,
    setEnabledModules,
    setLocalePreference,
    t,
  } = useUniverseState();
  const hydratePlayState = useGameState((state) => state.hydrate);
  const getUniverseState = useGameState((state) => state.getUniverseState);
  const gameStates = useGameState((state) => state.states);
  const travelTo = useGameState((state) => state.travelTo);
  const cancelTravel = useGameState((state) => state.cancelTravel);
  const startAction = useGameState((state) => state.startAction);
  const stopAction = useGameState((state) => state.stopAction);
  const chooseDialogueOption = useGameState((state) => state.chooseDialogueOption);
  const cancelDialogue = useGameState((state) => state.cancelDialogue);
  const equipItem = useGameState((state) => state.equipItem);
  const unequipSlot = useGameState((state) => state.unequipSlot);
  const eatItem = useGameState((state) => state.eatItem);
  const dropInventoryItem = useGameState((state) => state.dropInventoryItem);
  const pickUpGroundItem = useGameState((state) => state.pickUpGroundItem);
  const depositToBank = useGameState((state) => state.depositToBank);
  const withdrawFromBank = useGameState((state) => state.withdrawFromBank);
  const setCharacterName = useGameState((state) => state.setCharacterName);
  const closeModal = useGameState((state) => state.closeModal);
  const resolveIdle = useGameState((state) => state.resolveIdle);
  const markInactive = useGameState((state) => state.markInactive);
  const appendSystemMessage = useGameState((state) => state.appendSystemMessage);
  const appendChatText = useGameState((state) => state.appendChatText);
  const importUniverseState = useGameState((state) => state.importUniverseState);
  const replaceUniverseState = useGameState((state) => state.replaceUniverseState);
  const resetUniverse = useGameState((state) => state.resetUniverse);
  const sanitizeForBundle = useGameState((state) => state.sanitizeForBundle);
  const recordRunEvent = useGameState((state) => state.recordRunEvent);
  const clearRunLog = useGameState((state) => state.clearRunLog);
  const setCurrentLocation = useGameState((state) => state.setCurrentLocation);
  const debugSetFlag = useGameState((state) => state.debugSetFlag);
  const debugSetResource = useGameState((state) => state.debugSetResource);
  const debugSetSkillXp = useGameState((state) => state.debugSetSkillXp);
  const debugSetInventoryItem = useGameState((state) => state.debugSetInventoryItem);
  const debugGiveItem = useGameState((state) => state.debugGiveItem);
  const debugSetBankItem = useGameState((state) => state.debugSetBankItem);
  const debugEnabled = useDebugState((state) => state.enabled);
  const debugEntries = useDebugState((state) => state.entries);
  const hydrateDebug = useDebugState((state) => state.hydrate);
  const setDebugEnabled = useDebugState((state) => state.setEnabled);
  const logAction = useDebugState((state) => state.logAction);
  const clearDebugLog = useDebugState((state) => state.clear);
  const contributionDrafts = useContributionState((state) => state.drafts);
  const updateContributionDraft = useContributionState((state) => state.updateDraft);
  const refreshContributionPreview = useUniverseState((state) => state.refreshContributionPreview);
  const actionTitleFor = (actionId?: string) => {
    if (!bundle || !actionId) {
      return actionId ?? '';
    }
    const action = bundle.actions.find((candidate) => candidate.id === actionId);
    return action ? getActionTitleText(action, bundle, t) : actionId;
  };

  useEffect(() => {
    void initialize();
    void hydrateDebug();
  }, [hydrateDebug, initialize]);

  useEffect(() => {
    void load<AppearanceSettings>(appearanceKey).then((settings) => {
      if (!settings) {
        setAppearanceLoaded(true);
        return;
      }
      setFontSizePreference(settings.fontSize ?? 'normal');
      setChatCompressionEnabled(settings.chatCompressionEnabled ?? true);
      setShowTravelActions(settings.showTravelActions ?? true);
      setShowGui(settings.showGui ?? true);
      setCustomDisplayProfile(settings.customDisplayProfile ?? createCustomDisplayProfile());
      setDisplayProfileSelections(settings.displayProfileSelections ?? {});
      setAppearanceLoaded(true);
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.fontSize = fontSizePreference;
    if (bundle) {
      const selectedProfileId = displayProfileSelections[bundle.manifest.id] ?? bundle.manifest.displayProfiles?.[0]?.id ?? darkDisplayProfile.id;
      const palette = resolveDisplayPalette(bundle.manifest, selectedProfileId, customDisplayProfile);
      document.documentElement.dataset.theme = isLightPalette(palette) ? 'light' : 'dark';
      applyDisplayPalette(palette);
    }
    if (!appearanceLoaded) return;
    void save(appearanceKey, {
      chatCompressionEnabled,
      customDisplayProfile,
      displayProfileSelections,
      fontSize: fontSizePreference,
      showGui,
      showTravelActions,
    });
  }, [appearanceLoaded, bundle, chatCompressionEnabled, customDisplayProfile, displayProfileSelections, fontSizePreference, showGui, showTravelActions]);

  useEffect(() => {
    if (!appearanceLoaded || !bundle || displayProfileSelections[bundle.manifest.id]) {
      return;
    }

    setDisplayProfileSelections((selections) => ({
      ...selections,
      [bundle.manifest.id]: bundle.manifest.displayProfiles?.[0]?.id ?? darkDisplayProfile.id,
    }));
  }, [appearanceLoaded, bundle, displayProfileSelections]);

  useEffect(() => {
    void load<ContributionUiSettings>(contributionUiKey).then((settings) => {
      if (!settings) {
        setContributionUiLoaded(true);
        return;
      }
      setContributionMode(Boolean(settings.contributionMode));
      if (settings.homeTab && homeTabs.includes(settings.homeTab)) setHomeTab(settings.homeTab);
      setContributionTab(settings.contributionTab && editTabs.includes(settings.contributionTab) ? settings.contributionTab : 'content');
      setContributionUiLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!contributionUiLoaded) return;
    void save(contributionUiKey, { contributionMode, homeTab, contributionTab });
  }, [contributionMode, contributionTab, contributionUiLoaded, homeTab]);

  useEffect(() => {
    if (!showChangelog || changelogText) {
      return;
    }

    void fetch('/changelog.txt')
      .then((response) => response.text())
      .then(setChangelogText)
      .catch(() => setChangelogText(t('dialog.changelogUnavailable')));
  }, [changelogText, showChangelog]);

  const startingLocationId = useMemo(() => (bundle ? getStartingLocationId(bundle) : ''), [bundle]);
  const activeBundleId = bundle?.manifest.id;
  const selectedDisplayProfileId = bundle
    ? displayProfileSelections[bundle.manifest.id] ?? bundle.manifest.displayProfiles?.[0]?.id ?? darkDisplayProfile.id
    : darkDisplayProfile.id;
  const currentPalette = bundle ? resolveDisplayPalette(bundle.manifest, selectedDisplayProfileId, customDisplayProfile) : darkDisplayProfile.colors;
  const customPalette = bundle ? resolveDisplayPalette(bundle.manifest, 'custom', customDisplayProfile) : darkDisplayProfile.colors;
  const displayProfileOptions = bundle
    ? [
        lightDisplayProfile,
        darkDisplayProfile,
        ...(bundle.manifest.displayProfiles ?? []),
        { id: 'custom', titleKey: 'settings.displayProfile.custom' },
      ]
    : [];
  const runtimeUniverseId = bundle ? (contributionMode ? contributionRuntimeId(bundle.manifest.id) : bundle.manifest.id) : '';
  const onExamine = (text: string) => appendChatText(runtimeUniverseId, text);
  const actionContext = useMemo(() => ({
    manifest: bundle?.manifest,
    actions: bundle?.actions ?? [],
    skills: bundle?.skills ?? [],
    stats: bundle?.stats ?? [],
    locations: bundle?.locations ?? [],
    entities: bundle?.entities ?? [],
    items: bundle?.items ?? [],
    flags: bundle?.flags ?? [],
    resourceDefinitions: bundle?.resourceDefinitions ?? [],
    effects: bundle?.effects ?? [],
    interactionTypes: bundle?.interactionTypes ?? [],
    enemies: bundle?.enemies ?? [],
    dropTables: bundle?.dropTables ?? [],
    dialogues: bundle?.dialogues ?? [],
    recipes: bundle?.recipes ?? [],
    statModifiers: bundle?.statModifiers ?? [],
  }), [bundle]);
  const playState = bundle ? gameStates[runtimeUniverseId] ?? getUniverseState(runtimeUniverseId, startingLocationId, { manifest: bundle.manifest }) : null;
  const copySelectedProfileToCustom = () => {
    if (!bundle) return;
    setCustomDisplayProfile({
      id: 'custom',
      colors: currentPalette,
    });
    setDisplayProfileSelections((selections) => ({
      ...selections,
      [bundle.manifest.id]: 'custom',
    }));
  };
  const updateCustomColor = (key: keyof DisplayColorPalette, value: string) => {
    if (bundle && selectedDisplayProfileId !== 'custom') {
      setDisplayProfileSelections((selections) => ({
        ...selections,
        [bundle.manifest.id]: 'custom',
      }));
    }
    setCustomDisplayProfile((profile) => ({
      ...profile,
      colors: {
        ...(profile.colors ?? {}),
        [key]: value,
      },
    }));
  };
  const openThemeEditor = (open: boolean) => {
    setThemeEditorOpen(open);
    if (open && selectedDisplayProfileId !== 'custom') {
      copySelectedProfileToCustom();
    }
  };
  const copyCurrentThemeJson = () => {
    const themeJson = {
      id: 'custom',
      colors: customPalette,
    } satisfies DisplayProfileDefinition;
    void navigator.clipboard.writeText(JSON.stringify(themeJson, null, 2));
  };
  const currentLocation = bundle?.locations.find((location) => location.id === playState?.currentLocationId);
  const activeModuleIds = bundle ? new Set(enabledModules[bundle.manifest.id] ?? bundle.modules?.map((module) => module.id) ?? []) : new Set<string>();
  const moduleById = new Map((bundle?.modules ?? []).map((module) => [module.id, module]));
  const packedModuleIds = new Set((bundle?.modulePacks ?? []).flatMap(packModuleIds));
  const unpackedSettingModules = (bundle?.modules ?? []).filter((module) => !packedModuleIds.has(module.id));
  const toggleModule = (moduleId: string, enabled: boolean) => {
    if (!bundle) return;
    const next = new Set(activeModuleIds);
    if (enabled) next.add(moduleId);
    else next.delete(moduleId);
    void setEnabledModules(bundle.manifest.id, [...next]);
  };
  const renderModuleToggle = (module: ContentModule, key = module.id) => (
    <label className="flex items-center justify-between gap-4 rounded bg-slate-900 p-2" key={key}>
      <span>
        <span className="block text-sm font-semibold text-slate-100">{module.id}</span>
        <span className="block text-xs text-slate-400">{module.version} / {module.author}</span>
      </span>
      <input
        checked={activeModuleIds.has(module.id)}
        className="h-5 w-5"
        onChange={(event) => toggleModule(module.id, event.target.checked)}
        type="checkbox"
      />
    </label>
  );
  const renderModulePack = (pack: ContentModulePack, path = pack.id): JSX.Element | null => {
    const packModules = (pack.modules ?? [])
      .map((moduleId) => moduleById.get(moduleId))
      .filter((module): module is ContentModule => Boolean(module));
    const childPacks = (pack.packs ?? [])
      .map((childPack) => renderModulePack(childPack, `${path}/${childPack.id}`))
      .filter((packElement): packElement is JSX.Element => Boolean(packElement));

    if (packModules.length === 0 && childPacks.length === 0) {
      return null;
    }

    return (
      <section className="grid gap-2 rounded border border-slate-800 bg-slate-900/60 p-2" key={path}>
        <h4 className="text-xs font-semibold uppercase text-slate-500">{pack.titleKey ? t(pack.titleKey, pack.id) : pack.id}</h4>
        {packModules.map((module) => renderModuleToggle(module, `${path}/${module.id}`))}
        {childPacks.length > 0 && <div className="grid gap-2 border-l border-slate-700 pl-2">{childPacks}</div>}
      </section>
    );
  };
  const moduleCleanupItems = moduleCleanupReport
    ? [
        ...moduleCleanupReport.removedInventoryIds.map((id) => t('settings.modules.cleanup.inventory', { id })),
        ...moduleCleanupReport.removedEquipmentItemIds.map((id) => t('settings.modules.cleanup.equipment', { id })),
        ...moduleCleanupReport.removedSkillIds.map((id) => t('settings.modules.cleanup.skill', { id })),
        ...moduleCleanupReport.removedStatIds.map((id) => t('settings.modules.cleanup.stat', { id })),
        ...moduleCleanupReport.removedResourceIds.map((id) => t('settings.modules.cleanup.resource', { id })),
        ...moduleCleanupReport.removedFlagIds.map((id) => t('settings.modules.cleanup.flag', { id })),
        ...moduleCleanupReport.removedActionIds.map((id) => t('settings.modules.cleanup.action', { id })),
        ...moduleCleanupReport.removedLocationIds.map((id) => t('settings.modules.cleanup.location', { id })),
        moduleCleanupReport.cancelledActionId ? t('settings.modules.cleanup.cancelledAction', { id: moduleCleanupReport.cancelledActionId }) : null,
        moduleCleanupReport.cancelledTravelActionId ? t('settings.modules.cleanup.cancelledTravel', { id: moduleCleanupReport.cancelledTravelActionId }) : null,
        moduleCleanupReport.cancelledDialogueId ? t('settings.modules.cleanup.cancelledDialogue', { id: moduleCleanupReport.cancelledDialogueId }) : null,
        moduleCleanupReport.cancelledDialogueNodeId ? t('settings.modules.cleanup.cancelledDialogueNode', { id: moduleCleanupReport.cancelledDialogueNodeId }) : null,
        moduleCleanupReport.relocatedToLocationId ? t('settings.modules.cleanup.relocated', { id: moduleCleanupReport.relocatedToLocationId }) : null,
      ].filter((item): item is string => Boolean(item))
    : [];
  const activeAction = bundle?.actions.find((action) => action.id === playState?.activeAction?.actionId) ?? null;
  const activeInteractionType = activeAction ? getInteractionType(activeAction, actionContext) : null;
  const currentContributionDraft = bundle ? contributionDrafts[bundle.manifest.id] ?? emptyContributionDraft(bundle.manifest.id) : null;
  const patchContributionDraft = (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => {
    if (!bundle) return;
    updateContributionDraft(bundle.manifest.id, patch);
    queueMicrotask(refreshContributionPreview);
  };
  const patchLocalMapModule = (patch: { locations?: LocationNode[]; actions?: GameAction[]; entities?: EntityDefinition[]; localePatch?: Record<string, string> }) => {
    if (!bundle) return;
    const latestDraft = useContributionState.getState().getDraft(bundle.manifest.id) ?? currentContributionDraft ?? emptyContributionDraft(bundle.manifest.id);
    const service = createModEditService({
      resolvedBundle: bundle,
      store: createDraftModStore(latestDraft, patchContributionDraft),
    });
    const targetModId = (baseBundle ?? bundle).modules?.some((module) => module.id === 'base-core') ? 'base-core' : (baseBundle ?? bundle).manifest.id;
    const saveList = <T extends { id: string }>(objectType: string, previousItems: T[], nextItems: T[]) => {
      const previousById = new Map(previousItems.map((item) => [item.id, item]));
      const nextById = new Map(nextItems.map((item) => [item.id, item]));
      for (const item of nextItems) {
        const previous = previousById.get(item.id);
        const ops = previous ? service.diffEdit(previous, item) : [{ op: 'add' as const, path: '', value: item }];
        if (ops.length > 0) service.saveEdit(targetModId, objectType, item.id, ops);
      }
      for (const item of previousItems) {
        if (!nextById.has(item.id)) service.saveEdit(targetModId, objectType, item.id, [{ op: 'remove', path: '' }]);
      }
    };

    saveList('locations', bundle.locations, patch.locations ?? bundle.locations);
    saveList('actions', bundle.actions, patch.actions ?? bundle.actions);
    saveList('entities', bundle.entities ?? [], patch.entities ?? (bundle.entities ?? []));
    if (patch.localePatch && Object.keys(patch.localePatch).length > 0) {
      patchContributionDraft({
        locales: {
          ...latestDraft.locales,
          [workingLocale(bundle, localePreference)]: {
            ...(latestDraft.locales[workingLocale(bundle, localePreference)] ?? {}),
            ...patch.localePatch,
          },
        },
      });
    }

    const latestActiveModuleIds = new Set(useUniverseState.getState().enabledModules[bundle.manifest.id] ?? bundle.modules?.map((module) => module.id) ?? []);
    if (!latestActiveModuleIds.has(localContributionsModId)) {
      void setEnabledModules(bundle.manifest.id, [...latestActiveModuleIds, localContributionsModId]);
    }
  };
  const logPlayerAction = (event: string, data?: Record<string, unknown>) => {
    logAction(event, data);
    if (bundle) recordRunEvent(runtimeUniverseId, 'player', event, data);
  };
  const dismissDialogue = () => {
    if (playState?.activeDialogue) cancelDialogue(runtimeUniverseId);
  };
  const beginAction = (action: (typeof actionContext.actions)[number], recipeId?: string) => {
    if (!bundle) return;
    logPlayerAction('action.start', {
      actionId: action.id,
      locationId: action.locationId,
      universeId: bundle.manifest.id,
      recipeId,
    });
    startAction(runtimeUniverseId, action, actionContext, recipeId);
    if (isContinuousAction(action, actionContext) && playState?.activeAction?.actionId !== action.id) {
      setActiveTab('home');
      setHomeTab('details');
    }
  };

  const runCliCommand = (text: string) => {
    if (!bundle || !playState) return;
    const runtime: CliRuntime = {
      getBundle: () => bundle,
      getPlayState: () => playState,
      getActionContext: () => actionContext,
      getTranslator: () => t,
      isDebugEnabled: () => debugEnabled,
      appendMessage: (message, author = 'system') => appendChatText(runtimeUniverseId, message, author),
      startAction: (actionId, recipeId) => {
        const action = bundle.actions.find((candidate) => candidate.id === actionId);
        if (action) beginAction(action, recipeId);
      },
      chooseDialogueOption: (optionId) => chooseDialogueOption(runtimeUniverseId, actionContext, optionId),
      equipItem: (itemId, slot) => equipItem(runtimeUniverseId, itemId, slot, actionContext),
      unequipSlot: (slot) => unequipSlot(runtimeUniverseId, slot, actionContext),
      eatItem: (itemId) => eatItem(runtimeUniverseId, itemId, actionContext),
      dropInventoryItem: (itemId) => dropInventoryItem(runtimeUniverseId, itemId, actionContext),
      pickUpGroundItem: (groundItemId) => pickUpGroundItem(runtimeUniverseId, groundItemId, actionContext),
      travelTo: (path) => travelTo(runtimeUniverseId, path),
      changeSetting: (key, value) => {
        if (key !== 'show-gui') {
          return { ok: false, message: t('cli.changeSetting.unknownKey', 'Unknown setting: {key}', { key }) };
        }
        const normalized = value.trim().toLowerCase();
        if (normalized !== 'true' && normalized !== 'false') {
          return { ok: false, message: t('cli.changeSetting.invalidValue', 'Invalid value for {key}: {value}', { key, value }) };
        }
        const nextValue = normalized === 'true';
        if (!nextValue) {
          appendChatText(runtimeUniverseId, t('cli.showGui.disabled', 'You have disabled the GUI. To re-enable it, type /change-setting show-gui true'));
        }
        setShowGui(nextValue);
        return { ok: true, message: '' };
      },
      debugGiveItem: (itemId, amount) => debugGiveItem(runtimeUniverseId, actionContext, itemId, amount),
      debugSetFlag: (flagId, value) => debugSetFlag(runtimeUniverseId, flagId, value),
      debugSetSkillXp: (skillId, xp) => debugSetSkillXp(runtimeUniverseId, skillId, xp),
      teleport: (locationId) => setCurrentLocation(runtimeUniverseId, locationId),
    };
    executeChatInput(text, runtime);
  };
  const nextTimerAt = bundle && playState
    ? [
        playState.activeTravel?.completesAt,
        activeAction && !isContinuousAction(activeAction, actionContext) ? playState.activeAction?.completesAt : undefined,
        getNextResourceBoundaryAt(bundle, playState),
      ]
        .filter((time): time is number => typeof time === 'number')
        .sort((a, b) => a - b)[0]
    : undefined;
  const beginTravel = (locationId: string) => {
    logPlayerAction('map.nodeClick', {
      locationId,
      currentLocationId: playState?.currentLocationId,
      activeTravel: Boolean(playState?.activeTravel),
    });

    if (!bundle || !playState || playState.activeTravel || locationId === playState.currentLocationId) {
      return;
    }

    const path = findTravelPath(playState, actionContext, locationId);

    if (path.status === 'found' && path.edges.length > 0) {
      logPlayerAction('travel.start', {
        actionIds: path.edges.map((edge) => edge.action.id),
        fromLocationId: playState.currentLocationId,
        toLocationId: locationId,
      });
      travelTo(runtimeUniverseId, path.edges);
    } else if (path.status === 'too-far') {
      logPlayerAction('travel.tooFar', {
        fromLocationId: playState.currentLocationId,
        toLocationId: locationId,
      });
      appendSystemMessage(runtimeUniverseId, 'chat.travelPathTooFar');
    } else {
      logPlayerAction('travel.noEdge', {
        fromLocationId: playState.currentLocationId,
        toLocationId: locationId,
      });
    }
  };

  const setTab = (tab: AppTab) => {
    logPlayerAction('navigation.tab', { tab });
    setActiveTab(tab);
  };

  const setHomeTopTab = (tab: HomeTab) => {
    logPlayerAction('navigation.homeTab', { tab });
    setHomeTab(tab);
  };

  const setCharacterTopTab = (tab: CharacterTab) => {
    logPlayerAction('navigation.characterTab', { tab });
    setCharacterTab(tab);
  };

  const exportSave = async () => {
    if (!playState) {
      return;
    }

    setSaveExport(encodeSave(playState));
    setSaveMessage(t('settings.save.exported'));
    await navigator.clipboard.writeText(encodeSave(playState));
  };

  const importSave = async () => {
    if (!bundle) {
      return;
    }

    try {
      const imported = decodeSave(saveImport);
      if (imported.universeId !== bundle.manifest.id) {
        setSaveMessage(t('settings.save.importWrongUniverse', { source: imported.universeId, target: bundle.manifest.id }));
        return;
      }
      if (contributionMode) await replaceUniverseState(runtimeUniverseId, imported);
      else await importUniverseState(imported);
      setSaveMessage(t('settings.save.imported'));
      setSaveImport('');
    } catch {
      setSaveMessage(t('settings.save.importFailed'));
    }
  };

  const resetActiveUniverse = async () => {
    if (!bundle) {
      return;
    }

    await resetUniverse(runtimeUniverseId, startingLocationId, { manifest: bundle.manifest });
    setConfirmReset(false);
    setSaveMessage(t('settings.save.resetComplete'));
  };

  const showIdleReport = (report: IdleReport) => {
    if (report.kind !== 'none') {
      setIdleReport(report);
    }
  };

  useEffect(() => {
    if (bundle && runtimeUniverseId && startingLocationId) {
      const manifest = bundle.manifest;
      void hydratePlayState(runtimeUniverseId, startingLocationId, { manifest }).then(() => {
        const currentBundle = useUniverseState.getState().bundle;

        if (!currentBundle || currentBundle.manifest.id !== activeBundleId) {
          return;
        }

        const report = useGameState.getState().resolveIdle(runtimeUniverseId, {
          manifest: currentBundle.manifest,
          actions: currentBundle.actions,
          skills: currentBundle.skills,
          stats: currentBundle.stats,
          locations: currentBundle.locations,
          entities: currentBundle.entities,
          items: currentBundle.items,
          flags: currentBundle.flags,
          resourceDefinitions: currentBundle.resourceDefinitions,
          effects: currentBundle.effects,
          interactionTypes: currentBundle.interactionTypes,
          enemies: currentBundle.enemies,
          dropTables: currentBundle.dropTables,
          dialogues: currentBundle.dialogues,
        }, {
          debugEnabled: useDebugState.getState().enabled,
          showReport: true,
        });
        showIdleReport(report);
      });
    }
  }, [activeBundleId, bundle, hydratePlayState, runtimeUniverseId, startingLocationId]);

  useEffect(() => {
    if (!bundle || !runtimeUniverseId || !startingLocationId) return;
    sanitizeForBundle(runtimeUniverseId, bundle, startingLocationId);
  }, [bundle, runtimeUniverseId, sanitizeForBundle, startingLocationId]);

  useEffect(() => {
    if (!import.meta.env.DEV || !bundle || !runtimeUniverseId || !startingLocationId) return undefined;

    window.__test = createTestHarness({
      getBundle: () => bundle,
      getPlayState: () => useGameState.getState().states[runtimeUniverseId],
      getActionContext: () => actionContext,
      getRuntimeUniverseId: () => runtimeUniverseId,
      getStartingLocationId: () => startingLocationId,
      getTranslator: () => t,
      // Unlike getPlayState (backed by Zustand's synchronous getState()), tab state
      // is plain React useState, so this closure only reflects the last committed
      // render — calling nav.setTab(...) then getTabs() in the SAME synchronous
      // script can read one tick stale; a separate follow-up call always sees the
      // update. Not worth moving tab state into the store just for this.
      getTabs: () => ({ activeTab, homeTab, characterTab }),
      dom: domAdapter,

      setTab: (tab) => setTab(tab as AppTab),
      setHomeTab: (tab) => setHomeTopTab(tab as HomeTab),
      setCharacterTab: (tab) => setCharacterTopTab(tab as CharacterTab),

      startAction: (action, context, recipeId) => startAction(runtimeUniverseId, action, context, recipeId),
      stopAction: (context) => stopAction(runtimeUniverseId, context),
      chooseDialogueOption: (context, optionId) => chooseDialogueOption(runtimeUniverseId, context, optionId),
      cancelDialogue: () => cancelDialogue(runtimeUniverseId),
      resolveIdle: (context, options, now) => resolveIdle(runtimeUniverseId, context, options, now),
      setCurrentLocation: (locationId) => setCurrentLocation(runtimeUniverseId, locationId),
      equipItem: (itemId, slot, context) => equipItem(runtimeUniverseId, itemId, slot, context),
      unequipSlot: (slot, context) => unequipSlot(runtimeUniverseId, slot, context),
      eatItem: (itemId, context) => eatItem(runtimeUniverseId, itemId, context),
      dropInventoryItem: (itemId, context) => dropInventoryItem(runtimeUniverseId, itemId, context),
      pickUpGroundItem: (groundItemId, context) => pickUpGroundItem(runtimeUniverseId, groundItemId, context),
      depositToBank: (context, itemId, amount) => depositToBank(runtimeUniverseId, context, itemId, amount),
      withdrawFromBank: (context, itemId, amount) => withdrawFromBank(runtimeUniverseId, context, itemId, amount),
      closeModal: () => closeModal(runtimeUniverseId),
      replaceUniverseState: (state) => replaceUniverseState(runtimeUniverseId, state),
      resetUniverse: () => resetUniverse(runtimeUniverseId, startingLocationId, { manifest: bundle.manifest }),
      debugSetFlag: (flagId, value) => debugSetFlag(runtimeUniverseId, flagId, value),
      debugSetResource: (resourceId, current) => debugSetResource(runtimeUniverseId, resourceId, current),
      debugSetSkillXp: (skillId, xp) => debugSetSkillXp(runtimeUniverseId, skillId, xp),
      debugSetInventoryItem: (itemId, amount) => debugSetInventoryItem(runtimeUniverseId, itemId, amount),
      debugGiveItem: (context, itemId, amount) => debugGiveItem(runtimeUniverseId, context, itemId, amount),
      debugSetBankItem: (itemId, amount) => debugSetBankItem(runtimeUniverseId, itemId, amount),

      listProfileNames: () => Object.keys(profileFixtureModules).map((path) =>
        path.replace(/^.*\/profiles\//, '').replace(/\.json$/, '')),
      loadProfileFixture: (name) => {
        const key = Object.keys(profileFixtureModules).find((path) => path.endsWith(`/profiles/${name}.json`));
        return key ? (profileFixtureModules[key] as ProfileFixture) : null;
      },

      getContributionMode: () => contributionMode,
      setContributionMode: (enabled) => setContributionMode(enabled),
      getContributionTab: () => contributionTab,
      setContributionTab: (tab) => setContributionTab(tab as EditTab),
      getEnabledModuleIds: () => [...activeModuleIds],
      setModuleEnabled: async (moduleId, enabled) => {
        const requested = new Set(useUniverseState.getState().enabledModules[bundle.manifest.id] ?? bundle.modules?.map((module) => module.id) ?? []);
        if (enabled) requested.add(moduleId);
        else requested.delete(moduleId);
        await setEnabledModules(bundle.manifest.id, [...requested]);
        return { enabledModuleIds: useUniverseState.getState().enabledModules[bundle.manifest.id] ?? [] };
      },
      getValidationIssues: () => useUniverseState.getState().validationIssues,

      getDslDraft: (moduleId) => {
        const draft = useDslEditorState.getState().getDraft(moduleId);
        if (!draft) return null;
        return { baselineSource: draft.baselineSource, source: draft.source, lastValidSource: draft.lastValidSource, updatedAt: draft.updatedAt };
      },
      setDslSource: (moduleId, source) => {
        if (!useDslEditorState.getState().getDraft(moduleId)) useDslEditorState.getState().openDraft(moduleId, source);
        useDslEditorState.getState().setSource(moduleId, source);
      },
      applyDslEdit: (moduleId, source) => {
        const latestDraft = useContributionState.getState().getDraft(bundle.manifest.id) ?? currentContributionDraft ?? emptyContributionDraft(bundle.manifest.id);
        return compileAndCommitDslModule(moduleId, source, latestDraft.modules ?? [], patchContributionDraft);
      },
    });

    return () => {
      delete window.__test;
    };
  }, [
    actionContext, bundle, cancelDialogue, characterTab, chooseDialogueOption, closeModal, debugGiveItem,
    debugSetBankItem, debugSetFlag, debugSetInventoryItem, debugSetResource, debugSetSkillXp, depositToBank,
    dropInventoryItem, eatItem, equipItem, homeTab, activeTab, pickUpGroundItem, replaceUniverseState, resetUniverse,
    resolveIdle, runtimeUniverseId, setCharacterTopTab, setCurrentLocation, setHomeTopTab, setTab, startAction,
    startingLocationId, stopAction, t, unequipSlot, withdrawFromBank,
    activeModuleIds, contributionMode, contributionTab, currentContributionDraft, patchContributionDraft,
    setContributionMode, setContributionTab, setEnabledModules,
  ]);

  useEffect(() => {
    if (!bundle) {
      return undefined;
    }

    const universeId = runtimeUniverseId;
    const markAway = () => {
      setAppActive(false);
      markInactive(universeId);
    };
    const resolveReturn = () => {
      setAppActive(true);
      const report = resolveIdle(universeId, actionContext, {
        debugEnabled,
        showReport: true,
      });
      showIdleReport(report);
    };
    const appStateHandle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        resolveReturn();
      } else {
        markAway();
      }
    });

    const handleVisibilityChange = () => {
      if (document.hidden) {
        markAway();
      } else {
        resolveReturn();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', markAway);
    window.addEventListener('pageshow', resolveReturn);

    return () => {
      void appStateHandle.then((handle) => handle.remove());
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', markAway);
      window.removeEventListener('pageshow', resolveReturn);
    };
  }, [actionContext, bundle, debugEnabled, markInactive, resolveIdle, runtimeUniverseId]);

  useEffect(() => {
    if (!appActive || !bundle || !playState) {
      return undefined;
    }

    if (!nextTimerAt) {
      return undefined;
    }

    const timeout = window.setTimeout(
      () => {
        resolveIdle(runtimeUniverseId, actionContext, { debugEnabled });
      },
      Math.max(0, nextTimerAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [actionContext, appActive, bundle, debugEnabled, nextTimerAt, playState, resolveIdle, runtimeUniverseId]);

  useLayoutEffect(() => {
    if (!appActive || !bundle || !playState) {
      return;
    }

    if (nextTimerAt && nextTimerAt <= Date.now()) {
      resolveIdle(runtimeUniverseId, actionContext, { debugEnabled });
    }
  }, [actionContext, appActive, bundle, debugEnabled, nextTimerAt, playState, resolveIdle, runtimeUniverseId]);

  useEffect(() => {
    if (!playState) return;
    const count = playState.discoveredLocationIds.length;
    const previous = discoveredLocationCountRef.current;
    discoveredLocationCountRef.current = count;
    if (previous !== null && count > previous) {
      setMapFlashUntil(Date.now() + 1500);
    }
  }, [playState]);

  const mapFlashNow = useNow(mapFlashUntil > Date.now(), 100);

  if (loading && !bundle) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">{t('app.loadingUniverse')}</main>;
  }

  if (error || !bundle) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
        <section className="max-w-xl rounded border border-rose-800 bg-rose-950/30 p-5">
          <h1 className="text-lg font-semibold">{t('app.startErrorTitle')}</h1>
          <p className="mt-2 text-sm text-rose-100">{error ? t(error, error) : t('app.noPlayableUniverse')}</p>
        </section>
      </main>
    );
  }

  // A module error severe enough to leave no playable starting location
  // (e.g. a broken dependency cascade-disabling every tutorial-island
  // module) would otherwise block the *entire* app, including the one tool
  // that can fix it. If contribution mode is on, fall through to the Edit
  // tab instead — it only needs `bundle`/the draft, not a live `playState`.
  if (!playState) {
    if (contributionMode && currentContributionDraft) {
      return (
        <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
          <p className="mb-4 rounded border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-100">{t('app.noPlayableUniverse')}</p>
          <EditMode
            activeTab={contributionTab}
            appVersion={APP_VERSION}
            bundle={bundle}
            onMapPatch={patchLocalMapModule}
            onTabChange={setContributionTab}
            validationIssues={validationIssues}
            t={t}
          />
        </main>
      );
    }
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
        <section className="max-w-xl rounded border border-rose-800 bg-rose-950/30 p-5">
          <h1 className="text-lg font-semibold">{t('app.startErrorTitle')}</h1>
          <p className="mt-2 text-sm text-rose-100">{t('app.noPlayableUniverse')}</p>
        </section>
      </main>
    );
  }

  if (!showGui) {
    return (
      <main className="grid h-screen bg-slate-950 p-4 text-slate-100">
        <ChatPanel compressionEnabled={chatCompressionEnabled} messages={playState.chatMessages} onSend={runCliCommand} t={t} />
      </main>
    );
  }

  const visibleActiveTab = !currentLocation ? 'settings' : activeTab === 'edit' && !contributionMode ? 'home' : activeTab;

  return (
    <main className={`min-h-screen bg-slate-950 text-slate-100 ${visibleActiveTab === 'home' ? 'pb-[calc(33vh+6rem)]' : visibleActiveTab === 'edit' ? 'pb-24 flex flex-col' : 'pb-24'}`}>
      <header className={`${visibleActiveTab === 'edit' ? 'flex-shrink-0' : ''} border-b border-slate-800 bg-slate-900/70 px-4 py-3`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              {visibleActiveTab === 'settings'
                ? t('app.title')
                : visibleActiveTab === 'home' && currentLocation
                  ? t(locationTitleKey(currentLocation.id), currentLocation.id)
                  : `${t(`app.tab.${visibleActiveTab}`)}${visibleActiveTab === 'character' && playState.characterName ? ` - ${playState.characterName}` : ''}`}
            </h1>
            {visibleActiveTab === 'settings' && <p className="text-sm text-slate-400">{t(universeTitleKey(bundle.manifest.id))} - {t(universeDescriptionKey(bundle.manifest.id), '')}</p>}
          </div>
          {visibleActiveTab === 'home' && currentLocation && (
            <ExamineButton onExamine={onExamine} t={t} testId="examine-location" textKey={locationExamineKey(currentLocation.id)} />
          )}
          {visibleActiveTab === 'edit' && contributionMode && (
            <div className="flex items-center gap-2">
              <div className="flex gap-2 rounded border border-slate-700 bg-slate-950 p-1 justify-center flex-wrap">
                {editTabs.map((tab) => (
                  <button
                    className={`rounded px-4 py-2 text-sm font-semibold capitalize min-w-max sm:min-w-0 sm:flex-1 ${
                      contributionTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                    data-edit-mode-tab={tab}
                    key={tab}
                    onClick={() => setContributionTab(tab)}
                    type="button"
                  >
                    {t(`contribution.tab.${tab}`)}
                  </button>
                ))}
              </div>
              <button
                className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
                data-edit-reset-draft
                onClick={() => {
                  const resetFn = useContributionState.getState().resetDraft;
                  resetFn(bundle.manifest.id);
                  queueMicrotask(() => useUniverseState.getState().refreshContributionPreview());
                }}
                type="button"
              >
                {t('contribution.resetDraft')}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={`flex-1 overflow-hidden ${visibleActiveTab === 'edit' ? 'w-full px-4' : 'mx-auto max-w-7xl px-4 py-4'}`}>
        {visibleActiveTab === 'map' && (
          <section className="grid gap-4">
            <div className="grid h-[calc(100vh-150px)] min-h-[560px] grid-rows-[auto_1fr] gap-4">
              <TravelStatus
                activeTravel={playState.activeTravel}
                bundle={bundle}
                currentLocationId={playState.currentLocationId}
                onCancel={() => {
                  logPlayerAction('travel.cancel', { universeId: bundle.manifest.id });
                  cancelTravel(runtimeUniverseId);
                }}
                onExamine={onExamine}
                titleWhenIdle
                t={t}
              />
              <section className="min-h-0 overflow-hidden rounded border border-slate-800 bg-slate-900">
                <WorldMap
                  bundle={bundle}
                  onTravel={beginTravel}
                  playState={playState}
                  t={t}
                />
              </section>
            </div>
          </section>
        )}

        {visibleActiveTab === 'edit' && contributionMode && currentContributionDraft && (
          <div className="flex flex-col h-full">
            <EditMode
              activeTab={contributionTab}
              appVersion={APP_VERSION}
              bundle={bundle}
              onMapPatch={patchLocalMapModule}
              onTabChange={setContributionTab}
              validationIssues={validationIssues}
              t={t}
            />
          </div>
        )}

        {visibleActiveTab === 'home' && currentLocation && (
          <section className="grid gap-4">
            <div className="grid gap-4">
              {playState.activeTravel && (
                <TravelStatus activeTravel={playState.activeTravel} bundle={bundle} currentLocationId={playState.currentLocationId} t={t} />
              )}
              <div className="grid grid-flow-col auto-cols-fr gap-2 rounded border border-slate-800 bg-slate-900 p-2">
                {(['actions', 'details'] as HomeTab[]).map((tab) => (
                  <button
                    className={`min-w-0 rounded px-2 py-2 text-sm font-semibold capitalize ${
                      homeTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-950 text-slate-300'
                    }`}
                    data-home-tab={tab}
                    key={tab}
                    onClick={() => setHomeTopTab(tab)}
                    type="button"
                  >
                    {tab === 'details' && activeInteractionType
                      ? t(interactionTitleKey(activeInteractionType.id), t('home.tab.details'))
                      : t(`home.tab.${tab}`)}
                  </button>
                ))}
              </div>
            </div>

            {homeTab === 'actions' && (
              <section className="grid gap-4">
                <MovementArrows bundle={bundle} context={actionContext} onMove={beginTravel} playState={playState} t={t} />
                <section className="rounded border border-slate-800 bg-slate-900 p-4" data-testid="home-action-panel">
                  <ActionPanel
                    debugEnabled={debugEnabled}
                    bundle={bundle}
                    onPickUpGroundItem={(groundItemId) => pickUpGroundItem(runtimeUniverseId, groundItemId, actionContext)}
                    onStartAction={beginAction}
                    playState={playState}
                    showTravelActions={showTravelActions}
                    t={t}
                  />
                </section>
              </section>
            )}

            {homeTab === 'details' && (
              <ActionDetails
                bundle={bundle}
                onStopAction={() => {
                  logPlayerAction('action.stop', {
                    actionId: playState.activeAction?.actionId ?? '',
                    universeId: bundle.manifest.id,
                  });
                  stopAction(runtimeUniverseId, actionContext);
                }}
                playState={playState}
                t={t}
              />
            )}
          </section>
        )}

        {visibleActiveTab === 'character' && (
          <section className="grid gap-4">
            <div className="grid grid-cols-3 gap-2 rounded border border-slate-800 bg-slate-900 p-2">
              {(['skills', 'inventory', 'stats', 'quests', 'collectionLog'] as CharacterTab[]).map((tab) => (
                <button
                  className={`rounded px-3 py-2 text-sm font-semibold capitalize ${
                    characterTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-950 text-slate-300'
                  }`}
                  data-character-tab={tab}
                  key={tab}
                  onClick={() => setCharacterTopTab(tab)}
                  type="button"
                >
                  {t(`character.tab.${tab}`)}
                </button>
              ))}
            </div>

            {characterTab === 'skills' && (
              <section className="rounded border border-slate-800 bg-slate-900 p-4">
                <SkillBars bundle={bundle} onExamine={onExamine} playState={playState} t={t} />
              </section>
            )}

            {characterTab === 'inventory' && (
              <InventoryPanel
                bundle={bundle}
                onDrop={(itemId) => dropInventoryItem(runtimeUniverseId, itemId, actionContext)}
                onEat={(itemId) => eatItem(runtimeUniverseId, itemId, actionContext)}
                onEquip={(itemId, slot) => equipItem(runtimeUniverseId, itemId, slot, actionContext)}
                onStartAction={beginAction}
                onUnequip={(slot) => unequipSlot(runtimeUniverseId, slot, actionContext)}
                playState={playState}
                t={t}
              />
            )}

            {characterTab === 'stats' && (
              <CharacterStats
                bundle={bundle}
                onExamine={onExamine}
                playState={playState}
                t={t}
              />
            )}

            {characterTab === 'quests' && (
              <QuestLogPanel bundle={bundle} playState={playState} t={t} />
            )}

            {characterTab === 'collectionLog' && (
              <CollectionLogPanel bundle={bundle} onExamine={onExamine} playState={playState} t={t} />
            )}
          </section>
        )}

        {visibleActiveTab === 'settings' && (
          <section className="grid gap-4">
            <section className="grid gap-4 rounded border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-lg font-semibold text-slate-100">{t('settings.title')}</h2>

              <div className="flex gap-2 rounded border border-slate-800 bg-slate-900 p-2" data-testid="settings-tabs">
                {(['settings', 'mods'] as SettingsTab[]).map((tab) => (
                  <button
                    className={`min-w-24 flex-1 rounded px-3 py-2 text-sm font-semibold capitalize ${
                      settingsTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-950 text-slate-300'
                    }`}
                    data-testid={`settings-tab-${tab}`}
                    key={tab}
                    onClick={() => setSettingsTab(tab)}
                    type="button"
                  >
                    {t(`settings.tab.${tab}`)}
                  </button>
                ))}
              </div>

              {settingsTab === 'settings' && (
              <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                <h3 className="text-sm font-semibold text-slate-100">{t('settings.universe.title')}</h3>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">{t('settings.universe.title')}</span>
                  <select
                    className="w-56 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    onChange={(event) => {
                      logPlayerAction('settings.universe', { universeId: event.target.value });
                      void setActiveUniverse(event.target.value);
                    }}
                    value={activeUniverseId}
                  >
                    {manifests.map((manifest) => (
                      <option key={manifest.id} value={manifest.id}>
                        {t(universeTitleKey(manifest.id), manifest.id)}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              )}

              {settingsTab === 'mods' && (
              <>
              {(contributionMode || (bundle.modules && bundle.modules.length > 0)) && (
                <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">{t('settings.modules.title')}</h3>
                      <p className="text-xs text-slate-400">{t('settings.modules.description')}</p>
                    </div>
                    <button
                      className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
                      onClick={() => {
                        dismissDialogue();
                        setContributionMode(true);
                        setContributionTab('content');
                        setTab('edit');
                      }}
                      type="button"
                    >
                      {t('settings.modules.edit')}
                    </button>
                  </div>
                  {(bundle.modules ?? []).length === 0 ? (
                    <p className="rounded bg-slate-900 p-3 text-sm text-slate-400">{t('settings.modules.empty')}</p>
                  ) : (
                    <div className="grid gap-2">
                      {(bundle.modulePacks ?? []).map((pack) => renderModulePack(pack))}
                      {unpackedSettingModules.length > 0 && (bundle.modulePacks ?? []).length > 0 && (
                        <section className="grid gap-2 rounded border border-slate-800 bg-slate-900/60 p-2">
                          <h4 className="text-xs font-semibold uppercase text-slate-500">{t('settings.modules.unpacked')}</h4>
                          {unpackedSettingModules.map((module) => renderModuleToggle(module))}
                        </section>
                      )}
                      {((bundle.modulePacks ?? []).length === 0 ? (bundle.modules ?? []) : unpackedSettingModules).map((module) => (
                        (bundle.modulePacks ?? []).length === 0 ? renderModuleToggle(module) : null
                      ))}
                    </div>
                  )}
                </section>
              )}

              <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                <h3 className="text-sm font-semibold text-slate-100">{t('contribution.modules.modpacks')}</h3>
                <p className="text-xs text-slate-400">{t('contribution.modules.packsDescription')}</p>
                <StructuredDataEditor
                  onChange={(value) => patchContributionDraft({ modulePacks: (Array.isArray(value) ? value : []) as unknown as ContentModulePack[] })}
                  schema={{
                    kind: 'array',
                    listMode: 'free',
                    item: modulePackSchema({ ...bundle, modules: uniqueById([...(bundle.modules ?? []), ...(currentContributionDraft?.modules ?? [])]) }),
                    createItem: () => ({ id: 'new-pack', modules: bundle.modules?.[0] ? [bundle.modules[0].id] : [] }),
                  }}
                  t={t}
                  value={uniqueById([...(currentContributionDraft?.modulePacks ?? []), ...(bundle.modulePacks ?? [])]) as unknown as StructuredValue}
                />
              </section>
              </>
              )}

              {settingsTab === 'settings' && (
              <>
              <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                <h3 className="text-sm font-semibold text-slate-100">{t('settings.appearance.title')}</h3>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">{t('settings.appearance.displayProfile')}</span>
                  <select
                    className="w-56 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    onChange={(event) => {
                      dismissDialogue();
                      setDisplayProfileSelections((selections) => ({
                        ...selections,
                        [bundle.manifest.id]: event.target.value,
                      }));
                    }}
                    value={selectedDisplayProfileId}
                  >
                    {displayProfileOptions.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {t(profile.titleKey ?? profileTitleKey(profile.id), profile.id)}
                      </option>
                    ))}
                  </select>
                </label>
                <details className="rounded border border-slate-800 bg-slate-900/60 p-3" onToggle={(event) => openThemeEditor(event.currentTarget.open)} open={themeEditorOpen}>
                  <summary className="cursor-pointer text-sm font-semibold text-slate-100">{t('settings.displayProfile.editCurrent')}</summary>
                  <section className="mt-3 grid gap-3">
                    <button
                      className="justify-self-start rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
                      onClick={copyCurrentThemeJson}
                      type="button"
                    >
                      {t('settings.displayProfile.copyJson')}
                    </button>
                    <div className="grid gap-2 rounded border p-3" style={{ background: customPalette.background, borderColor: customPalette.border, color: customPalette.text }}>
                      <div className="grid gap-2 rounded border p-3" style={{ background: customPalette.surface, borderColor: customPalette.border }}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold" style={{ color: customPalette.text }}>{t('settings.displayProfile.previewTitle')}</p>
                            <p className="text-xs" style={{ color: customPalette.textMuted }}>{t('settings.displayProfile.previewMuted')}</p>
                          </div>
                          <button className="rounded px-3 py-2 text-sm font-semibold" style={{ background: customPalette.accent, color: customPalette.accentText }} type="button">
                            {t('settings.displayProfile.previewButton')}
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div className="rounded border p-2" style={{ background: customPalette.surfaceRaised, borderColor: customPalette.border }}>
                            <span className="block text-xs" style={{ color: customPalette.textSubtle }}>{t('settings.color.surfaceRaised')}</span>
                            <span className="block text-sm font-semibold" style={{ color: customPalette.text }}>{t('settings.displayProfile.previewPanel')}</span>
                          </div>
                          <div className="rounded border p-2" style={{ background: customPalette.dangerSurface, borderColor: customPalette.danger }}>
                            <span className="block text-xs" style={{ color: customPalette.dangerText }}>{t('settings.color.danger')}</span>
                            <span className="block text-sm font-semibold" style={{ color: customPalette.dangerText }}>{t('settings.displayProfile.previewAlert')}</span>
                          </div>
                          <div className="rounded border p-2" style={{ background: customPalette.panel, borderColor: customPalette.border }}>
                            <span className="block text-xs" style={{ color: customPalette.success }}>{t('settings.color.success')}</span>
                            <span className="block text-xs" style={{ color: customPalette.warning }}>{t('settings.color.warning')}</span>
                            <span className="block text-sm font-semibold" style={{ color: customPalette.accentStrong }}>{t('settings.color.accentStrong')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {displayColorKeys.map((key) => (
                        <label className="grid grid-cols-[1fr_auto] items-center gap-2 rounded bg-slate-950 p-2 text-xs text-slate-300" key={key}>
                          <span>{t(`settings.color.${key}`)}</span>
                          <input
                            className={colorInputClass}
                            onChange={(event) => updateCustomColor(key, event.target.value)}
                            type="color"
                            value={customDisplayProfile.colors?.[key] ?? customPalette[key]}
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                </details>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">{t('settings.appearance.fontSize')}</span>
                  <select
                    className="w-56 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    onChange={(event) => { dismissDialogue(); setFontSizePreference(event.target.value as FontSizePreference); }}
                    value={fontSizePreference}
                  >
                    <option value="tiny">{t('settings.fontSize.tiny')}</option>
                    <option value="small">{t('settings.fontSize.small')}</option>
                    <option value="normal">{t('settings.fontSize.normal')}</option>
                    <option value="large">{t('settings.fontSize.large')}</option>
                    <option value="huge">{t('settings.fontSize.huge')}</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">{t('settings.appearance.language')}</span>
                  <select
                    className="w-56 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    onChange={(event) => { dismissDialogue(); void setLocalePreference(event.target.value); }}
                    value={localePreference}
                  >
                    <option value="system">{t('settings.language.system')}</option>
                    {bundle.manifest.locales.map((locale) => (
                      <option key={locale} value={locale}>
                      {t(`settings.language.${locale}`, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">{t('settings.appearance.compressChat')}</span>
                  <input
                    checked={chatCompressionEnabled}
                    className="h-5 w-5"
                    onChange={(event) => { dismissDialogue(); setChatCompressionEnabled(event.target.checked); }}
                    type="checkbox"
                  />
                </label>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">{t('settings.appearance.showTravelActions')}</span>
                  <input
                    checked={showTravelActions}
                    className="h-5 w-5"
                    onChange={(event) => { dismissDialogue(); setShowTravelActions(event.target.checked); }}
                    type="checkbox"
                  />
                </label>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">{t('settings.appearance.showGui')}</span>
                  <input
                    checked={showGui}
                    className="h-5 w-5"
                    data-testid="show-gui-toggle"
                    onChange={(event) => {
                      dismissDialogue();
                      if (!event.target.checked) {
                        appendChatText(runtimeUniverseId, t('cli.showGui.disabled', 'You have disabled the GUI. To re-enable it, type /change-setting show-gui true'));
                      }
                      setShowGui(event.target.checked);
                    }}
                    type="checkbox"
                  />
                </label>
              </section>

              <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{t('settings.save.title')}</h3>
                    <p className="text-xs text-slate-400">{t('settings.save.description')}</p>
                  </div>
                  <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => void exportSave()} type="button">
                    {t('settings.save.export')}
                  </button>
                </div>
                <textarea className="min-h-20 rounded bg-slate-900 p-3 text-xs text-slate-300" onChange={(event) => setSaveExport(event.target.value)} placeholder={t('settings.save.exportPlaceholder')} value={saveExport} />
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <textarea className="min-h-20 rounded bg-slate-900 p-3 text-xs text-slate-300" onChange={(event) => setSaveImport(event.target.value)} placeholder={t('settings.save.importPlaceholder')} value={saveImport} />
                  <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={() => void importSave()} type="button">
                    {t('settings.save.import')}
                  </button>
                </div>
                {saveMessage && <p className="text-xs text-slate-400">{saveMessage}</p>}
              </section>

              <div className="flex items-center justify-between gap-4 rounded border border-slate-800 bg-slate-950 p-3">
                <span>
                  <span className="block text-sm font-semibold text-slate-100">{t('settings.whatsNew.title')}</span>
                  <span className="block text-xs text-slate-400">{t('settings.whatsNew.description')}</span>
                </span>
                <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={() => setShowChangelog(true)} type="button">
                  {t('settings.whatsNew.open')}
                </button>
              </div>

              <div className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-3 text-sm">
                <h3 className="font-semibold text-slate-100">{t('settings.about.title')}</h3>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-400">{t('settings.about.version')}</span>
                  <span className="text-slate-200">{APP_VERSION}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-400">{t('settings.about.sourceCode')}</span>
                  <a className="text-cyan-300" href={SOURCE_URL} rel="noreferrer" target="_blank">
                    github.com/Flamebeard10339/UniversalisRPG
                  </a>
                </div>
              </div>

              {debugEnabled && (
                <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">{t('settings.runLog.title')}</h3>
                      <p className="text-xs text-slate-400">{t('settings.runLog.description', { count: playState.runLog.length })}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
                        onClick={() => void navigator.clipboard.writeText(JSON.stringify(playState.runLog, null, 2))}
                        type="button"
                      >
                        {t('settings.runLog.copy')}
                      </button>
                      <button
                        className="rounded border border-rose-700 px-3 py-2 text-sm font-semibold text-rose-100"
                        onClick={() => clearRunLog(runtimeUniverseId)}
                        type="button"
                      >
                        {t('settings.runLog.clear')}
                      </button>
                    </div>
                  </div>
                  {playState.runLog.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('settings.runLog.empty')}</p>
                  ) : (
                    <ol className="grid max-h-80 gap-2 overflow-auto text-xs">
                      {[...playState.runLog].reverse().map((entry) => (
                        <li className="rounded bg-slate-900 p-3" key={entry.sequence}>
                          <div className="flex flex-wrap justify-between gap-2 text-slate-300">
                            <span className="font-semibold text-cyan-200">{entry.runId} / {entry.sequence}. {entry.actor}: {entry.event}</span>
                            <time>{new Date(entry.createdAt).toLocaleString()}</time>
                          </div>
                          {entry.data && <div className="mt-2"><StructuredDataEditor onChange={() => undefined} schema={{ kind: 'inferred' }} t={t} value={entry.data as unknown as StructuredValue} /></div>}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}

              <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                <h3 className="text-sm font-semibold text-slate-100">{t('settings.debug.title')}</h3>
                <label className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm text-slate-300">{t('settings.debug.contributionMode')}</span>
                    <span className="block text-xs text-slate-500">{t('settings.debug.contributionDescription')}</span>
                  </span>
                  <input
                    checked={contributionMode}
                    className="h-5 w-5"
                    data-testid="settings-contribution-mode"
                    onChange={(event) => {
                      logPlayerAction('settings.contributionMode', { enabled: event.target.checked });
                      dismissDialogue();
                      setContributionMode(event.target.checked);
                    }}
                    type="checkbox"
                  />
                </label>
                <label className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm text-slate-300">{t('settings.debug.debugMode')}</span>
                    <span className="block text-xs text-slate-500">{t('settings.debug.debugDescription')}</span>
                  </span>
                  <input
                    checked={debugEnabled}
                    className="h-5 w-5"
                    onChange={(event) => { dismissDialogue(); setDebugEnabled(event.target.checked); }}
                    type="checkbox"
                  />
                </label>

                {debugEnabled && (
                  <section className="grid gap-3 rounded border border-slate-800 bg-slate-900 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-slate-100">{t('settings.debug.log')}</h4>
                      <button
                        className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
                        onClick={clearDebugLog}
                        type="button"
                      >
                        {t('settings.debug.clear')}
                      </button>
                    </div>
                    {debugEntries.length === 0 ? (
                      <p className="text-sm text-slate-500">{t('settings.debug.empty')}</p>
                    ) : (
                      <ol className="grid max-h-80 gap-2 overflow-auto text-xs">
                        {debugEntries.map((entry) => (
                          <li className="rounded bg-slate-950 p-3" key={entry.id}>
                            <div className="flex flex-wrap justify-between gap-2 text-slate-300">
                              <span className="font-semibold text-cyan-200">{entry.action}</span>
                              <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                            </div>
                            {entry.details && <div className="mt-2"><StructuredDataEditor onChange={() => undefined} schema={{ kind: 'inferred' }} t={t} value={entry.details as unknown as StructuredValue} /></div>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                )}
              </section>

              <div className="flex items-center justify-between gap-4 rounded border border-rose-900 bg-rose-950/30 p-3">
                <span>
                  <span className="block text-sm font-semibold text-rose-100">{t('settings.reset.title')}</span>
                  <span className="block text-xs text-rose-200/80">{t('settings.reset.description')}</span>
                </span>
                <button className="rounded border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-100" onClick={() => setConfirmReset(true)} type="button">
                  {t('settings.reset.button')}
                </button>
              </div>
              </>
              )}
            </section>
          </section>
        )}
      </div>

      {playState.activeDialogue ? (
        <div className="fixed inset-x-0 bottom-[73px] z-10 h-[33vh] px-4">
          <div className="mx-auto h-full max-w-7xl">
            <DialoguePanel context={actionContext} onChoose={(optionId) => chooseDialogueOption(runtimeUniverseId, actionContext, optionId)} playState={playState} t={t} />
          </div>
        </div>
      ) : (
        visibleActiveTab === 'home' && (
          <div className="fixed inset-x-0 bottom-[73px] z-10 h-[33vh] px-4">
            <div className="mx-auto h-full max-w-7xl">
              <ChatPanel compressionEnabled={chatCompressionEnabled} messages={playState.chatMessages} onSend={runCliCommand} t={t} />
            </div>
          </div>
        )
      )}

      {showChangelog && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/80 p-4">
          <section className="w-full max-w-lg rounded border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-100">{t('settings.whatsNew.title')}</h2>
              <button className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-100" onClick={() => setShowChangelog(false)} type="button">
                {t('dialog.close')}
              </button>
            </div>
            <pre className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-sm text-slate-300">
              {changelogText || t('dialog.loadingChangelog')}
            </pre>
          </section>
        </div>
      )}

      {playState.openModalId === 'name-editor' && (
        <NameEditorModal
          initialName={playState.characterName}
          onClose={() => closeModal(runtimeUniverseId)}
          onSave={(name) => {
            setCharacterName(runtimeUniverseId, name);
            closeModal(runtimeUniverseId);
          }}
          t={t}
        />
      )}

      {playState.openModalId === 'bank' && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg">
            <div className="mb-2 flex justify-end">
              <button className="rounded border border-slate-600 bg-slate-900 px-3 py-1 text-sm text-slate-100" onClick={() => closeModal(runtimeUniverseId)} type="button">
                {t('dialog.close')}
              </button>
            </div>
            <BankPanel
              bundle={bundle}
              onDeposit={(itemId, amount) => depositToBank(runtimeUniverseId, actionContext, itemId, amount)}
              onWithdraw={(itemId, amount) => withdrawFromBank(runtimeUniverseId, actionContext, itemId, amount)}
              playState={playState}
              t={t}
            />
          </div>
        </div>
      )}

      <FloatingSkillText bundle={bundle} playState={playState} t={t} />

      {idleReport.kind !== 'none' && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/80 p-4" onClick={() => setIdleReport(emptyIdleReport)}>
          <section className="w-full max-w-md rounded border border-cyan-800 bg-slate-900 p-5 shadow-xl">
            <div>
              <div>
                <h2 className="text-lg font-semibold text-cyan-100">{t('welcomeBack.title')}</h2>
                <p className="mt-1 text-sm text-slate-300">
                  {t('welcomeBack.awayFor', { duration: formatDuration(idleReport.inactiveMs, t) })}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-slate-200">
              {idleReport.kind === 'travelCompleted' && (
                <p>
                  {t('welcomeBack.travelCompleted', {
                    from: t(locationTitleKey(idleReport.fromLocationId), idleReport.fromLocationId),
                    to: t(locationTitleKey(idleReport.toLocationId), idleReport.toLocationId),
                  })}
                </p>
              )}

              {idleReport.kind === 'actionCompleted' && (
                <section className="grid gap-2">
                  <p>{t('welcomeBack.actionCompleted', { action: actionTitleFor(idleReport.actionId) })}</p>
                  {idleRewards.length > 0 && (
                    <ul className="grid gap-1 rounded bg-slate-950 p-3 text-xs text-slate-300">
                      {idleRewards.map((reward) => (
                        <li key={`${reward.kind}-${reward.labelId}`}>
                          {reward.kind === 'skillXp'
                            ? t('welcomeBack.reward.skillXp', { amount: reward.amount, skill: t(skillTitleKey(reward.labelId), reward.labelId) })
                            : reward.kind === 'item'
                              ? t('welcomeBack.reward.item', { amount: reward.amount, item: t(itemTitleKey(reward.labelId), reward.labelId) })
                              : t('welcomeBack.reward.resource', { amount: reward.amount, resource: t(resourceTitleKey(reward.labelId), reward.labelId) })}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {idleReport.kind === 'actionFailed' && (
                <p>{t('welcomeBack.actionFailed', { action: actionTitleFor(idleReport.actionId) })}</p>
              )}

              {idleReport.kind === 'inProgress' && idleReport.timerKind === 'action' && (
                <p>
                  {t('welcomeBack.actionInProgress', {
                    action: actionTitleFor(idleReport.actionId),
                    remaining: formatDuration(idleReport.remainingMs, t),
                  })}
                </p>
              )}

              {idleReport.kind === 'inProgress' && idleReport.timerKind === 'travel' && (
                <p>
                  {t('welcomeBack.travelInProgress', {
                    from: t(locationTitleKey(idleReport.fromLocationId ?? ''), idleReport.fromLocationId ?? ''),
                    to: t(locationTitleKey(idleReport.toLocationId ?? ''), idleReport.toLocationId ?? ''),
                    remaining: formatDuration(idleReport.remainingMs, t),
                  })}
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {confirmReset && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/80 p-4">
          <section className="w-full max-w-md rounded border border-rose-800 bg-slate-900 p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-rose-100">{t('dialog.resetTitle')}</h2>
            <p className="mt-2 text-sm text-slate-300">{t('dialog.resetDescription', { universe: t(universeTitleKey(bundle.manifest.id), bundle.manifest.id) })}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={() => setConfirmReset(false)} type="button">
                {t('dialog.cancel')}
              </button>
              <button className="rounded bg-rose-500 px-3 py-2 text-sm font-semibold text-white" onClick={() => void resetActiveUniverse()} type="button">
                {t('dialog.resetConfirm')}
              </button>
            </div>
          </section>
        </div>
      )}

      {moduleCleanupReport && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/80 p-4">
          <section className="w-full max-w-lg rounded border border-amber-500 bg-slate-900 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-amber-300">{t('settings.modules.cleanup.title')}</h2>
                <p className="mt-1 text-sm text-slate-300">{t('settings.modules.cleanup.description')}</p>
              </div>
              <button className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-100" onClick={clearModuleCleanupReport} type="button">
                {t('dialog.close')}
              </button>
            </div>
            <ul className="mt-4 grid max-h-80 gap-1 overflow-auto rounded bg-slate-950 p-3 text-sm text-slate-300">
              {moduleCleanupItems.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className={`mx-auto grid max-w-2xl gap-2 ${contributionMode ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {(['map', 'home', 'character', 'settings', ...(contributionMode ? ['edit' as const] : [])] as AppTab[]).map((tab) => (
            <button
              className={`rounded px-3 py-3 text-sm font-semibold capitalize ${
                visibleActiveTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-900 text-slate-300'
              } ${tab === 'map' && mapFlashUntil > mapFlashNow ? 'ring-2 ring-cyan-300 animate-pulse' : ''}`}
              data-nav-tab={tab}
              key={tab}
              onClick={() => setTab(tab)}
              type="button"
            >
              {t(`app.tab.${tab}`)}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
