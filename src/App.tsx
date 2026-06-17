import { useEffect, useMemo, useState } from 'react';
import { ActionPanel } from './components/ActionPanel';
import { ChatPanel } from './components/ChatPanel';
import { ContributionMode } from './components/contribution/ContributionMode';
import { SkillBars } from './components/SkillBars';
import { TravelStatus } from './components/TravelStatus';
import { WorldMap } from './components/WorldMap';
import { locationTitleKey } from './game/contentIds';
import { useDebugState } from './stores/debugState';
import { useGameState } from './stores/gameState';
import { useUniverseState } from './stores/universeState';

const getStartingLocationId = (bundle: NonNullable<ReturnType<typeof useUniverseState.getState>['bundle']>) =>
  bundle.locations.find((location) => location.starting)?.id ?? bundle.locations[0]?.id ?? '';

type AppTab = 'map' | 'home' | 'character' | 'settings';
type CharacterTab = 'skills' | 'inventory';
const APP_VERSION = '0.1.0';

export default function App() {
  const [contributionMode, setContributionMode] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [characterTab, setCharacterTab] = useState<CharacterTab>('skills');
  const {
    activeUniverseId,
    bundle,
    manifests,
    validationIssues,
    loading,
    error,
    initialize,
    setActiveUniverse,
    t,
  } = useUniverseState();
  const hydratePlayState = useGameState((state) => state.hydrate);
  const getUniverseState = useGameState((state) => state.getUniverseState);
  const gameStates = useGameState((state) => state.states);
  const travelTo = useGameState((state) => state.travelTo);
  const cancelTravel = useGameState((state) => state.cancelTravel);
  const startAction = useGameState((state) => state.startAction);
  const resolveDue = useGameState((state) => state.resolveDue);
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

              <label className="flex items-center justify-between gap-4 rounded border border-slate-800 bg-slate-950 p-3">
                <span>
                  <span className="block text-sm font-semibold text-slate-100">Contribution mode</span>
                  <span className="block text-xs text-slate-400">Enable local JSON editing and GitHub issue packaging.</span>
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

              <label className="flex items-center justify-between gap-4 rounded border border-slate-800 bg-slate-950 p-3">
                <span>
                  <span className="block text-sm font-semibold text-slate-100">Debug mode</span>
                  <span className="block text-xs text-slate-400">Log user actions for troubleshooting.</span>
                </span>
                <input
                  checked={debugEnabled}
                  className="h-5 w-5"
                  onChange={(event) => setDebugEnabled(event.target.checked)}
                  type="checkbox"
                />
              </label>

              <div className="flex items-center justify-between gap-4 rounded border border-slate-800 bg-slate-950 p-3">
                <span className="text-sm font-semibold text-slate-100">Version</span>
                <span className="text-sm text-slate-300">{APP_VERSION}</span>
              </div>

              <label className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-3">
                <span className="text-sm font-semibold text-slate-100">Universe</span>
                <select
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
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

            {debugEnabled && (
              <section className="grid gap-3 rounded border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-100">Debug log</h2>
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

            {contributionMode && <ContributionMode bundle={bundle} validationIssues={validationIssues} />}
          </section>
        )}
      </div>

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
