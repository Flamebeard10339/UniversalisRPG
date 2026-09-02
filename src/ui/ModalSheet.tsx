import { useRef, useState, type ReactNode } from 'react';
import type { PlayView } from '../runtime/session';
import { partsOf, partStanding, type ChoiceCell, type ModalChoice } from '../runtime/modalOption';
import { onlyLeaves } from './asking';
import { Modal, ModalCard } from './Modal';
import type { Localized } from '../runtime/localized';
import type { Declared } from './modalManner';
import { tidy } from './format';
import { gripFor, type Gripped } from './DragSheet';
import { LIFT_MS } from './gesture';
import { SLOTS, NAME } from './sheetLayout';

type Option = PlayView['modals'][number]['options'][number];

const ROW = 'min-h-[48px] w-full rounded-xl border border-border bg-panel px-4 py-2 text-left transition-transform duration-75 active:scale-[0.99] active:bg-accent-strong active:text-accent-text';

function Cell({ cell, subject, onPick, onHold }: { cell: ChoiceCell; subject: string; onPick: () => void; onHold?: () => void }): JSX.Element {
  const holding = useRef<Gripped | null>(null);
  const asked = useRef(false);
  const grip = gripFor(
    subject,
    holding,
    1,
    {
      hold: () => {
        if (asked.current) return;
        asked.current = true;
        onHold?.();
      },
      rest: () => {
        const already = asked.current;
        asked.current = false;
        if (!already) onPick();
      },
    },
    LIFT_MS,
  );

  return (
    <button
      data-drive="answer"
      type="button"
      {...(onHold ? grip : { onClick: onPick })}
      style={{ touchAction: 'pan-y' }}
      aria-label={cell.title}
      className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-raised px-2 py-2 text-center transition-transform duration-75 active:scale-[0.98] active:border-accent"
    >
      <span className="absolute left-2 top-2 text-xs tabular-nums text-text-subtle">{tidy(cell.price)}</span>
      <span className={`w-full text-xs font-semibold ${NAME}`}>{cell.title}</span>
      <span className="absolute bottom-2 right-2 text-xs tabular-nums text-text-muted">{tidy(cell.count)}</span>
    </button>
  );
}

function Counter({ option, onAnswer }: { option: Option; onAnswer: (key: string, value: string) => void }): JSX.Element {
  const { parts, loose } = partsOf(option);
  const [picked, setPicked] = useState<string | null>(null);
  const standing = partStanding(parts, picked, option.standing);
  const shown = parts.find((part) => part.under === standing);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {parts.map((part) => (
          <button
            key={part.under}
            data-drive="send"
            type="button"
            onClick={() => setPicked(part.under)}
            className={`min-h-[44px] flex-1 rounded-xl border px-3 py-1 text-sm ${part.under === standing ? 'border-accent bg-accent text-accent-text' : 'border-border bg-panel'}`}
          >
            {part.heading}
          </button>
        ))}
      </div>
      <div className={`unbarred max-h-[50vh] overflow-y-auto ${SLOTS}`}>
        {(shown?.choices ?? []).map(({ choice }) => (
          <Cell
            key={choice.value}
            cell={choice.cell!}
            subject={choice.value}
            onPick={() => onAnswer(option.key, choice.value)}
            onHold={choice.held === undefined ? undefined : () => onAnswer(option.key, choice.held!)}
          />
        ))}
      </div>
      {loose.map(({ choice }) => (
        <button key={choice.value} data-drive="answer" type="button" onClick={() => onAnswer(option.key, choice.value)} className={ROW}>
          {choice.shown}
        </button>
      ))}
    </div>
  );
}

function Listed({ values, option, onAnswer }: { values: readonly ModalChoice[]; option: Option; onAnswer: (key: string, value: string) => void }): JSX.Element {
  return (
    <div className="unbarred flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
      {values.map((choice) => (
        <button key={choice.value} data-drive="answer" type="button" onClick={() => onAnswer(option.key, choice.value)} className={ROW}>
          {choice.shown}
        </button>
      ))}
    </div>
  );
}

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
            option.values.some((choice) => choice.cell) ? (
              <Counter option={option} onAnswer={onAnswer} />
            ) : (
              <Listed values={option.values} option={option} onAnswer={onAnswer} />
            )
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
