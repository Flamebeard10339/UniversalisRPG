import { useEffect, useMemo, useState } from 'react';
import { ActionPanel } from './components/ActionPanel';
import { ChatPanel } from './components/ChatPanel';
import { ContributionMode } from './components/contribution/ContributionMode';
import { SkillBars } from './components/SkillBars';
import { TravelStatus } from './components/TravelStatus';
import { WorldMap } from './components/WorldMap';
import { locationTitleKey } from './game/contentIds';
import type { UniversePlayState } from './game/types';
import { load, save } from './lib/storage';
import { useDebugState } from './stores/debugState';
import { useGameState } from './stores/gameState';
import { useUniverseState } from './stores/universeState';

const getStartingLocationId = (bundle: NonNullable<ReturnType<typeof useUniverseState.getState>['bundle']>) =>
  bundle.locations.find((location) => location.starting)?.id ?? bundle.locations[0]?.id ?? '';

type AppTab = 'map' | 'home' | 'character' | 'settings';
type CharacterTab = 'skills' | 'inventory';
type ThemePreference = 'system' | 'dark' | 'light';
type FontSizePreference = 'tiny' | 'small' | 'normal' | 'large' | 'huge';
const APP_VERSION = '0.1.0';
const SOURCE_URL = 'https://github.com/Flamebeard10339/UniversalisRPG';
const appearanceKey = 'universalis:settings:appearance';

const encodeSave = (playState: UniversePlayState) =>
  btoa(unescape(encodeURIComponent(JSON.stringify(playState))));

const decodeSave = (value: string) =>
  JSON.parse(decodeURIComponent(escape(atob(value.trim())))) as UniversePlayState;

