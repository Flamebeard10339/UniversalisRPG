import { useState, useSyncExternalStore } from 'react';
import { askedOption } from '../runtime/command';
import type { Driver } from './driver';
import { FloatingText } from './FloatingText';
import { Home } from './Home';
import { LocationBanner } from './LocationBanner';
import { ModalSheet } from './ModalSheet';
import { LAYERS, OPENING, subpageOf, toLayer, toSubpage, type Layer, type Subpage } from './nav';
import { Pager } from './Pager';
import { StatusBanner } from './StatusBanner';
import { TabBar } from './TabBar';
import { VStack } from './VStack';

export function App({ driver }: { driver: Driver }): JSX.Element {
  const snapshot = useSyncExternalStore(driver.subscribe, driver.snapshot, driver.snapshot);
  const [where, setWhere] = useState(OPENING);
  const asking = snapshot.view ? askedOption(snapshot.view.modals) : undefined;

  const pane = (layer: Layer, subpage: Subpage): JSX.Element | null =>
    layer.id === 'home' && subpage.id === 'home' ? <Home snapshot={snapshot} onChoose={driver.choose} onCancel={driver.cancel} /> : null;

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
          banners={[<LocationBanner key="location" view={snapshot.view} />, <StatusBanner key="status" view={snapshot.view} />]}
          bodies={bodies}
        />
        <FloatingText channel={driver.transient} />
      </main>
      <TabBar tabs={LAYERS[where.layer].subpages} active={subpageOf(where)} onSelect={(index) => setWhere((held) => toSubpage(held, held.layer, index))} />
      {asking ? <ModalSheet key={asking.key} option={asking} onAnswer={driver.answer} /> : null}
    </div>
  );
}
