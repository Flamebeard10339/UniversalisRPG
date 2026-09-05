import { useEffect, useState, type ReactNode } from 'react';
import { VOICE_CLASS } from './lineStyle';
import { clickingOffLeaves, layerOf, mannerOf, showsTheBeat, type Declared } from './modalManner';
import type { Localized } from '../runtime/localized';
import { arriving, A_CHARACTER, landed, OPENS, pressed, typedOn } from './reveal';
import { useMoment, useMotionless } from './transient';
import { useTestSurface } from './useTestSurface';
import { CARD } from './sheetLayout';

export function ModalCard({ subject, title, children }: { subject?: string; title?: ReactNode; children: ReactNode }): JSX.Element {
  const risen = useMoment('rise', true, subject);

  return (
    <div className={`${risen} ${CARD}`}>
      {title === undefined ? null : <p className="mb-3 text-xs uppercase tracking-wide text-text-subtle">{title}</p>}
      {children}
    </div>
  );
}

const SAID = `whitespace-pre-wrap break-words text-sm leading-snug ${VOICE_CLASS.said}`;

function Beat({ lines, paced }: { lines: readonly Localized[]; paced: boolean }): JSX.Element | null {
  const [reading, setReading] = useState(OPENS);
  const motionless = useMotionless();
  const beat = arriving(lines, reading, paced);
  const typing = beat.typing;
  const press = (): void => setReading((was) => pressed(lines, was));

  useTestSurface('beat', { arriving: beat, controls: { press } });

  useEffect(() => {
    if (!typing) return;
    if (motionless) return void setReading((was) => landed(lines, was));
    const timer = setTimeout(() => setReading((was) => typedOn(lines, was)), A_CHARACTER);
    return () => clearTimeout(timer);
  }, [typing, motionless, reading.at, reading.typed]);

  if (lines.length === 0) return null;

  return (
    <ModalCard>
      <div className="unbarred flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        {beat.shown.map((line, at) => (
          <p key={at} className={SAID}>
            {line}
          </p>
        ))}
      </div>
      {beat.typing || beat.awaits ? (
        <button
          data-drive="beat.press"
          type="button"
          onClick={press}
          className="mt-1 w-full rounded-xl border border-border text-sm text-text-subtle transition-transform duration-75 active:scale-[0.99] active:text-accent"
        >
          ▾
        </button>
      ) : null}
    </ModalCard>
  );
}

export function Modal({
  manner,
  asksNothing = false,
  subject,
  onDismiss,
  spoken = [],
  paced = false,
  about,
  children,
}: {
  manner: Declared;
  asksNothing?: boolean;
  subject?: string;
  onDismiss?: () => void;
  spoken?: readonly Localized[];
  paced?: boolean;
  about?: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  const held = mannerOf(manner, asksNothing);
  const darkened = useMoment('darken', held.behind === 'dim', subject);
  const leaves = clickingOffLeaves(held, onDismiss !== undefined);

  return (
    <div
      role="dialog"
      aria-modal
      data-drive={leaves ? 'dismiss' : undefined}
      onClick={leaves ? (event) => event.target === event.currentTarget && onDismiss!() : undefined}
      className={`${darkened} ${layerOf(held)}`}
    >
      {about}
      {showsTheBeat(held) ? <Beat key={spoken.join('\n')} lines={spoken} paced={paced} /> : null}
      {children}
    </div>
  );
}
