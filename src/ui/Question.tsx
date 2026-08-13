import { useState } from 'react';
import type { PlayView } from '../runtime/session';

type Option = PlayView['modals'][number]['options'][number];

// One question, and nothing about where it is asked. Everything here comes off
// the option the engine is asking for, so a question this layer has never heard
// of is answerable on the same path as one it has. The arrow is the driver's own
// glyph, the way a terminal owns its prompt, and it answers to the option's own
// label rather than to a word for submitting.
export function Question({ option, onAnswer }: { option: Option; onAnswer: (key: string, value: string) => void }): JSX.Element {
  const [typed, setTyped] = useState('');

  return (
    <>
      <p className="mb-3 text-xs uppercase tracking-wide text-text-subtle">{option.label}</p>
      {option.values ? (
        <div className="unbarred flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {option.values.map((value) => (
            <button
              key={value}
              data-drive="answer"
              type="button"
              onClick={() => onAnswer(option.key, value)}
              className="min-h-[48px] w-full rounded-xl border border-border bg-panel px-4 py-2 text-left transition-transform duration-75 active:scale-[0.99] active:bg-accent-strong active:text-accent-text"
            >
              {value}
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
    </>
  );
}
