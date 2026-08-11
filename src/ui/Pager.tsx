import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { dragAxis, landingIndex, motionFrom, pagerOffset, releaseVelocity, sampleVelocity, SETTLE_EASING, wasDragged, type Axis, type Motion } from './gesture';

interface Drag {
  x: number;
  y: number;
  axis: Axis | null;
  dx: number;
  motion: Motion;
  width: number;
  release: () => void;
}

// The strip is as wide as its panes and is moved by whole panes, so a percent
// translate is one pane and the pane width never has to be measured.
const restingAt = (index: number): string => `translate3d(${-index * 100}%, 0, 0)`;

// Panes side by side, moved under the finger and settled on release.
//
// Driven by mouse and touch events rather than by pointer events, which is the
// whole reason this works over the narration column. A pointer stream is
// cancellable, and a browser cancels it the moment it decides a scrollable
// element under the finger is being scrolled — so the two panes with a
// scrolling child were the two a drag kept dying on while the header above
// them dragged perfectly. A mouse stream is never cancelled, and a touch move
// can be refused, which is what stops the scroll instead of losing to it.
//
// The transform is written straight to the node rather than held in state: a
// dragging finger produces a move event a frame, and the narration column has
// no reason to re-render sixty times a second to answer one.
export function Pager({ index, onIndex, panes }: { index: number; onIndex: (index: number) => void; panes: ReactNode[] }): JSX.Element {
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);

  useLayoutEffect(() => {
    const node = strip.current;
    if (node) node.style.transform = restingAt(index);
  }, [index]);

  const begin = (x: number, y: number, at: number, width: number, release: () => void): void => {
    dragged.current = false;
    drag.current = { x, y, axis: null, dx: 0, motion: motionFrom(x, at), width, release };
    if (strip.current) strip.current.style.transition = 'none';
  };

  // True once the drag is this pager's, which is when a touch move has to be
  // refused so the column beneath it does not scroll as well.
  const moveTo = (x: number, y: number, at: number): boolean => {
    const dragging = drag.current;
    if (!dragging) return false;
    const dx = x - dragging.x;
    dragging.axis = dragging.axis ?? dragAxis(dx, y - dragging.y);
    if (dragging.axis !== 'x') return false;

    dragging.dx = dx;
    dragging.motion = sampleVelocity(dragging.motion, x, at);
    if (strip.current) strip.current.style.transform = `translate3d(calc(${-index * 100}% + ${pagerOffset(dx, index, panes.length)}px), 0, 0)`;
    return true;
  };

  const end = (at: number, taken: boolean): void => {
    const dragging = drag.current;
    drag.current = null;
    dragging?.release();
    const node = strip.current;
    if (!dragging || dragging.axis !== 'x' || !node) return;

    dragged.current = wasDragged(dragging.dx);
    const landing = landingIndex({ dx: dragging.dx, width: dragging.width, velocity: releaseVelocity(dragging.motion, at), taken }, index, panes.length);
    node.style.transition = SETTLE_EASING;
    node.style.transform = restingAt(landing);
    if (landing !== index) onIndex(landing);
  };

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden"
      style={{ touchAction: 'pan-y' }}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        const move = (native: MouseEvent): void => void moveTo(native.clientX, native.clientY, native.timeStamp);
        const up = (native: MouseEvent): void => end(native.timeStamp, false);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        begin(event.clientX, event.clientY, event.timeStamp, event.currentTarget.clientWidth, () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        });
      }}
      onTouchStart={(event) => {
        const first = event.touches[0];
        if (!first || event.touches.length > 1) return;
        const move = (native: TouchEvent): void => {
          const touch = native.touches[0];
          if (!touch) return;
          // Refusing the move is what keeps the browser from scrolling the
          // column as well, and what keeps it from taking the gesture.
          if (moveTo(touch.clientX, touch.clientY, native.timeStamp) && native.cancelable) native.preventDefault();
        };
        const up = (native: TouchEvent): void => end(native.timeStamp, false);
        const cancel = (native: TouchEvent): void => end(native.timeStamp, true);
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', up);
        window.addEventListener('touchcancel', cancel);
        begin(first.clientX, first.clientY, event.timeStamp, event.currentTarget.clientWidth, () => {
          window.removeEventListener('touchmove', move);
          window.removeEventListener('touchend', up);
          window.removeEventListener('touchcancel', cancel);
        });
      }}
      // A drag that ended over a choice is not a choice being made.
      onClickCapture={(event) => {
        if (!dragged.current) return;
        dragged.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div ref={strip} className="flex h-full w-full will-change-transform">
        {panes.map((pane, at) => (
          <div key={at} className="flex h-full min-h-0 w-full shrink-0 flex-col">
            {pane}
          </div>
        ))}
      </div>
    </div>
  );
}
