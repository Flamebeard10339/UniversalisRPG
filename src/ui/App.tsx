import { useState, useSyncExternalStore } from 'react';
import { askedOption } from '../runtime/command';
import type { Driver } from './driver';
import { FloatingText } from './FloatingText';
import { Home } from './Home';
import { ModalSheet } from './ModalSheet';
import { Pager } from './Pager';
import { TabBar } from './TabBar';
import { OPENING_TAB, TABS } from './tabs';

export function App({ driver }: { driver: Driver }): JSX.Element {
  const snapshot = useSyncExternalStore(driver.subscribe, driver.snapshot, driver.snapshot);
  const [at, setAt] = useState(OPENING_TAB);
  const asking = snapshot.view ? askedOption(snapshot.view.modals) : undefined;

  const panes = TABS.map((tab) => (tab.id === 'home' ? <Home snapshot={snapshot} onChoose={driver.choose} /> : null));

  return (
    <div className="flex h-[100dvh] select-none flex-col overflow-hidden bg-background text-text">
      <main className="relative flex min-h-0 flex-1 flex-col">
        <Pager index={at} onIndex={setAt} panes={panes} />
        <FloatingText channel={driver.transient} />
      </main>
      <TabBar active={at} onSelect={setAt} />
      {asking ? <ModalSheet key={asking.key} option={asking} onAnswer={driver.answer} /> : null}
    </div>
  );
}