export default function App() {
  const [contributionMode, setContributionMode] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [characterTab, setCharacterTab] = useState<CharacterTab>('skills');
  const [themePreference, setThemePreference] = useState<ThemePreference>('dark');
  const [fontSizePreference, setFontSizePreference] = useState<FontSizePreference>('normal');
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogText, setChangelogText] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [saveExport, setSaveExport] = useState('');
  const [saveImport, setSaveImport] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const {
    activeUniverseId,
    bundle,
    manifests,
    validationIssues,
    loading,
    error,
    localePreference,
    initialize,
    setActiveUniverse,
    setLocalePreference,
    t,
  } = useUniverseState();
  const hydratePlayState = useGameState((state) => state.hydrate);
  const getUniverseState = useGameState((state) => state.getUniverseState);
  const gameStates = useGameState((state) => state.states);
  const travelTo = useGameState((state) => state.travelTo);
  const cancelTravel = useGameState((state) => state.cancelTravel);
  const startAction = useGameState((state) => state.startAction);
  const resolveDue = useGameState((state) => state.resolveDue);
  const importUniverseState = useGameState((state) => state.importUniverseState);
  const resetUniverse = useGameState((state) => state.resetUniverse);
  const debugEnabled = useDebugState((state) => state.enabled);
  const debugEntries = useDebugState((state) => state.entries);
  const hydrateDebug = useDebugState((state) => state.hydrate);
  const setDebugEnabled = useDebugState((state) => state.setEnabled);
  const logAction = useDebugState((state) => state.logAction);
  const clearDebugLog = useDebugState((state) => state.clear);

  useEffect(() => {
    void initialize();
    void hydrateDebug();
  }, [hydrateDebug, initialize]);

  useEffect(() => {
    void load<{ theme: ThemePreference; fontSize: FontSizePreference }>(appearanceKey).then((settings) => {
      if (!settings) {
        return;
      }
      setThemePreference(settings.theme ?? 'dark');
      setFontSizePreference(settings.fontSize ?? 'normal');
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themePreference;
    document.documentElement.dataset.fontSize = fontSizePreference;
    void save(appearanceKey, { theme: themePreference, fontSize: fontSizePreference });
  }, [fontSizePreference, themePreference]);

  useEffect(() => {
    if (!showChangelog || changelogText) {
      return;
    }

    void fetch('/changelog.txt')
      .then((response) => response.text())
      .then(setChangelogText)
      .catch(() => setChangelogText('Unable to load changelog.txt.'));
  }, [changelogText, showChangelog]);

  const startingLocationId = useMemo(() => (bundle ? getStartingLocationId(bundle) : ''), [bundle]);
  const playState = bundle ? gameStates[bundle.manifest.id] ?? getUniverseState(bundle.manifest.id, startingLocationId) : null;
  const currentLocation = bundle?.locations.find((location) => location.id === playState?.currentLocationId);
  const beginTravel = (locationId: string) => {
    logAction('map.nodeClick', {
      locationId,
      currentLocationId: playState?.currentLocationId,
      activeTravel: Boolean(playState?.activeTravel),
    });

    if (!bundle || !playState || playState.activeTravel || locationId === playState.currentLocationId) {
      return;
    }

    const edge = bundle.edges.find(
      (candidate) =>
        (candidate.source === playState.currentLocationId && candidate.target === locationId) ||
        (candidate.target === playState.currentLocationId && candidate.source === locationId),
    );

    if (edge) {
      logAction('travel.start', {
        edgeId: edge.id,
        fromLocationId: playState.currentLocationId,
        toLocationId: locationId,
      });
      travelTo(bundle.manifest.id, edge, locationId);
    } else {
      logAction('travel.noEdge', {
        fromLocationId: playState.currentLocationId,
        toLocationId: locationId,
      });
    }
  };

  const setTab = (tab: AppTab) => {
    logAction('navigation.tab', { tab });
    setActiveTab(tab);
  };

  const setCharacterTopTab = (tab: CharacterTab) => {
    logAction('navigation.characterTab', { tab });
    setCharacterTab(tab);
  };

  const exportSave = async () => {
    if (!playState) {
      return;
    }

    setSaveExport(encodeSave(playState));
    setSaveMessage('Save exported.');
    await navigator.clipboard.writeText(encodeSave(playState));
  };

  const importSave = async () => {
    if (!bundle) {
      return;
    }

    try {
      const imported = decodeSave(saveImport);
      if (imported.universeId !== bundle.manifest.id) {
        setSaveMessage(`Import belongs to "${imported.universeId}", not "${bundle.manifest.id}".`);
        return;
      }
      await importUniverseState(imported);
      setSaveMessage('Save imported.');
      setSaveImport('');
    } catch {
      setSaveMessage('Import failed. Check the serialized save string.');
    }
  };

  const resetActiveUniverse = async () => {
    if (!bundle) {
      return;
    }

    await resetUniverse(bundle.manifest.id, startingLocationId);
    setConfirmReset(false);
    setSaveMessage('Universe save reset.');
  };

  useEffect(() => {
    if (bundle && startingLocationId) {
      void hydratePlayState(bundle.manifest.id, startingLocationId);
    }
  }, [bundle, hydratePlayState, startingLocationId]);

  useEffect(() => {
    if (!bundle || !playState) {
      return undefined;
    }

    const nextCompletionAt = [playState.activeTravel?.completesAt, playState.activeAction?.completesAt]
      .filter((time): time is number => typeof time === 'number')
      .sort((a, b) => a - b)[0];

    if (!nextCompletionAt) {
      return undefined;
    }

    const timeout = window.setTimeout(
      () => resolveDue(bundle.manifest.id, bundle.actions),
      Math.max(0, nextCompletionAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [bundle, playState, resolveDue]);

  if (loading && !bundle) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading universe...</main>;
  }

  if (error || !bundle || !playState || !currentLocation) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
        <section className="max-w-xl rounded border border-rose-800 bg-rose-950/30 p-5">
          <h1 className="text-lg font-semibold">Unable to start UniversalisRPG</h1>
          <p className="mt-2 text-sm text-rose-100">{error ?? 'No playable universe content was found.'}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 pb-[45vh] text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70 px-4 py-3">
        <div className="mx-auto max-w-7xl">
          <div>
            <h1 className="text-xl font-semibold">UniversalisRPG</h1>
            <p className="text-sm text-slate-400">{t(bundle.manifest.titleKey)} - {t(bundle.manifest.descriptionKey ?? '')}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-4">
        {activeTab === 'map' && (
          <section className="grid h-[calc(100vh-150px)] min-h-[560px] grid-rows-[auto_1fr] gap-4">
            <TravelStatus
              activeTravel={playState.activeTravel}
              bundle={bundle}
              currentLocationId={playState.currentLocationId}
              onCancel={() => {
                logAction('travel.cancel', { universeId: bundle.manifest.id });
                cancelTravel(bundle.manifest.id);
              }}
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
          </section>
        )}

        {activeTab === 'home' && (
          <section className="grid h-[calc(100vh-150px)] min-h-[560px] gap-4">
            <TravelStatus
              activeTravel={playState.activeTravel}
              bundle={bundle}
              currentLocationId={playState.currentLocationId}
              titleWhenIdle
              t={t}
            />

            <section className="rounded border border-slate-800 bg-slate-900 p-4">
          <ActionPanel
            bundle={bundle}
            onStartAction={(action) => {
              logAction('action.start', {
                actionId: action.id,
                locationId: action.locationId,
                universeId: bundle.manifest.id,
              });
              startAction(bundle.manifest.id, action);
            }}
            playState={playState}
            t={t}
          />
            </section>

            <ChatPanel locationName={t(currentLocation.titleKey ?? locationTitleKey(currentLocation.id))} />
          </section>
        )}

        {activeTab === 'character' && (
          <section className="grid gap-4">
            <div className="grid grid-cols-2 gap-2 rounded border border-slate-800 bg-slate-900 p-2">
              {(['skills', 'inventory'] as CharacterTab[]).map((tab) => (
                <button
                  className={`rounded px-3 py-2 text-sm font-semibold capitalize ${
                    characterTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-950 text-slate-300'
                  }`}
                  key={tab}
                  onClick={() => setCharacterTopTab(tab)}
                  type="button"
                >
                  {tab}
                </button>
              ))}
            </div>

            {characterTab === 'skills' && (
              <section className="rounded border border-slate-800 bg-slate-900 p-4">
                <SkillBars bundle={bundle} playState={playState} t={t} />
              </section>
            )}

            {characterTab === 'inventory' && (
              <section className="grid gap-2 rounded border border-slate-800 bg-slate-900 p-4">
                <h2 className="text-base font-semibold text-slate-100">Inventory</h2>
                {Object.keys(playState.resources).length === 0 ? (
                  <p className="text-sm text-slate-500">No items yet.</p>
                ) : (
                  <dl className="grid gap-2 text-sm">
                    {Object.entries(playState.resources).map(([resourceId, amount]) => (
                      <div className="flex justify-between gap-3 rounded border border-slate-800 bg-slate-950 p-3" key={resourceId}>
                        <dt className="text-slate-300">{resourceId}</dt>
                        <dd className="font-semibold text-slate-100">{amount}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            )}
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="grid gap-4">
            <section className="grid gap-4 rounded border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-lg font-semibold text-slate-100">Settings</h2>

              <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                <h3 className="text-sm font-semibold text-slate-100">Universe</h3>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">Universe</span>
                  <select
                    className="w-56 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    onChange={(event) => {
                      logAction('settings.universe', { universeId: event.target.value });
                      void setActiveUniverse(event.target.value);
                    }}
                    value={activeUniverseId}
                  >
                    {manifests.map((manifest) => (
                      <option key={manifest.id} value={manifest.id}>
                        {t(manifest.titleKey, manifest.id)}
                      </option>
                    ))}
                  </select>
                </label>
              </section>

              <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                <h3 className="text-sm font-semibold text-slate-100">Appearance</h3>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">Theme</span>
                  <select
                    className="w-56 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
                    value={themePreference}
                  >
                    <option value="system">System</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">Font size</span>
                  <select
                    className="w-56 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    onChange={(event) => setFontSizePreference(event.target.value as FontSizePreference)}
                    value={fontSizePreference}
                  >
                    <option value="tiny">Tiny</option>
                    <option value="small">Small</option>
                    <option value="normal">Normal</option>
                    <option value="large">Large</option>
                    <option value="huge">Huge</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-300">Language</span>
                  <select
                    className="w-56 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    onChange={(event) => void setLocalePreference(event.target.value)}
                    value={localePreference}
                  >
                    <option value="system">System</option>
                    {bundle.manifest.locales.map((locale) => (
                      <option key={locale} value={locale}>
                        {locale === 'en' ? 'English' : locale}
                      </option>
                    ))}
                  </select>
                </label>
              </section>

              <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">Export/import save</h3>
                    <p className="text-xs text-slate-400">Serialized current-universe save for easy sharing.</p>
                  </div>
                  <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => void exportSave()} type="button">
                    Export
                  </button>
                </div>
                <textarea className="min-h-20 rounded bg-slate-900 p-3 text-xs text-slate-300" onChange={(event) => setSaveExport(event.target.value)} placeholder="Exported save string" value={saveExport} />
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <textarea className="min-h-20 rounded bg-slate-900 p-3 text-xs text-slate-300" onChange={(event) => setSaveImport(event.target.value)} placeholder="Paste save string to import" value={saveImport} />
                  <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={() => void importSave()} type="button">
                    Import
                  </button>
                </div>
                {saveMessage && <p className="text-xs text-slate-400">{saveMessage}</p>}
              </section>

              <div className="flex items-center justify-between gap-4 rounded border border-slate-800 bg-slate-950 p-3">
                <span>
                  <span className="block text-sm font-semibold text-slate-100">What's new</span>
                  <span className="block text-xs text-slate-400">View changelog.txt.</span>
                </span>
                <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={() => setShowChangelog(true)} type="button">
                  Open
                </button>
              </div>

              <div className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-3 text-sm">
                <h3 className="font-semibold text-slate-100">About</h3>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-400">Version</span>
                  <span className="text-slate-200">{APP_VERSION}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-400">Source code</span>
                  <a className="text-cyan-300" href={SOURCE_URL} rel="noreferrer" target="_blank">
                    github.com/Flamebeard10339/UniversalisRPG
                  </a>
                </div>
              </div>

              <section className="grid gap-3 rounded border border-slate-800 bg-slate-950 p-3">
                <h3 className="text-sm font-semibold text-slate-100">Debug</h3>
                <label className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm text-slate-300">Contribution mode</span>
                    <span className="block text-xs text-slate-500">Enable local JSON editing and GitHub issue packaging.</span>
                  </span>
                  <input
                    checked={contributionMode}
                    className="h-5 w-5"
                    onChange={(event) => {
                      logAction('settings.contributionMode', { enabled: event.target.checked });
                      setContributionMode(event.target.checked);
                    }}
                    type="checkbox"
                  />
                </label>
                <label className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm text-slate-300">Debug mode</span>
                    <span className="block text-xs text-slate-500">Log user actions for troubleshooting.</span>
                  </span>
                  <input
                    checked={debugEnabled}
                    className="h-5 w-5"
                    onChange={(event) => setDebugEnabled(event.target.checked)}
                    type="checkbox"
                  />
                </label>

                {debugEnabled && (
                  <section className="grid gap-3 rounded border border-slate-800 bg-slate-900 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-slate-100">Debug log</h4>
                      <button
                        className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
                        onClick={clearDebugLog}
                        type="button"
                      >
                        Clear
                      </button>
                    </div>
                    {debugEntries.length === 0 ? (
                      <p className="text-sm text-slate-500">No actions logged yet.</p>
                    ) : (
                      <ol className="grid max-h-80 gap-2 overflow-auto text-xs">
                        {debugEntries.map((entry) => (
                          <li className="rounded bg-slate-950 p-3" key={entry.id}>
                            <div className="flex flex-wrap justify-between gap-2 text-slate-300">
                              <span className="font-semibold text-cyan-200">{entry.action}</span>
                              <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                            </div>
                            {entry.details && (
                              <pre className="mt-2 overflow-auto text-slate-400">
                                {JSON.stringify(entry.details, null, 2)}
                              </pre>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                )}
              </section>

              {contributionMode && <ContributionMode bundle={bundle} validationIssues={validationIssues} />}

              <div className="flex items-center justify-between gap-4 rounded border border-rose-900 bg-rose-950/30 p-3">
                <span>
                  <span className="block text-sm font-semibold text-rose-100">Reset universe</span>
                  <span className="block text-xs text-rose-200/80">Clears skills, inventory, location progress, and active timers.</span>
                </span>
                <button className="rounded border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-100" onClick={() => setConfirmReset(true)} type="button">
                  Reset
                </button>
              </div>
            </section>
          </section>
        )}
      </div>

      {showChangelog && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/80 p-4">
          <section className="w-full max-w-lg rounded border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-100">What's New</h2>
              <button className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-100" onClick={() => setShowChangelog(false)} type="button">
                Close
              </button>
            </div>
            <pre className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-sm text-slate-300">
              {changelogText || 'Loading changelog.txt...'}
            </pre>
          </section>
        </div>
      )}

      {confirmReset && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/80 p-4">
          <section className="w-full max-w-md rounded border border-rose-800 bg-slate-900 p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-rose-100">Reset this universe?</h2>
            <p className="mt-2 text-sm text-slate-300">This clears all progress for {t(bundle.manifest.titleKey, bundle.manifest.id)}.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={() => setConfirmReset(false)} type="button">
                Cancel
              </button>
              <button className="rounded bg-rose-500 px-3 py-2 text-sm font-semibold text-white" onClick={() => void resetActiveUniverse()} type="button">
                Reset universe
              </button>
            </div>
          </section>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-4 gap-2">
          {(['map', 'home', 'character', 'settings'] as AppTab[]).map((tab) => (
            <button
              className={`rounded px-3 py-3 text-sm font-semibold capitalize ${
                activeTab === tab ? 'bg-cyan-300 text-slate-950' : 'bg-slate-900 text-slate-300'
              }`}
              key={tab}
              onClick={() => setTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
