import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { askedOption } from '../runtime/command';
import { Console } from './Console';
import type { Driver } from './driver';
import { FloatingText } from './FloatingText';
import { Home } from './Home';
import { Ledger } from './Ledger';
import { LocationBanner } from './LocationBanner';
import { MapPane } from './MapPane';
import { newlyFound, type Place } from './discovery';
import { ModalSheet } from './ModalSheet';
import { LAYERS, OPENING, subpageOf, toLayer, toSubpage, type Layer, type Subpage } from './nav';
import { Pager } from './Pager';
import { counted, named } from './sheet';
import { StatusBanner } from './StatusBanner';
import { TabBar } from './TabBar';
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

export function App({ driver }: { driver: Driver }): JSX.Element {
  const snapshot = useSyncExternalStore(driver.subscribe, driver.snapshot, driver.snapshot);
  const [where, setWhere] = useState(OPENING);
  const view = snapshot.view;
  const asking = view ? askedOption(view.modals) : undefined;
  const { arrivals, generation } = useArrivals(view?.discovered ?? []);

  const pane = (layer: Layer, subpage: Subpage): JSX.Element | null => {
    if (layer.id === 'home') {
      if (subpage.id === 'home') return <Home snapshot={snapshot} onChoose={driver.choose} onCancel={driver.cancel} />;
      return subpage.id === 'edit' ? <Console onSend={driver.send} /> : null;
    }
    if (layer.id === 'map') return <MapPane view={view} arrivals={arrivals} generation={generation} onChoose={driver.choose} />;
    if (subpage.id === 'stats') return <Ledger entries={counted(view?.stats ?? {})} />;
    if (subpage.id === 'skills') return <Ledger entries={counted(view?.xp ?? {})} />;
    if (subpage.id === 'equipment') return <Ledger entries={named(view?.equipment ?? {})} />;
    return <Ledger entries={counted(view?.inventory ?? {})} />;
  };

  const bodies = LAYERS.map((layer, at) => (
    <Pager
      key={layer.id}
      index={where.subpage[at]}
      onIndex={(index) => setWhere((held) => toSubpage(held, at, index))}
      panes={layer.subpages.map((subpage) => pane(layer, subpage))}
    />
  ));

  return (
    <div className="flex h-[100dvh] select-none flex-col overflow-hidden bg-background text-text">
      <main className="relative flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
        <VStack
          layer={where.layer}
          onLayer={(layer) => setWhere((held) => toLayer(held, layer))}
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
      <TabBar tabs={LAYERS[where.layer].subpages} active={subpageOf(where)} onSelect={(index) => setWhere((held) => toSubpage(held, held.layer, index))} />
      {asking ? <ModalSheet key={asking.key} option={asking} onAnswer={driver.answer} /> : null}
    </div>
  );
}
