import { useState, type ReactNode } from 'react';
import type { Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import { onlyLeaves } from './asking';
import { VOICE_CLASS } from './lineStyle';
import { useMoment } from './transient';

type Option = PlayView['modals'][number]['options'][number];

// The words the sheet is answering, which the scrim behind it has taken away. They are drawn in the
// voice they were said in, so a line reads the same whether it is in the history or in front of it.
function Spoken({ lines }: { lines: readonly Localized[] }): JSX.Element | null {
  if (lines.length === 0) return null;
  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface-raised p-4">
      <div className="unbarred flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        {lines.map((line, at) => (
          <p key={at} className={`whitespace-pre-wrap break-words text-sm leading-snug ${VOICE_CLASS.said}`}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ModalSheet({
  option,
  onAnswer,
  onDismiss,
  leaving,
  spoken = [],
  children,
}: {
  option: Option;
  onAnswer: (key: string, value: string) => void;
  onDismiss?: () => void;
  leaving?: string;
  spoken?: readonly Localized[];
  children?: ReactNode;
}): JSX.Element {
  const [typed, setTyped] = useState('');
  const darkened = useMoment('darken', true, option.key);
  const risen = useMoment('rise', true, option.key);
  const asks = !onlyLeaves(option, leaving);

  return (
    <div role="dialog" aria-modal data-drive={onDismiss ? 'dismiss' : undefined} onClick={onDismiss ? (event) => event.target === event.currentTarget && onDismiss() : undefined} className={`${darkened} fixed inset-0 z-50 flex flex-col ${asks ? 'justify-end' : 'justify-center'} gap-3 bg-scrim px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-8`}>
      {children}
      <Spoken lines={spoken} />
      {asks ? (
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
              <input data-drive="answer" className="min-h-[48px] flex-1 select-text rounded-xl border border-border bg-panel px-3 text-text outline-none focus:border-accent" value={typed} autoFocus onChange={(event) => setTyped(event.target.value)} />
              <button data-drive="answer" type="submit" aria-label={option.label} className="min-h-[48px] min-w-[48px] rounded-xl bg-accent text-lg text-accent-text transition-transform duration-75 active:scale-[0.97]">
                ▸
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
