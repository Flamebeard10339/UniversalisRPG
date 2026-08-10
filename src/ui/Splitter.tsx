import { useRef } from 'react';

// Reports how far it has been dragged from where it was taken hold of. What
// that means for the surface is the caller's, which is what keeps this from
// needing to know what is above or below it.
//
// Mouse and touch rather than pointer events, for the reason Pager.tsx carries:
// the column above this handle scrolls, and a scroller takes a pointer stream
// away.
export function Splitter({ onGrab, onDrag }: { onGrab: () => void; onDrag: (dy: number) => void }): JSX.Element {
  const from = useRef<number | null>(null);
  const release = useRef<() => void>(() => undefined);

  const begin = (y: number, attach: () => () => void): void => {
    from.current = y;
    release.current = attach();
    onGrab();
  };

  const moveTo = (y: number): void => {
    if (from.current !== null) onDrag(y - from.current);
  };

  const end = (): void => {
    from.current = null;
    release.current();
  };

  return (
    <div
      className="group flex min-h-[44px] shrink-0 cursor-row-resize touch-none items-center justify-center"
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        const move = (native: MouseEvent): void => moveTo(native.clientY);
        begin(event.clientY, () => {
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', end);
          return () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', end);
          };
        });
      }}
      onTouchStart={(event) => {
        const first = event.touches[0];
        if (!first || event.touches.length > 1) return;
        const move = (native: TouchEvent): void => {
          const touch = native.touches[0];
          if (!touch) return;
          moveTo(touch.clientY);
          if (native.cancelable) native.preventDefault();
        };
        begin(first.clientY, () => {
          window.addEventListener('touchmove', move, { passive: false });
          window.addEventListener('touchend', end);
          window.addEventListener('touchcancel', end);
          return () => {
            window.removeEventListener('touchmove', move);
            window.removeEventListener('touchend', end);
            window.removeEventListener('touchcancel', end);
          };
        });
      }}
    >
      <div className="h-1 w-12 rounded-full bg-border transition-colors group-active:bg-accent" />
    </div>
  );
}
