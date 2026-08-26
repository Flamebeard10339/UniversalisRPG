import { useEffect, useState, type ReactNode } from 'react';
import { VOICE_CLASS } from './lineStyle';
import { clickingOffLeaves, layerOf, mannerOf, showsTheBeat, type Declared } from './modalManner';
import type { Localized } from '../runtime/localized';
import { arriving, A_CHARACTER, landed, OPENS, pressed, typedOn } from './reveal';
import { useMoment, useMotionless } from './transient';
import { useTestSurface } from './useTestSurface';

const CARD = 'mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface-raised p-4';

// The raised panel a screen puts its words and its controls on. Every screen that is not the whole
// surface is one or more of these, so the corners, the border and the width a column of text stops
// at are settled once.
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

// The words the screen is answering, which the scrim behind it has taken away. Drawn in the voice
// they were said in, so a line reads the same whether it is in the history or in front of it. This
// is the one place the words are paced: the history behind the scrim is a record and comes to rest
// at the line the turn began on, which is a line nobody has read yet if it is still arriving.
//
// The reading is state and not a delay handed to the stylesheet, because a reader who asked for less
// motion is handed no animation at all and would have been handed the whole beat at once.
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
          data-awaits={beat.awaits ? 'yes' : undefined}
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

// The one layer every screen in the app is drawn on. What it does with the surface it is over is the
// manner the screen declared and nothing this decides; what a tap beside it does is whether the
// screen published a way out, and nothing else may answer that.
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
      {/* Keyed on the words, because a beat is read once: the same slot holding something else is a
          new beat and one that never remounts would open where the last one was left. */}
      {showsTheBeat(held) ? <Beat key={spoken.join('\n')} lines={spoken} paced={paced} /> : null}
      {children}
    </div>
  );
}
