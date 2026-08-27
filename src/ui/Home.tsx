import { useEffect, useRef, useState } from 'react';
import { COMPASS, compassOf, sheetOf } from '../runtime/map';
import type { Localized } from '../runtime/localized';
import { sheetOffers, type PlayView } from '../runtime/session';
import { drawsNothing, offerCells } from './choices';
import { Console } from './Console';
import type { DriverSnapshot } from './driver';
import { SPLIT_DEFAULT, splitFrom } from './gesture';
import { fillOf, SHAPE_CLASS, TONE_CLASS, VOICE_CLASS } from './lineStyle';
import { restingAt, startedAt } from './logRest';
import { GRID } from './sheetLayout';
import { Splitter } from './Splitter';
import type { LogEntry } from './transcript';
import { useMoment } from './transient';
import type { Words } from './words';

const WORDS_CLASS: Record<LogEntry['words'], string> = { player: '', tool: 'font-mono text-text-muted' };

function Line({ entry, measure }: { entry: LogEntry; measure: (element: HTMLElement | null) => void }): JSX.Element {
  const tone = entry.kind === 'message' ? TONE_CLASS[entry.tone] : '';
  const arrived = useMoment('arrival', true, String(entry.id));
  return (
    <p ref={measure} className={`${arrived} -mx-1 whitespace-pre-wrap break-words rounded px-1 text-sm leading-snug ${SHAPE_CLASS[entry.kind]} ${WORDS_CLASS[entry.words]} ${VOICE_CLASS[entry.kind]} ${tone}`}>
      {entry.repeats > 1 ? <span className="tabular-nums text-text-subtle">{`(${entry.repeats}) `}</span> : null}
      {entry.text}
    </p>
  );
}

// The ways out, laid out the way they lie: north-east is the square at the top right, and the
// square in the middle is the room the player is standing in. Which square a way belongs in is the
// engine's judgement, read off the map's own sheet — the compass and the bubbles on the map pane are
// pointing the same way because they are one answer, not two.
function Compass({ compass, here, onChoose }: { compass: ReturnType<typeof compassOf>; here: Localized; onChoose: (position: number) => void }): JSX.Element {
  return (
    <div data-drive="compass" className="mx-auto mt-3 grid max-w-2xl grid-cols-3 gap-2">
      {COMPASS.map((bearing, at) => {
        const way = compass.cells[at];
        if (bearing === null) {
          return (
            <p key="here" className="flex items-center justify-center rounded-2xl border border-dashed border-border px-2 py-2 text-center text-xs text-text-subtle">
              {here}
            </p>
          );
        }
        if (way === null) return <span key={bearing} aria-hidden className="rounded-2xl border border-dashed border-border/40" />;
        return (
          <button
            key={bearing}
            data-drive="choose"
            data-bearing={bearing}
            type="button"
            onClick={() => onChoose(way.at)}
            className="rounded-2xl border border-border bg-panel px-2 py-2 text-xs font-medium transition-transform duration-75 active:scale-[0.97] active:border-accent active:bg-accent-strong active:text-accent-text"
          >
            {way.label}
          </button>
        );
      })}
    </div>
  );
}

function Sheet({ view, words, onChoose }: { view: PlayView; words: Words; onChoose: (position: number) => void }): JSX.Element {
  const compass = compassOf(sheetOf(view, null).ways);
  // A way out drawn in its own square is not drawn again among the rest; one that no square points
  // at — a floor up or down, a second road the same way — falls through to the ordinary cells.
  const squared = new Set(compass.cells.filter((cell) => cell !== null).map((cell) => cell!.at));
  const offers = sheetOffers(view).filter((offer) => !squared.has(offer.position));
  if (drawsNothing(sheetOffers(view))) return <p className="px-3 py-6 text-center text-sm text-text-subtle">{words('sheet-empty')}</p>;
  return (
    <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-1">
      <div className={`mx-auto max-w-2xl ${GRID}`}>
        {offerCells(offers).map((cell) => (
          <div key={String(cell.of ?? cell.offers[0]?.id)} style={fillOf(cell.group)} className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-panel active:border-accent">
            {cell.examine ? (
              <button
                data-drive="choose"
                type="button"
                aria-label={cell.examine.label}
                onClick={() => onChoose(cell.examine!.position)}
                className="absolute inset-0 w-full"
              />
            ) : null}
            {cell.name ? <p className="truncate px-2 py-1 text-center text-xs uppercase tracking-wide text-text-subtle">{cell.name}</p> : null}
            {cell.offers.map((offer) => (
              <button
                key={offer.id}
                data-drive="choose"
                type="button"
                onClick={() => onChoose(offer.position)}
                className="relative z-10 w-full border-t border-border px-2 py-2 text-xs font-medium transition-transform duration-75 first:border-t-0 active:scale-[0.97] active:bg-accent-strong active:text-accent-text"
              >
                {offer.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      {squared.size === 0 ? null : <Compass compass={compass} here={view.location.title} onChoose={onChoose} />}
    </div>
  );
}

export function Home({
  snapshot,
  words,
  commandLine,
  onChoose,
  onSend,
}: {
  snapshot: DriverSnapshot;
  words: Words;
  commandLine: boolean;
  onChoose: (position: number) => void;
  onSend: (line: string) => void;
}): JSX.Element {
  const view = snapshot.view;
  const surface = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(SPLIT_DEFAULT);
  const held = useRef(SPLIT_DEFAULT);
  const entries = snapshot.transcript.entries;
  const drawn = useRef(new Map<number, HTMLElement>());
  const read = useRef(snapshot.transcript);

  useEffect(() => {
    const scroller = column.current;
    const anchor = startedAt(read.current, snapshot.transcript);
    read.current = snapshot.transcript;
    if (!scroller || anchor === null) return;
    const line = drawn.current.get(anchor);
    const top = line === undefined ? scroller.scrollHeight : line.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = restingAt(top, scroller.scrollHeight, scroller.clientHeight);
  });

  return (
    <>
      <div ref={surface} className="flex min-h-0 flex-1 flex-col">
        <div
          ref={column}
          className="unbarred min-h-0 overflow-y-auto px-4 py-3"
          style={{ flexGrow: split, flexBasis: 0 }}
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-1">
            {entries.map((entry) => (
              <Line
                key={entry.id}
                entry={entry}
                measure={(element) => void (element === null ? drawn.current.delete(entry.id) : drawn.current.set(entry.id, element))}
              />
            ))}
          </div>
        </div>

        {drawsNothing(sheetOffers(view)) ? (
          <div className="shrink-0 border-t border-border bg-surface-raised pb-[calc(env(safe-area-inset-bottom))]">
            <Sheet view={view} words={words} onChoose={onChoose} />
          </div>
        ) : (
          <>
            <Splitter
              onGrab={() => void (held.current = split)}
              onDrag={(dy) => setSplit(splitFrom(held.current, dy, surface.current?.clientHeight ?? 0))}
            />
            <div className="unbarred min-h-0 overflow-y-auto border-t border-border bg-surface-raised" style={{ flexGrow: 1 - split, flexBasis: 0 }}>
              <Sheet view={view} words={words} onChoose={onChoose} />
            </div>
          </>
        )}
      </div>

      {commandLine ? <Console onSend={onSend} words={words} /> : null}
    </>
  );
}
