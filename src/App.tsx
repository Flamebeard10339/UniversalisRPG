import { useEffect, useMemo, useState } from 'react';
import { ActionPanel } from './components/ActionPanel';
import { ChatPanel } from './components/ChatPanel';
import { ContributionMode } from './components/contribution/ContributionMode';
import { SkillBars } from './components/SkillBars';
import { WorldMap } from './components/WorldMap';
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
  const setCurrentLocation = useGameState((state) => state.setCurrentLocation);
  const startAction = useGameState((state) => state.startAction);
  const tick = useGameState((state) => state.tick);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const startingLocationId = useMemo(() => (bundle ? getStartingLocationId(bundle) : ''), [bundle]);
  const playState = bundle ? getUniverseState(bundle.manifest.id, startingLocationId) : null;
  const currentLocation = bundle?.locations.find((location) => location.id === playState?.currentLocationId);

  useEffect(() => {
    if (bundle && startingLocationId) {
      void hydratePlayState(bundle.manifest.id, startingLocationId);
    }
  }, [bundle, hydratePlayState, startingLocationId]);

  useEffect(() => {
    if (!bundle) {
      return undefined;
    }

    const interval = window.setInterval(() => tick(bundle.manifest.id, bundle.actions), 1000);
    return () => window.clearInterval(interval);
  }, [bundle, tick]);

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
    <main className="min-h-screen bg-slate-950 pb-20 text-slate-100">
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
        <section className="h-[calc(100vh-150px)] min-h-[480px] overflow-hidden rounded border border-slate-800 bg-slate-900">
          <WorldMap
            bundle={bundle}
            onTravel={(locationId) => setCurrentLocation(bundle.manifest.id, locationId)}
            playState={playState}
            t={t}
          />
        </section>
        )}

        {activeTab === 'home' && (
          <section className="grid h-[calc(100vh-150px)] min-h-[560px] gap-4">
            <section className="rounded border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-lg font-semibold">{t(currentLocation.titleKey)}</h2>
              <p className="mt-1 text-sm text-slate-400">{t(currentLocation.descriptionKey)}</p>
            </section>

            <section className="rounded border border-slate-800 bg-slate-900 p-4">
          <ActionPanel
            bundle={bundle}
            onStartAction={(action) => startAction(bundle.manifest.id, action)}
            playState={playState}
            t={t}
          />
            </section>

            <ChatPanel locationName={t(currentLocation.titleKey)} />
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
                  onClick={() => setCharacterTab(tab)}
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
                  onChange={(event) => setContributionMode(event.target.checked)}
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
                  onChange={(event) => void setActiveUniverse(event.target.value)}
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
              onClick={() => setActiveTab(tab)}
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
