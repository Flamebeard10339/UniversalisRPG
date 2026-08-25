import type { ReactNode } from 'react';
import { VOICE_CLASS } from './lineStyle';
import { clickingOffLeaves, layerOf, mannerOf, showsTheBeat, type Declared } from './modalManner';
import type { Localized } from '../runtime/localized';
import { useMoment } from './transient';

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

// The words the screen is answering, which the scrim behind it has taken away. Drawn in the voice
// they were said in, so a line reads the same whether it is in the history or in front of it.
function Beat({ lines }: { lines: readonly Localized[] }): JSX.Element | null {
  if (lines.length === 0) return null;

  return (
    <ModalCard>
      <div className="unbarred flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        {lines.map((line, at) => (
          <p key={at} className={`whitespace-pre-wrap break-words text-sm leading-snug ${VOICE_CLASS.said}`}>
            {line}
          </p>
        ))}
      </div>
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
  about,
  children,
}: {
  manner: Declared;
  asksNothing?: boolean;
  subject?: string;
  onDismiss?: () => void;
  spoken?: readonly Localized[];
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
      {showsTheBeat(held) ? <Beat lines={spoken} /> : null}
      {children}
    </div>
  );
}
