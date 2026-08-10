import { useState } from 'react';
import type { PlayView } from '../runtime/session';

type Option = PlayView['modals'][number]['options'][number];

// Everything drawn here comes off the option the engine is asking for, so a
// modal this file has never heard of is answerable on the same path as one it
// has. The arrow is the driver's own glyph, the way a terminal owns its prompt.
export function ModalSheet({ option, onAnswer }: { option: Option; onAnswer: (key: string, value: string) => void }): JSX.Element {
  const [typed, setTyped] = useState('');

  return (
    <div role="dialog" aria-modal className="darkened fixed inset-0 z-50 flex flex-col justify-end bg-scrim px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-8">
      <div className="risen mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface-raised p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-text-subtle">{option.label}</p>
        {option.values ? (
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {option.values.map((value) => (
              <button
                key={value}
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
              className="min-h-[48px] flex-1 select-text rounded-xl border border-border bg-panel px-3 text-text outline-none focus:border-accent"
              value={typed}
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
            />
            <button type="submit" className="min-h-[48px] min-w-[48px] rounded-xl bg-accent text-lg text-accent-text transition-transform duration-75 active:scale-[0.97]">
              ▸
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
