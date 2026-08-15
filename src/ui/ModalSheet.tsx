import { useState, type ReactNode } from 'react';
import type { PlayView } from '../runtime/session';
import { useMoment } from './transient';

type Option = PlayView['modals'][number]['options'][number];

// Everything this file draws comes off the option the engine is asking for, so
// a modal it has never heard of is answerable on the same path as one it has.
// What the shell hands over is drawn above the question and never read here,
// which is what keeps that true of a screen with a subject as well as options.
// The arrow is the driver's own glyph, the way a terminal owns its prompt, and
// it answers to the option's own label rather than to a word for submitting.
//
// The card is keyed on the option rather than the sheet, so the question that
// replaces an answered one rises where a shell keying the whole sheet would
// re-mount everything above it too.
//
// Clicking the ground the card sits on answers what the screen published as the
// way out of itself; a screen that published none is handed no dismissal and
// stays where it is (c19). Only the ground itself, never anything drawn on it,
// so reading the subject or pressing the question is not leaving.
export function ModalSheet({ option, onAnswer, onDismiss, children }: { option: Option; onAnswer: (key: string, value: string) => void; onDismiss?: () => void; children?: ReactNode }): JSX.Element {
  const [typed, setTyped] = useState('');
  const darkened = useMoment('darken', true, option.key);
  const risen = useMoment('rise', true, option.key);

  return (
    <div
      role="dialog"
      aria-modal
      data-drive={onDismiss ? 'dismiss' : undefined}
      onClick={onDismiss ? (event) => event.target === event.currentTarget && onDismiss() : undefined}
      className={`${darkened} fixed inset-0 z-50 flex flex-col justify-end gap-3 bg-scrim px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-8`}
    >
      {children}
      <div key={option.key} className={`${risen} mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface-raised p-4`}>
        <p className="mb-3 text-xs uppercase tracking-wide text-text-subtle">{option.label}</p>
        {option.values ? (
          <div className="unbarred flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {option.values.map((choice) => (
              <button
                key={choice.value}
                data-drive="answer"
                type="button"
                onClick={() => onAnswer(option.key, choice.value)}
                className="min-h-[48px] w-full rounded-xl border border-border bg-panel px-4 py-2 text-left transition-transform duration-75 active:scale-[0.99] active:bg-accent-strong active:text-accent-text"
              >
                {choice.shown}
              </button>
            ))}
          </div>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim()) onAnswer(option.key, typed.trim());
            }}
          >
            <input
              data-drive="answer"
              className="min-h-[48px] flex-1 select-text rounded-xl border border-border bg-panel px-3 text-text outline-none focus:border-accent"
              value={typed}
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
            />
            <button data-drive="answer" type="submit" aria-label={option.label} className="min-h-[48px] min-w-[48px] rounded-xl bg-accent text-lg text-accent-text transition-transform duration-75 active:scale-[0.97]">
              ▸
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
