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
import { Home } from './Home';
import { JournalPane } from './JournalPane';
import { Ledger } from './Ledger';
import { LocationBanner } from './LocationBanner';
import { MapPane } from './MapPane';
import { newlyFound, type Place } from './discovery';
import { crossings, looked, nothingCrossed, noticed, stirring, type Crossings } from './levelling';
import { modulesOff, turned } from '../content/packs';
import { markOf, skillPanels, type XpMark } from './skillPanels';
import { SkillsPane } from './SkillsPane';
import { Notices } from './Notices';
import { noticesBetween } from './notice';
import { declaredFor, type Declared } from './modalManner';
import { ModalSheet } from './ModalSheet';
import type { LabelId } from './labels';
import { LAYERS, OPENING, pageRested, shellState, shownIn, subpageOf, toLayer, toSubpage, type Layer, type Subpage, type Where } from './nav';
import { Pager } from './Pager';
import { PlaytestBar } from './PlaytestBar';
import { ReplayBar } from './ReplayBar';
import { pageAt } from './replay';
import { revealing } from './reveal';
import { PlaneModal } from './PlaneModal';
import { QuestBody } from './QuestBody';
import { SkillBody } from './SkillBody';
import { StatBody } from './StatBody';
import { StatsPane } from './StatsPane';
import { carried, worn } from './sheet';
import { CancelUnderway } from './CancelUnderway';
import { StatusBanner } from './StatusBanner';
import { TabBar } from './TabBar';
import { useTestSurface } from './useTestSurface';
import { useWide } from './wide';
import { columnsIn } from './gesture';
import { wordsOf, type Words } from './words';
import { TransientProvider, type TransientChannel } from './transient';
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

