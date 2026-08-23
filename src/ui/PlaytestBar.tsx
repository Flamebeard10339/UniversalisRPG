import { useState } from 'react';
import type { Localizer } from '../runtime/localized';
import { NOTE_FIELDS, type RunLogEntry, type RunNotes } from '../runtime/runLog';
import { edited, feedbackOn, turnsPlayed } from './playtest';
import type { Words } from './words';

const CONTROL = 'shrink-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text transition-transform duration-75 active:scale-[0.97] disabled:opacity-40';

function Sheet({ turn, line, held, words, localizer, onKeep, onDiscard }: { turn: number; line: string; held: RunNotes; words: Words; localizer: Localizer; onKeep: (notes: RunNotes) => void; onDiscard: () => void }): JSX.Element {
  const [notes, setNotes] = useState(held);

  return (
    <div role="dialog" aria-modal className="fixed inset-0 z-50 flex flex-col justify-end gap-3 bg-scrim px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-8">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface-raised p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-text-subtle">
          {words('playtest-turn', { turn })} — {words('playtest-about', { line: localizer.identifier(line) })}
        </p>
        <div className="unbarred flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {NOTE_FIELDS.map((field) => (
            <label key={field.name} className="flex flex-col gap-1 text-sm text-text">
              <span className="text-xs text-text-subtle">{localizer.engine(field.asks)}</span>
              <textarea
                data-drive="none: the sheet's fields are answered together, which playtest.attach does in one act"
                rows={2}
                value={notes[field.name]}
                onChange={(event) => setNotes(edited(notes, field.name, event.target.value))}
                className="select-text rounded-xl border border-border bg-panel px-3 py-2 text-text outline-none focus:border-accent"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button data-drive="playtest.attach" type="button" onClick={() => onKeep(notes)} className="min-h-[44px] flex-1 rounded-xl bg-accent px-3 text-sm text-accent-text transition-transform duration-75 active:scale-[0.97]">
            {words('playtest-keep')}
          </button>
          <button data-drive="none: closing the sheet without answering leaves the run exactly as the harness already found it" type="button" onClick={onDiscard} className="min-h-[44px] rounded-xl border border-border bg-panel px-3 text-sm text-text transition-transform duration-75 active:scale-[0.97]">
            {words('playtest-discard')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Drawn only while a run is being recorded, which is the whole of what playtest mode is — there
// is nothing to show a player who is not keeping one.
export function PlaytestBar({ log, words, localizer, onAttach, onCopy, onStop }: { log: readonly RunLogEntry[]; words: Words; localizer: Localizer; onAttach: (turn: number, notes: RunNotes) => void; onCopy: () => void; onStop: () => void }): JSX.Element {
  const [asking, setAsking] = useState(false);
  const about = feedbackOn(log);

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-panel px-3 py-1">
      <span className="mr-auto truncate text-xs text-text-subtle">{about === null ? words('playtest-nothing') : words('playtest-turn', { turn: turnsPlayed(log) })}</span>
      <button data-drive="none: opens the sheet, which playtest.attach answers without one being open" type="button" disabled={about === null} onClick={() => setAsking(true)} className={CONTROL}>
        {words('playtest-attach')}
      </button>
      <button data-drive="none: the clipboard is the browser's; an agent reads the same words off the surface's own written state" type="button" onClick={onCopy} className={CONTROL}>
        {words('playtest-copy')}
      </button>
      <button data-drive="none: recording is one fact, turned off through playtest.recording" type="button" onClick={onStop} className={CONTROL}>
        {words('playtest-stop')}
      </button>
      {asking && about ? (
        <Sheet
          turn={about.turn}
          line={about.line}
          held={about.held}
          words={words}
          localizer={localizer}
          onKeep={(notes) => {
            onAttach(about.turn, notes);
            setAsking(false);
          }}
          onDiscard={() => setAsking(false)}
        />
      ) : null}
    </div>
  );
}
