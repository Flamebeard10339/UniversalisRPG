import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { askedOption } from '../runtime/command';
import type { PlayView } from '../runtime/session';
import { dismissal } from './asking';
import { addressable, type Standing } from './authoringSurface';
import type { Driver } from './driver';
import { editControls } from './editControls';
import { EditPane } from './EditPane';
import { DevBanner } from './DevBanner';
import { FaultBanner } from './FaultBanner';
import { SettingsPane } from './SettingsPane';
import { recorded, remembered, type Editing, type MapWhere } from './editorMemory';
import { FloatingText } from './FloatingText';
import { Home } from './Home';
import { Ledger } from './Ledger';
import { LocationBanner } from './LocationBanner';
import { MapPane } from './MapPane';
import { newlyFound, type Place } from './discovery';
import { crossings, looked, nothingCrossed, noticed, stirring, type Crossings } from './levelling';
import { markOf, type XpMark } from './skillPanels';
import { SkillsPane } from './SkillsPane';
import { XpOverlay } from './XpOverlay';
import { arrivalsBetween, emptyQueue, gainsBetween, heard, poured, type Note } from './xpNotes';
import { ModalSheet } from './ModalSheet';
import { LAYERS, OPENING, subpageOf, toLayer, toSubpage, type Layer, type Subpage, type Where } from './nav';
import { Pager } from './Pager';
import { PlaneModal } from './PlaneModal';
import { carried, counted, worn } from './sheet';
import { StatusBanner } from './StatusBanner';
import { TabBar } from './TabBar';
import { useTestSurface } from './useTestSurface';
import { wordsOf } from './words';
import { TransientProvider } from './transient';
import { VStack } from './VStack';

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

const NOTE_TICK_MS = 100;

function useXpNotes(view: PlayView, clock: () => number): readonly Note[] {
  const rows = view.xp;
  const carried = view.carried;
  const seen = useRef({ rows, carried });
  const [queue, setQueue] = useState(emptyQueue);

  useEffect(() => {
    const gains = gainsBetween(seen.current.rows, rows);
    const arrivals = arrivalsBetween(seen.current.carried, carried);
    seen.current = { rows, carried };
    if (gains.length + arrivals.length > 0) setQueue((held) => poured(heard(held, gains, arrivals, clock()), clock()));
  }, [rows, carried]);

  const settled = queue.waiting.length === 0 && queue.shown.length === 0;
  useEffect(() => {
    if (settled) return;
    const timer = setInterval(() => setQueue((held) => poured(held, clock())), NOTE_TICK_MS);
    return () => clearInterval(timer);
  }, [settled]);

  return queue.shown;
}

function useCrossings(rows: PlayView['xp'], onSkills: boolean): Crossings {
  const seen = useRef(rows);
  const [held, setHeld] = useState(nothingCrossed);

  useEffect(() => {
    const crossed = crossings(seen.current, rows);
    seen.current = rows;
    if (crossed.length > 0) setHeld((was) => noticed(was, crossed));
  }, [rows]);

  useEffect(() => {
    if (onSkills) setHeld(looked);
  }, [onSkills, held.waiting.size > 0]);

  return held;
}

export const REMEMBER_AFTER_MS = 400;

function useEditing(driver: Driver, after: number): [Editing, (next: Editing) => void] {
  const [editing, setEditing] = useState<Editing>(() => remembered(driver.editorMemory.read()));

  useEffect(() => {
    const timer = setTimeout(() => driver.editorMemory.write(recorded(editing)), after);
    return () => clearTimeout(timer);
  }, [editing]);

  return [editing, setEditing];
}

export type Retry = 'reload' | 'reopen';

export const retrying = (onAPage: boolean): Retry => (onAPage ? 'reload' : 'reopen');

function tryAgain(driver: Driver): void {
  if (retrying(typeof window !== 'undefined') === 'reopen') {
    driver.reopen();
    return;
  }
  window.location.reload();
}

const standingIn = (view: PlayView): Standing => ({ location: view.location.id, entities: view.entities.map((entity) => entity.id) });