function useNotices(view: PlayView, words: Words, channel: TransientChannel): void {
  const seen = useRef(view);

  useEffect(() => {
    const said = noticesBetween(seen.current, view, words);
    seen.current = view;
    for (const one of said) channel.note(one);
  }, [view]);
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

type Reading = NonNullable<PlayView['focus']>;

interface Drawing {
  readonly view: PlayView;
  readonly words: Words;
  readonly option: PlayView['modals'][number]['options'][number];
  readonly manner: Declared;
  readonly first: XpMark | null;
  readonly onAnswer: (key: string, value: string) => void;
}

interface FocusScreen {
  readonly instead?: JSX.Element;
  readonly beside?: JSX.Element;
}

type Draws<K extends Reading['kind']> = (focus: Extract<Reading, { kind: K }>, drawing: Drawing) => FocusScreen;

const FOCUS_SCREEN: { [K in Reading['kind']]: Draws<K> } = {
  plane: (focus, { view, words, option, manner, onAnswer }) => {
    const plane = view.planes.find((each) => each.instance === focus.instance);
    return plane === undefined ? {} : { instead: <PlaneModal plane={plane} option={option} manner={manner} words={words} onAnswer={onAnswer} /> };
  },
  quest: (focus, { view, words }) => {
    const entry = view.journal.find((each) => each.quest === focus.quest);
    return entry === undefined ? {} : { beside: <QuestBody entry={entry} words={words} /> };
  },
  stat: (focus, { view }) => {
    const row = view.stats.find((each) => each.id === focus.stat);
    return row === undefined ? {} : { beside: <StatBody row={row} /> };
  },
  skill: (focus, { view, words, first }) => {
    const panel = skillPanels(view.xp).find((each) => each.id === focus.skill);
    return panel === undefined ? {} : { beside: <SkillBody panel={panel} first={first} now={markOf(view)} words={words} /> };
  },
};

const focusScreen = (focus: PlayView['focus'], drawing: Drawing | null): FocusScreen =>
  focus === null || drawing === null ? {} : (FOCUS_SCREEN[focus.kind] as Draws<Reading['kind']>)(focus, drawing);

export function App({ driver, opening = OPENING, remembering = REMEMBER_AFTER_MS }: { driver: Driver; opening?: Where; remembering?: number }): JSX.Element {
  const snapshot = useSyncExternalStore(driver.subscribe, driver.snapshot, driver.snapshot);
  const [where, setWhere] = useState(opening);
  const [editing, setEditing] = useEditing(driver, remembering);
  const view = snapshot.view;
  const dev = snapshot.dev;
  const localizer = driver.localizer();
  const words = wordsOf(localizer);
  const asking = askedOption(view.modals);
  const { arrivals, generation } = useArrivals(view.discovered);
  const rows = view.xp;
  useNotices(view, words, driver.transient);
  const opened = useRef<XpMark | null>(null);
  if (opened.current === null) opened.current = markOf(view);
  const screen = focusScreen(view.focus, asking ? { view, words, option: asking, manner: declaredFor(view.focus), first: opened.current, onAnswer: driver.answer } : null);

  const page = shellState(where, dev, editing.commandLine);
  useEffect(() => {
    if (snapshot.playtest !== null && snapshot.replay === null) driver.playtest.moved(`${page.layer}/${page.subpage}`);
  }, [page.layer, page.subpage, snapshot.playtest === null, snapshot.replay === null]);

  const watched = snapshot.replay;
  const standingOn = watched === null ? null : pageAt(watched.steps, watched.at);
  useEffect(() => {
    if (standingOn === null) return;
    const layer = LAYERS.findIndex((each) => each.id === standingOn.layer);
    if (layer < 0) return;
    setWhere((held) => toSubpage(toLayer(held, layer), layer, standingOn.subpage as LabelId));
  }, [standingOn?.layer, standingOn?.subpage]);

  const leaving = dismissal(view.modals);
  const leave = leaving ? () => driver.answer(leaving.key, leaving.value) : undefined;

  const go = (next: Where | ((held: Where) => Where)): void => {
    leave?.();
    setWhere(next);
  };
  const shell = { where, go };
  const crossed = useCrossings(rows, subpageOf(where) === 'skills');

  const sections = useMemo(
    () => addressable([...driver.baseSources(), { name: LOCAL_CHANGES_MODULE_ID, text: driver.localChanges() ?? '' }]),
    [snapshot],
  );
  const declared = useMemo(() => driver.declared(), [snapshot]);
  const held = {
    sections,
    declared,
    standing: standingIn(view),
    places: [...view.discovered, ...view.undiscovered],
    editing,
    controls: editControls(
      { sections, declared, editing },
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

  useTestSurface('shell', { ...shell, dev, commandLine: editing.commandLine, showCommandLine: (shown) => setEditing({ ...editing, commandLine: shown }) });
  const turnMods = (names: readonly string[], on: boolean): void => driver.turnModulesOff(turned(modulesOff(snapshot.mods), names, on));

  useTestSurface('mods', { packs: snapshot.mods, controls: { turn: turnMods } });
  useTestSurface('playtest', { run: snapshot.playtest, controls: driver.playtest });
  useTestSurface('replay', { replay: snapshot.replay, controls: driver.replay });
  const wide = useWide();

  const pane = (layer: Layer, subpage: Subpage): JSX.Element | null => {
    if (layer.id === 'home') {
      if (subpage.id === 'home')
        return <Home snapshot={snapshot} words={words} commandLine={editing.commandLine} onChoose={driver.choose} onSend={driver.send} />;
      if (subpage.id === 'edit') return <EditPane held={held} words={words} />;
      return subpage.id === 'settings' ? (
        <SettingsPane
          dev={dev}
          speed={snapshot.speed}
          settings={view.settings}
          commandLine={editing.commandLine}
          words={words}
          localizer={localizer}
          onSend={driver.send}
          onCommandLine={(shown) => setEditing({ ...editing, commandLine: shown })}
          playtest={snapshot.playtest !== null}
          onPlaytest={(on) => (on ? driver.playtest.start() : driver.playtest.stop())}
          runs={driver.playtest.filed()}
          onReplayRun={driver.replay.watching}
          onRenameRun={driver.playtest.rename}
          onDropRun={driver.playtest.drop}
          mods={snapshot.mods}
          onTurnMods={turnMods}
        />
      ) : null;
    }
    if (layer.id === 'map') {
      return (
        <MapPane
          view={view}
          arrivals={arrivals}
          generation={generation}
          words={words}
          dev={dev}
          where={editing.map}
          onWhere={(map: MapWhere) => setEditing({ ...editing, map })}
          onSend={driver.send}
          onNote={driver.note}
        />
      );
    }
    if (subpage.id === 'stats') return <StatsPane view={view} localizer={localizer} onOpen={driver.readStat} />;
    if (subpage.id === 'skills') return <SkillsPane view={view} crossed={crossed} onOpen={driver.readSkill} />;
    if (subpage.id === 'equipment') return <Ledger entries={worn(view.equipment, view.carried, view.planes, localizer, words('empty'))} layout="doll" onOpen={driver.open} />;
    if (subpage.id === 'journal') return <JournalPane view={view} words={words} onOpen={driver.readQuest} />;
    return <Ledger entries={carried(view.carried, view.planes, localizer)} layout="grid" onOpen={driver.open} onSwap={driver.swap} />;
  };

  const paging = (at: number): { shown: readonly Subpage[]; columns: number; page: number } => {
    const shown = shownIn(LAYERS[at], dev);
    const columns = columnsIn(wide, shown.length);
    return { shown, columns, page: pageRested(shell.where, at, dev, columns) };
  };

  const bodies = LAYERS.map((layer, at) => {
    const { shown, columns, page } = paging(at);
    return (
      <Pager
        key={layer.id}
        index={page}
        columns={columns}
        onIndex={(index) => go((held) => toSubpage(held, at, shown[index].id))}
        panes={shown.map((subpage) => pane(layer, subpage))}
      />
    );
  });

  const here = paging(shell.where.layer);

  return (
    <TransientProvider value={driver.transient}>
      <div className="flex h-[100dvh] select-none flex-col overflow-hidden bg-background text-text">
        <main className="relative flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
          <DevBanner dev={dev} words={words} />
          {snapshot.playtest === null ? null : (
            <PlaytestBar
              run={snapshot.playtest}
              words={words}
              localizer={localizer}
              onAttach={driver.playtest.attach}
              onCopy={() => {
                if (typeof navigator !== 'undefined') void navigator.clipboard?.writeText(driver.playtest.written());
                driver.transient.note({ key: 'playtest-copied', count: 0, words: words('playtest-copied') });
              }}
              onStop={() => {
                const filing = driver.playtest.stop();
                driver.transient.note({ key: 'playtest-stopped', count: 0, words: filing.filed ? words('playtest-filed', { at: localizer.identifier(filing.at) }) : words('playtest-unfiled', { because: localizer.identifier(filing.because) }) });
              }}
            />
          )}
          {snapshot.replay === null ? null : (
            <ReplayBar
              test={snapshot.replay.test}
              steps={snapshot.replay.steps}
              at={snapshot.replay.at}
              playing={snapshot.replay.playing}
              delay={snapshot.replay.delay}
              failure={snapshot.replay.failure}
              words={words}
              localizer={localizer}
              onGoTo={driver.replay.at}
              onPlaying={driver.replay.playing}
              onDelay={driver.replay.every}
              onClose={() => driver.replay.watching(null)}
            />
          )}
          {snapshot.problems.length > 0 ? (
            <FaultBanner problems={snapshot.problems} remedies={snapshot.remedies} words={words} onRemedy={(remedy) => (remedy === 'clear-local' ? driver.clearLocalChanges() : tryAgain(driver))} />
          ) : null}
          <VStack
            layer={shell.where.layer}
            onLayer={(layer) => go((held) => toLayer(held, layer))}
            banners={[
              <LocationBanner key={`location-${generation}`} view={view} flash={generation > 0} />,
              <StatusBanner key="status" view={view} live={snapshot.live} speed={snapshot.speed} stirring={stirring(crossed)} />,
            ]}
            beside={[null, snapshot.live === null ? null : <CancelUnderway key="cancel" label={snapshot.live.label} onCancel={driver.cancel} />]}
            bodies={bodies}
          />
          <Notices channel={driver.transient} />
        </main>
        <TabBar
          words={words}
          tabs={here.shown}
          active={here.page}
          columns={here.columns}
          onSelect={(index) => go((held) => toSubpage(held, held.layer, here.shown[index].id))}
        />
        {screen.instead ??
          (asking ? (
            <ModalSheet option={asking} manner={declaredFor(view.focus)} onAnswer={driver.answer} onDismiss={leave} leaving={leaving?.value} spoken={view.said} paced={revealing(view.settings)}>
              {screen.beside}
            </ModalSheet>
          ) : null)}
      </div>
    </TransientProvider>
  );
}
