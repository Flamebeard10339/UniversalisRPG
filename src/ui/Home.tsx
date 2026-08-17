import { useEffect, useRef, useState } from 'react';
import type { MessageTone } from '../runtime/command';
import type { PlayView } from '../runtime/session';
import { groupOffers } from './choices';
import type { DriverSnapshot } from './driver';
import { SPLIT_DEFAULT, splitFrom } from './gesture';
import { LiveSheet } from './LiveSheet';
import { Splitter } from './Splitter';
import type { LogEntry, LogKind } from './transcript';
import { useMoment } from './transient';

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

// Whose words a line is, as the shell draws it: the tool's are set in the
// monospace the DSL is written in and dimmed, so a parser diagnostic does not
// read as something the world said. The distinction is the entry's own, carried
// from the arm the command layer split it on.
const WORDS_CLASS: Record<LogEntry['words'], string> = { player: '', tool: 'font-mono text-text-muted' };

// A line mounts once, so the flash marks exactly the text that just arrived.
function Line({ entry }: { entry: LogEntry }): JSX.Element {
  const tone = entry.kind === 'message' ? TONE_CLASS[entry.tone] : '';
  const arrived = useMoment('arrival', true, String(entry.id));
  return (
    <p data-words={entry.words} className={`${arrived} -mx-1 whitespace-pre-wrap break-words rounded px-1 leading-relaxed ${WORDS_CLASS[entry.words]} ${KIND_CLASS[entry.kind]} ${tone}`}>
      {/* How many times in a row, ahead of the words rather than after them, so
          a run that is still growing counts up in one place a reader can find. */}
      {entry.repeats > 1 ? <span className="tabular-nums text-text-subtle">{`(${entry.repeats}) `}</span> : null}
      {entry.text}
    </p>
  );
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
                data-drive="choose"
                type="button"
                onClick={() => onChoose(offer.position)}
                className="grow basis-40 rounded-xl border border-border bg-panel px-3 py-2 text-sm font-medium transition-transform duration-75 active:scale-[0.97] active:bg-accent-strong active:text-accent-text"
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
