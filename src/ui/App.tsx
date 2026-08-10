import { useRef, useState, useSyncExternalStore } from 'react';
import { askedOption } from '../runtime/command';
import type { Driver } from './driver';
import { FloatingText } from './FloatingText';
import { swipes, swipeStep } from './gesture';
import { Home } from './Home';
import { ModalSheet } from './ModalSheet';
import { TabBar } from './TabBar';
import { OPENING_TAB, tabAfter, type TabId } from './tabs';

export function App({ driver }: { driver: Driver }): JSX.Element {
  const snapshot = useSyncExternalStore(driver.subscribe, driver.snapshot, driver.snapshot);
  const [tab, setTab] = useState<TabId>(OPENING_TAB);
  const from = useRef<{ x: number; y: number } | null>(null);
  const asking = snapshot.view ? askedOption(snapshot.view.modals) : undefined;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-text">
      <main
        className="relative flex min-h-0 flex-1 flex-col"
        onPointerDown={(event) => {
          from.current = swipes(event.pointerType) ? { x: event.clientX, y: event.clientY } : null;
        }}
        onPointerUp={(event) => {
          const start = from.current;
          from.current = null;
          if (!start) return;
          const step = swipeStep(event.clientX - start.x, event.clientY - start.y);
          if (step !== 0) setTab((current) => tabAfter(current, step));
        }}
      >
        {tab === 'home' ? <Home snapshot={snapshot} onChoose={driver.choose} /> : <div className="flex-1" />}
        <FloatingText channel={driver.transient} />
      </main>
      <TabBar active={tab} onSelect={setTab} />
      {asking ? <ModalSheet key={asking.key} option={asking} onAnswer={driver.answer} /> : null}
    </div>
  );
}