export function App({
  driver,
  opening = OPENING,
  clock = () => Date.now(),
  remembering = REMEMBER_AFTER_MS,
}: {
  driver: Driver;
  opening?: Where;
  clock?: () => number;
  remembering?: number;
}): JSX.Element {
  const snapshot = useSyncExternalStore(driver.subscribe, driver.snapshot, driver.snapshot);
  const [where, setWhere] = useState(opening);
  const [editing, setEditing] = useEditing(driver, remembering);
  const view = snapshot.view;
  const dev = snapshot.dev;
  const localizer = driver.localizer();
  const words = wordsOf(localizer);
  const asking = askedOption(view.modals);
  const plane = view.focus ? (view.planes.find((each) => each.instance === view.focus?.instance) ?? null) : null;
  const { arrivals, generation } = useArrivals(view.discovered);
  const rows = view.xp;
  const notes = useXpNotes(view, clock);
  const opened = useRef<XpMark | null>(null);
  if (opened.current === null) opened.current = markOf(view);

  const leaving = dismissal(view.modals);
  const leave = leaving ? () => driver.answer(leaving.key, leaving.value) : undefined;

  const go = (next: Where | ((held: Where) => Where)): void => {
    leave?.();
    setWhere(next);
  };
  const shell = { where, go };
  const crossed = useCrossings(rows, LAYERS[where.layer].subpages[subpageOf(where)].id === 'skills');

  const sections = useMemo(
    () => addressable([...driver.baseSources(), { name: LOCAL_CHANGES_MODULE_ID, text: driver.localChanges() ?? '' }]),
    [snapshot],
  );
  const held = {
    sections,
    standing: standingIn(view),
    editing,
    controls: editControls(
      { sections, editing },
      {
        send: driver.send,
        note: driver.note,
        move: setEditing,
        hand: () => {
          const text = driver.localChanges();
          if (text !== null && typeof navigator !== 'undefined') void navigator.clipboard?.writeText(text);
        },
      },
    ),
  };

  useTestSurface('shell', shell);

  const pane = (layer: Layer, subpage: Subpage): JSX.Element | null => {
    if (layer.id === 'home') {
      if (subpage.id === 'home') return <Home snapshot={snapshot} onChoose={driver.choose} onCancel={driver.cancel} />;
      if (subpage.id === 'edit') return <EditPane held={held} dev={dev} onSend={driver.send} words={words} />;
      return subpage.id === 'settings' ? <SettingsPane dev={dev} speed={snapshot.speed} words={words} onSend={driver.send} /> : null;
    }
    if (layer.id === 'map') {
      return (
        <MapPane
          view={view}
          arrivals={arrivals}
          generation={generation}
          words={words}
          dev={dev}
          sections={sections}
          where={editing.map}
          onWhere={(map: MapWhere) => setEditing({ ...editing, map })}
          onSend={driver.send}
          onNote={driver.note}
        />
      );
    }
    if (subpage.id === 'stats') return <Ledger entries={counted(view.stats, localizer)} />;
    if (subpage.id === 'skills') return <SkillsPane view={view} first={opened.current} crossed={crossed} words={words} />;
    if (subpage.id === 'equipment') return <Ledger entries={worn(view.equipment, view.carried, view.planes, localizer, words('empty'))} onOpen={driver.open} />;
    return <Ledger entries={carried(view.carried, view.planes, localizer)} onOpen={driver.open} />;
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
          <DevBanner dev={dev} words={words} />
          {snapshot.problems.length > 0 ? (
            <FaultBanner problems={snapshot.problems} remedies={snapshot.remedies} words={words} onRemedy={(remedy) => (remedy === 'clear-local' ? driver.clearLocalChanges() : tryAgain(driver))} />
          ) : null}
          <VStack
            layer={shell.where.layer}
            onLayer={(layer) => go((held) => toLayer(held, layer))}
            banners={[
              <LocationBanner key={`location-${generation}`} view={view} flash={generation > 0} />,
              <StatusBanner key="status" view={view} stirring={stirring(crossed)} />,
            ]}
            bodies={bodies}
          />
          <FloatingText channel={driver.transient} />
          <XpOverlay notes={notes} />
        </main>
        <TabBar words={words} tabs={LAYERS[shell.where.layer].subpages} active={subpageOf(shell.where)} onSelect={(index) => go((held) => toSubpage(held, held.layer, index))} />
        {asking && plane ? <PlaneModal plane={plane} option={asking} words={words} onAnswer={driver.answer} /> : null}
        {asking && !plane ? <ModalSheet option={asking} onAnswer={driver.answer} onDismiss={leave} /> : null}
      </div>
    </TransientProvider>
  );
}
