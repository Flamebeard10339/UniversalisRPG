import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { AXIS_SLOP_PX, clampIndex, dragAxis, motionFrom, pagerOffset, releaseVelocity, sampleVelocity, settleStep, type Axis, type Motion } from './gesture';

const SETTLE_MS = 220;
const SETTLE_EASING = `transform ${SETTLE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;

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
// The rest of the gesture is read from the window rather than from this
// element. Pointer capture was the obvious way and is the wrong one: the only
// pane with a scrolling child is the only pane a drag kept dying on, because
// asking a scroller's ancestor to capture a pointer the scroller is also
// interested in is a fight, and the scroller wins. Nothing can take a window
// listener away.
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

  const move = (event: PointerEvent): void => {
    const dragging = drag.current;
    if (!dragging) return;
    const dx = event.clientX - dragging.x;
    dragging.axis = dragging.axis ?? dragAxis(dx, event.clientY - dragging.y);
    if (dragging.axis !== 'x') return;

    dragging.dx = dx;
    dragging.motion = sampleVelocity(dragging.motion, event.clientX, event.timeStamp);
    if (strip.current) strip.current.style.transform = `translate3d(calc(${-index * 100}% + ${pagerOffset(dx, index, panes.length)}px), 0, 0)`;
  };

  // A gesture the browser took away lands nowhere: it goes back where it
  // started. Only a release the player made decides a pane.
  const end = (event: PointerEvent, taken: boolean): void => {
    const dragging = drag.current;
    drag.current = null;
    dragging?.release();
    const node = strip.current;
    if (!dragging || dragging.axis !== 'x' || !node) return;

    dragged.current = Math.abs(dragging.dx) >= AXIS_SLOP_PX;
    const step = taken ? 0 : settleStep(dragging.dx, dragging.width, releaseVelocity(dragging.motion, event.timeStamp));
    const landing = clampIndex(index + step, panes.length);
    node.style.transition = SETTLE_EASING;
    node.style.transform = restingAt(landing);
    if (landing !== index) onIndex(landing);
  };

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(event) => {
        if (!event.isPrimary) return;
        dragged.current = false;
        const up = (native: PointerEvent): void => end(native, false);
        const cancel = (native: PointerEvent): void => end(native, true);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          axis: null,
          dx: 0,
          motion: motionFrom(event.clientX, event.timeStamp),
          width: event.currentTarget.clientWidth,
          release: () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancel);
          },
        };
        if (strip.current) strip.current.style.transition = 'none';
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
