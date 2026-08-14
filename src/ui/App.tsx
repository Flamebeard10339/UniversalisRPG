import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { askedOption } from '../runtime/command';
import { dismissal } from './asking';
import { Console } from './Console';
import type { Driver } from './driver';
import { FloatingText } from './FloatingText';
import { Home } from './Home';
import { Ledger } from './Ledger';
import { LocationBanner } from './LocationBanner';
import { MapPane } from './MapPane';
import { newlyFound, type Place } from './discovery';
import { ModalSheet } from './ModalSheet';
import { LAYERS, OPENING, subpageOf, toLayer, toSubpage, type Layer, type Subpage, type Where } from './nav';
import { Pager } from './Pager';
import { focusedPlane } from './plane';
import { PlanePane } from './PlanePane';
import { carried, counted, worn } from './sheet';
import { StatusBanner } from './StatusBanner';
import { TabBar } from './TabBar';
import { useTestSurface } from './testSurface';
import { wordsOf } from './words';
import { TransientProvider } from './transient';
import { VStack } from './VStack';

// What the world just gave up, and a count of how many times it has. The count
// is what re-keys the flash: the same place discovered again after a load is a
// new acknowledgement, and a React key that never changes plays no animation.
// The opening view seeds the comparison, so the places a session starts knowing
// do not all arrive at once on the first frame.
function useArrivals(discovered: readonly Place[]): { arrivals: readonly string[]; generation: number } {
  const seen = useRef(discovered);
  const [found, setFound] = useState<{ arrivals: readonly string[]; generation: number }>({ arrivals: [], generation: 0 });

  useEffect(() => {
    const arrived = newlyFound(seen.current, discovered);
    seen.current = discovered;
    if (arrived.length > 0) setFound((held) => ({ arrivals: arrived, generation: held.generation + 1 }));
  }, [discovered]);

  return found;
}

export function App({ driver, opening = OPENING }: { driver: Driver; opening?: Where }): JSX.Element {
  const snapshot = useSyncExternalStore(driver.subscribe, driver.snapshot, driver.snapshot);
  const [where, setWhere] = useState(opening);
  const view = snapshot.view;
  // Read every render rather than held: `/dsl` adopts a new registry, and the
  // language being played is the session's rather than the shell's (c3).
  const localizer = driver.localizer();
  const words = wordsOf(localizer);
  const asking = view ? askedOption(view.modals) : undefined;
  // Drawn because the engine says one is in hand, never because the shell
  // recognised the screen holding it: the focus is a published field and the
  // screen's name is not a thing this layer can read.
  const plane = focusedPlane(view, localizer);
  const { arrivals, generation } = useArrivals(view?.discovered ?? []);

  // The one answer a gesture away from the open screen makes: the value that
  // screen published as the way out of itself, or nothing where it published
  // none (c19). Both gestures this shell has go through it, so a click on the
  // sheet's ground and a move to another page say the same thing and neither
  // has a way out the other has not got.
  const leaving = view ? dismissal(view.modals) : null;
  const leave = leaving ? () => driver.answer(leaving.key, leaving.value) : undefined;

  // Assembled once and both drawn from and handed over, the way the map's is:
  // where the nav is standing is one value, and there is no second statement of
  // it for a registration to get wrong. Every handler goes through the one `go`,
  // and passes it a function, because what they read has to be the latest state
  // and not the render's — the seam is about what is drawn, and a nav that lost
  // a tap to batching would be a real defect bought for a test.
  const go = (next: Where | ((held: Where) => Where)): void => {
    leave?.();
    setWhere(next);
  };
  const shell = { where, go };

  useTestSurface('shell', shell);

  const pane = (layer: Layer, subpage: Subpage): JSX.Element | null => {
    if (layer.id === 'home') {
      if (subpage.id === 'home') return <Home snapshot={snapshot} onChoose={driver.choose} onCancel={driver.cancel} />;
      return subpage.id === 'edit' ? <Console onSend={driver.send} words={words} /> : null;
    }
    if (layer.id === 'map') return <MapPane view={view} arrivals={arrivals} generation={generation} onChoose={driver.choose} />;
    if (subpage.id === 'stats') return <Ledger entries={counted(view?.stats ?? [], localizer)} />;
    if (subpage.id === 'skills') return <Ledger entries={counted(view?.xp ?? [], localizer)} />;
    // Both sides of what the player has are rows that act, because c21 puts a
    // worn copy on this page and nowhere else and the verbs it offers are
    // reachable from nowhere else either.
    if (subpage.id === 'equipment') return <Ledger entries={worn(view?.carried ?? [], view?.planes ?? [], localizer)} onOpen={driver.open} />;
    return <Ledger entries={carried(view?.carried ?? [], view?.planes ?? [], localizer)} onOpen={driver.open} />;
  };

  const bodies = LAYERS.map((layer, at) => (
    <Pager
      key={layer.id}
      index={shell.where.subpage[at]}
      onIndex={(index) => go((held) => toSubpage(held, at, index))}
      panes={layer.subpages.map((subpage) => pane(layer, subpage))}
    />
  ));

  return (
    <TransientProvider value={driver.transient}>
      <div className="flex h-[100dvh] select-none flex-col overflow-hidden bg-background text-text">
        <main className="relative flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
          <VStack
            layer={shell.where.layer}
            onLayer={(layer) => go((held) => toLayer(held, layer))}
            banners={[
              // Re-keyed on a discovery, so the banner that is the handle to the
              // Map plays the same arrival the Map's own row does. That is the
              // acknowledgement a player standing on Home gets.
              <LocationBanner key={`location-${generation}`} view={view} flash={generation > 0} />,
              <StatusBanner key="status" view={view} />,
            ]}
            bodies={bodies}
          />
          <FloatingText channel={driver.transient} />
        </main>
        <TabBar words={words} tabs={LAYERS[shell.where.layer].subpages} active={subpageOf(shell.where)} onSelect={(index) => go((held) => toSubpage(held, held.layer, index))} />
        {asking ? (
          <ModalSheet option={asking} onAnswer={driver.answer} onDismiss={leave}>
            {plane ? <PlanePane plane={plane} /> : null}
          </ModalSheet>
        ) : null}
      </div>
    </TransientProvider>
  );
}
