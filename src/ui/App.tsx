import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { askedOption } from '../runtime/command';
import type { PlayView } from '../runtime/session';
import { dismissal } from './asking';
import { addressable, NOWHERE, type Standing } from './authoringSurface';
import type { Driver } from './driver';
import { editControls } from './editControls';
import { EditPane } from './EditPane';
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

// How often the lines at the top are looked at. Fine enough that the half
// second between two of them is measured rather than rounded to, and coarse
// enough that a screen with nothing to say costs no timer at all.
const NOTE_TICK_MS = 100;

// What the world just gave, as lines. The engine publishes what a skill has and
// what the player is carrying, never what either just got, so both are the
// difference between two views — which is also why this is held here, above
// every page, rather than on whichever page happens to be about one of them.
function useXpNotes(view: PlayView | null, clock: () => number): readonly Note[] {
  const rows = view?.xp ?? [];
  const carried = view?.carried ?? [];
  const seen = useRef({ rows, carried });
  const [queue, setQueue] = useState(emptyQueue);

  useEffect(() => {
    const gains = gainsBetween(seen.current.rows, rows);
    const arrivals = arrivalsBetween(seen.current.carried, carried);
    seen.current = { rows, carried };
    if (gains.length + arrivals.length > 0) setQueue((held) => poured(heard(held, gains, arrivals, clock()), clock()));
  }, [rows, carried]);

  // A line waiting on the spacing has to reach the screen without anything else
  // happening, and one already shown has to leave the same way.
  const settled = queue.waiting.length === 0 && queue.shown.length === 0;
  useEffect(() => {
    if (settled) return;
    const timer = setInterval(() => setQueue((held) => poured(held, clock())), NOTE_TICK_MS);
    return () => clearInterval(timer);
  }, [settled]);

  return queue.shown;
}

// Which skills have gone up a level and not been looked at. Noticed wherever
// the player is standing, and settled by the page itself being opened.
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

// How long the shell waits before writing down where the author is. A pan
// settles the sheet on every frame and a slot is not a thing to write sixty
// times a second; short enough that a reload after a pause loses nothing, which
// is what c10 asks and the whole of what it asks about the cadence. A staged
// edit does not wait on this — it goes through the driver as it is staged.
export const REMEMBER_AFTER_MS = 400;

// What the author is looking at, kept in the store the edits are in. Read once,
// because it is where a page opens and not a thing the store goes on deciding.
function useEditing(driver: Driver, after: number): [Editing, (next: Editing) => void] {
  const [editing, setEditing] = useState<Editing>(() => remembered(driver.editorMemory.read()));

  useEffect(() => {
    const timer = setTimeout(() => driver.editorMemory.write(recorded(editing)), after);
    return () => clearTimeout(timer);
  }, [editing]);

  return [editing, setEditing];
}

// Where the player is, as the view publishes it: what the Local surface is
// narrowed to is a fact read off the session rather than one worked out here.
const standingIn = (view: PlayView | null): Standing => (view ? { location: view.location.id, entities: view.entities.map((entity) => entity.id) } : NOWHERE);

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
  // Read every render rather than held: `/dsl` adopts a new registry, and the
  // language being played is the session's rather than the shell's (c3).
  const localizer = driver.localizer();
  const words = wordsOf(localizer);
  const asking = view ? askedOption(view.modals) : undefined;
  // Drawn because the engine says one is in hand, never because the shell
  // recognised the screen holding it: the focus is a published field and the
  // screen's name is not a thing this layer can read. A screen with a plane in
  // hand is drawn as that plane rather than as a list of its values, so the
  // option sheet is what every other screen gets.
  const plane = view?.focus ? (view.planes.find((each) => each.instance === view.focus?.instance) ?? null) : null;
  const { arrivals, generation } = useArrivals(view?.discovered ?? []);
  const rows = view?.xp ?? [];
  const notes = useXpNotes(view, clock);
  // Where the session's own reading of how fast experience arrives is measured
  // from. The engine keeps no such field: a rate is a fact about the play.
  const opened = useRef<XpMark | null>(null);
  if (opened.current === null && view) opened.current = markOf(view);

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
  const crossed = useCrossings(rows, LAYERS[where.layer].subpages[subpageOf(where)].id === 'skills');

  // The one list, rebuilt when the module an author is editing changes and not
  // on every frame: splitting every shipped module into sections is the whole
  // survey, and what makes it move is a staged edit landing.
  // Read off the store once per snapshot rather than once per render: the store
  // moves when the driver publishes and at no other time, and where the map is
  // looking moves far more often than that.
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
        // The bytes the store holds, handed to the author. Offered rather than
        // relied on: a browser that refuses the clipboard has still printed
        // them, which is the same command and the same bytes.
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
      return subpage.id === 'edit' ? <EditPane held={held} onSend={driver.send} words={words} /> : null;
    }
    if (layer.id === 'map') {
      return (
        <MapPane
          view={view}
          arrivals={arrivals}
          generation={generation}
          words={words}
          onChoose={driver.choose}
          sections={sections}
          where={editing.map}
          onWhere={(map: MapWhere) => setEditing({ ...editing, map })}
          onSend={driver.send}
          onNote={driver.note}
        />
      );
    }
    if (subpage.id === 'stats') return <Ledger entries={counted(view?.stats ?? [], localizer)} />;
    if (subpage.id === 'skills') return <SkillsPane view={view} first={opened.current} crossed={crossed} words={words} />;
    // Both sides of what the player has are rows that act, because c21 puts a
    // worn copy on this page and nowhere else and the verbs it offers are
    // reachable from nowhere else either.
    if (subpage.id === 'equipment') return <Ledger entries={worn(view?.equipment ?? [], view?.carried ?? [], view?.planes ?? [], localizer, words('empty'))} onOpen={driver.open} />;
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
