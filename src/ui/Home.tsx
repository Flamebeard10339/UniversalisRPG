import { useEffect, useRef, useState } from 'react';
import type { MessageTone } from '../runtime/command';
import type { PlayView } from '../runtime/session';
import { groupOffers } from './choices';
import type { DriverSnapshot } from './driver';
import { formatClock } from './format';
import { SPLIT_DEFAULT, splitFrom } from './gesture';
import { LiveSheet } from './LiveSheet';
import { Meter } from './Meter';
import { Splitter } from './Splitter';
import type { LogEntry, LogKind } from './transcript';

const TONE_CLASS: Record<MessageTone, string> = {
  plain: 'text-text',
  ok: 'text-success',
  warn: 'text-warning',
  error: 'rounded-md border-l-2 border-danger bg-danger-surface px-2 py-1 text-danger-text',
};

const KIND_CLASS: Record<LogKind, string> = {
  said: 'text-text',
  place: 'pt-2 text-sm font-semibold uppercase tracking-wide text-accent',
  describe: 'italic text-text-muted',
  message: '',
  detail: 'pl-3 text-sm text-text-subtle',
};

// A line mounts once, so the flash marks exactly the text that just arrived.
function Line({ entry }: { entry: LogEntry }): JSX.Element {
  const tone = entry.kind === 'message' ? TONE_CLASS[entry.tone] : '';
  return <p className={`arrived -mx-1 whitespace-pre-wrap break-words rounded px-1 leading-relaxed ${KIND_CLASS[entry.kind]} ${tone}`}>{entry.text}</p>;
}

// Grouped under whatever offers them, so an offer with an owner and one without
// read as the same shape: a row of buttons under a name, or a row on its own.
function Sheet({ choices, onChoose }: { choices: PlayView['choices']; onChoose: (position: number) => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-3 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-1">
      {groupOffers(choices).map((group) => (
        <div key={group.source ?? ''} className="flex flex-col gap-1">
          {group.source ? <p className="px-1 text-xs uppercase tracking-wide text-text-subtle">{group.source}</p> : null}
          <div className="flex flex-wrap gap-2">
            {group.offers.map((offer) => (
              <button
                key={offer.id}
                type="button"
                onClick={() => onChoose(offer.position)}
                className="min-h-[44px] grow basis-40 rounded-xl border border-border bg-panel px-3 py-2 text-sm font-medium transition-transform duration-75 active:scale-[0.97] active:bg-accent-strong active:text-accent-text"
              >
                {offer.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const NEAR_BOTTOM_PX = 32;

export function Home({ snapshot, onChoose, onCancel }: { snapshot: DriverSnapshot; onChoose: (position: number) => void; onCancel: () => void }): JSX.Element {
  const view = snapshot.view;
  const live = snapshot.live;
  const surface = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [split, setSplit] = useState(SPLIT_DEFAULT);
  const held = useRef(SPLIT_DEFAULT);
  const entries = snapshot.transcript.entries;

  // After every render, not only after a new line: the column changes height
  // when the player moves the split, and a scroll position taken before that
  // leaves the newest line under the fold.
  useEffect(() => {
    const scroller = column.current;
    if (scroller && following.current) scroller.scrollTop = scroller.scrollHeight;
  });

  return (
    <>
      {view ? (
        <header className="shrink-0 border-b border-border bg-surface px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="truncate text-base font-semibold">{view.location.title}</h1>
            <span className="shrink-0 text-xs tabular-nums text-text-subtle">{formatClock(view.time)}</span>
          </div>
          {view.entities.length > 0 ? (
            <p className="mt-0.5 truncate text-xs text-text-subtle">{view.entities.map((entity) => entity.title).join(' · ')}</p>
          ) : null}
          <div className="mt-2 flex flex-col gap-1.5">
            {view.resources.map((resource) => (
              <Meter key={resource.id} title={resource.title} current={resource.current} max={resource.max} readout={resource.display === 'full'} />
            ))}
          </div>
        </header>
      ) : null}

      <div ref={surface} className="flex min-h-0 flex-1 flex-col">
        <div
          ref={column}
          className="unbarred min-h-0 overflow-y-auto px-4 py-3"
          style={{ flexGrow: split, flexBasis: 0 }}
          onScroll={(event) => {
            const scroller = event.currentTarget;
            following.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= NEAR_BOTTOM_PX;
          }}
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {entries.map((entry) => (
              <Line key={entry.id} entry={entry} />
            ))}
          </div>
        </div>

        {live || (view && view.choices.length > 0) ? (
          <>
            <Splitter
              onGrab={() => void (held.current = split)}
              onDrag={(dy) => setSplit(splitFrom(held.current, dy, surface.current?.clientHeight ?? 0))}
            />
            {/* The sheet keeps the height the player gave it and scrolls inside
                it, so a room offering five actions and one offering two do not
                move everything else on the way past. */}
            <div className="flex min-h-0 flex-col border-t border-border bg-surface-raised" style={{ flexGrow: 1 - split, flexBasis: 0 }}>
              {/* A run sits above the choices rather than in place of them, and
                  outside the scroller, so the control that stops it is reachable
                  however far down the list the player has gone. */}
              {live ? (
                <div className="shrink-0 border-b border-border">
                  <LiveSheet progress={live} onCancel={onCancel} />
                </div>
              ) : null}
              <div className="unbarred min-h-0 flex-1 overflow-y-auto">
                {view && view.choices.length > 0 ? <Sheet choices={view.choices} onChoose={onChoose} /> : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
