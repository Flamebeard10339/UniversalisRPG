import type { ReactNode } from 'react';
import type { PlayView } from '../runtime/session';
import { Question } from './Question';
import { useMoment } from './transient';

type Option = PlayView['modals'][number]['options'][number];

// A question drawn over everything, with whatever the shell hands over above it.
// That subject is never read here, which is what keeps the sheet as blind to
// which screen it is drawing as the question inside it.
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
        <Question option={option} onAnswer={onAnswer} />
      </div>
    </div>
  );
}
