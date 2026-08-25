import { useState, type ReactNode } from 'react';
import type { PlayView } from '../runtime/session';
import { onlyLeaves } from './asking';
import { Modal, ModalCard } from './Modal';
import type { Localized } from '../runtime/localized';
import type { Declared } from './modalManner';

type Option = PlayView['modals'][number]['options'][number];

export function ModalSheet({
  option,
  manner,
  onAnswer,
  onDismiss,
  leaving,
  spoken = [],
  paced = false,
  children,
}: {
  option: Option;
  manner: Declared;
  onAnswer: (key: string, value: string) => void;
  onDismiss?: () => void;
  leaving?: string;
  spoken?: readonly Localized[];
  paced?: boolean;
  children?: ReactNode;
}): JSX.Element {
  const [typed, setTyped] = useState('');
  const asksNothing = onlyLeaves(option, leaving);

  return (
    <Modal manner={manner} asksNothing={asksNothing} subject={option.key} onDismiss={onDismiss} spoken={spoken} paced={paced} about={children}>
      {asksNothing ? null : (
        <ModalCard key={option.key} subject={option.key} title={option.label}>
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
        </ModalCard>
      )}
    </Modal>
  );
}
