import { useEffect, useMemo, useState } from 'react';
import { ActionPanel } from './components/ActionPanel';
import { ContributionMode } from './components/contribution/ContributionMode';
import { SkillBars } from './components/SkillBars';
import { WorldMap } from './components/WorldMap';
import { useGameState } from './stores/gameState';
import { useUniverseState } from './stores/universeState';

const getStartingLocationId = (bundle: NonNullable<ReturnType<typeof useUniverseState.getState>['bundle']>) =>
  bundle.locations.find((location) => location.starting)?.id ?? bundle.locations[0]?.id ?? '';

export default function App() {
  const [contributionMode, setContributionMode] = useState(false);
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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">UniversalisRPG</h1>
            <p className="text-sm text-slate-400">{t(bundle.manifest.titleKey)} - {t(bundle.manifest.descriptionKey ?? '')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              onChange={(event) => void setActiveUniverse(event.target.value)}
              value={activeUniverseId}
            >
              {manifests.map((manifest) => (
                <option key={manifest.id} value={manifest.id}>
                  {t(manifest.titleKey, manifest.id)}
                </option>
              ))}
            </select>
            <button
              className={`rounded px-3 py-2 text-sm font-semibold ${
                contributionMode ? 'bg-cyan-300 text-slate-950' : 'border border-slate-700 text-slate-100'
              }`}
              onClick={() => setContributionMode((value) => !value)}
              type="button"
            >
              Contribution mode
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[1fr_360px]">
        <section className="min-h-[560px] overflow-hidden rounded border border-slate-800 bg-slate-900">
          <WorldMap
            bundle={bundle}
            onTravel={(locationId) => setCurrentLocation(bundle.manifest.id, locationId)}
            playState={playState}
            t={t}
          />
        </section>

        <aside className="grid content-start gap-5 rounded border border-slate-800 bg-slate-900 p-4">
          <section>
            <h2 className="text-lg font-semibold">{t(currentLocation.titleKey)}</h2>
            <p className="mt-1 text-sm text-slate-400">{t(currentLocation.descriptionKey)}</p>
          </section>
          <ActionPanel
            bundle={bundle}
            onStartAction={(action) => startAction(bundle.manifest.id, action)}
            playState={playState}
            t={t}
          />
          <SkillBars bundle={bundle} playState={playState} t={t} />
          <section className="grid gap-2">
            <h2 className="text-base font-semibold text-slate-100">Resources</h2>
            {Object.keys(playState.resources).length === 0 ? (
              <p className="text-sm text-slate-500">No resources yet.</p>
            ) : (
              <dl className="grid gap-1 text-sm">
                {Object.entries(playState.resources).map(([resourceId, amount]) => (
                  <div className="flex justify-between gap-3" key={resourceId}>
                    <dt className="text-slate-300">{resourceId}</dt>
                    <dd className="text-slate-100">{amount}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </aside>
      </div>

      {contributionMode && (
        <div className="mx-auto max-w-7xl px-4 pb-8">
          <ContributionMode bundle={bundle} validationIssues={validationIssues} />
        </div>
      )}
    </main>
  );
}
