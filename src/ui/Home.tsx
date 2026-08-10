import { useEffect, useRef } from 'react';
import type { MessageTone } from '../runtime/command';
import type { PlayView } from '../runtime/session';
import type { DriverSnapshot } from './driver';
import { fillPercent, formatClock, tidy } from './format';
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

function Line({ entry }: { entry: LogEntry }): JSX.Element {
  const tone = entry.kind === 'message' ? TONE_CLASS[entry.tone] : '';
  return <p className={`whitespace-pre-wrap break-words leading-relaxed ${KIND_CLASS[entry.kind]} ${tone}`}>{entry.text}</p>;
}

function Meter({ resource }: { resource: PlayView['resources'][number] }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-xs text-text-subtle">{resource.title}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel">
        <div className="h-full bg-accent" style={{ width: `${fillPercent(resource.current, resource.max)}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-text-subtle">
        {resource.display === 'full' ? `${tidy(resource.current)}/${tidy(resource.max)}` : ''}
      </span>
    </div>
  );
}

function Sheet({ choices, onChoose }: { choices: PlayView['choices']; onChoose: (position: number) => void }): JSX.Element {
  return (
    <section className="max-h-[45vh] shrink-0 overflow-y-auto border-t border-border bg-surface-raised px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="flex flex-col gap-2">
        {choices.map((choice, index) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => onChoose(index + 1)}
            className="flex min-h-[48px] w-full flex-col justify-center rounded-xl border border-border bg-panel px-4 py-2 text-left active:bg-accent-strong active:text-accent-text"
          >
            {choice.detail ? <span className="text-xs text-text-subtle">{choice.detail}</span> : null}
            <span className="font-medium">{choice.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const NEAR_BOTTOM_PX = 32;

export function Home({ snapshot, onChoose }: { snapshot: DriverSnapshot; onChoose: (position: number) => void }): JSX.Element {
  const view = snapshot.view;
  const column = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const entries = snapshot.transcript.entries;

  // After every render, not only after a new line: the action sheet coming back
  // when a modal closes shortens this column, and a scroll position taken
  // before that leaves the newest line under the fold.
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
              <Meter key={resource.id} resource={resource} />
            ))}
          </div>
        </header>
      ) : null}

      <div
        ref={column}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
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

      {view && view.choices.length > 0 ? <Sheet choices={view.choices} onChoose={onChoose} /> : null}
    </>
  );
}
