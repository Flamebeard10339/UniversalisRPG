import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { dragAxis, heldStill, landingIndex, motionFrom, pagerOffset, pagesIn, releaseVelocity, sampleVelocity, wasDragged, type Axis, type Motion } from './gesture';
import { useMomentPlayer } from './transient';

interface Drag {
  x: number;
  y: number;
  axis: Axis | null;
  dx: number;
  motion: Motion;
  width: number;
  release: () => void;
}

const restingAt = (index: number, columns: number): string => `translate(${(-index * 100) / columns}%, 0)`;

export function Pager({ index, onIndex, panes, columns = 1 }: { index: number; onIndex: (index: number) => void; panes: ReactNode[]; columns?: number }): JSX.Element {
  const pages = pagesIn(panes.length, columns);
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const settle = useMomentPlayer('settle');

  useLayoutEffect(() => {
    const node = strip.current;
    if (node) node.style.transform = restingAt(index, columns);
  }, [index, columns]);

  const begin = (x: number, y: number, at: number, width: number, release: () => void): void => {
    dragged.current = false;
    drag.current = { x, y, axis: null, dx: 0, motion: motionFrom(x, at), width, release };
    if (strip.current) strip.current.style.transition = 'none';
  };

  const moveTo = (x: number, y: number, at: number): boolean => {
    const dragging = drag.current;
    if (!dragging) return false;
    const dx = x - dragging.x;
    dragging.axis = dragging.axis ?? dragAxis(dx, y - dragging.y);
    if (dragging.axis !== 'x') return false;

    dragging.dx = dx;
    dragging.motion = sampleVelocity(dragging.motion, x, at);
    if (strip.current) strip.current.style.transform = `translate(calc(${(-index * 100) / columns}% + ${pagerOffset(dx, index, pages)}px), 0)`;
    return true;
  };

  const end = (at: number, taken: boolean): void => {
    const dragging = drag.current;
    drag.current = null;
    dragging?.release();
    const node = strip.current;
    if (!dragging || dragging.axis !== 'x' || !node) return;

    dragged.current = wasDragged(dragging.dx);
    const landing = landingIndex({ dx: dragging.dx, width: dragging.width, velocity: releaseVelocity(dragging.motion, at), taken }, index, pages);
    node.style.transition = settle();
    node.style.transform = restingAt(landing, columns);
    if (landing !== index) onIndex(landing);
  };

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden"
      style={{ touchAction: 'pan-y' }}
      onMouseDown={(event) => {
        if (event.button !== 0 || heldStill(event.target)) return;
        const move = (native: MouseEvent): void => void moveTo(native.clientX, native.clientY, native.timeStamp);
        const up = (native: MouseEvent): void => end(native.timeStamp, false);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        begin(event.clientX, event.clientY, event.timeStamp, event.currentTarget.clientWidth / columns, () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        });
      }}
      onTouchStart={(event) => {
        const first = event.touches[0];
        if (!first || event.touches.length > 1 || heldStill(event.target)) return;
        const move = (native: TouchEvent): void => {
          const touch = native.touches[0];
          if (!touch) return;
          if (moveTo(touch.clientX, touch.clientY, native.timeStamp) && native.cancelable) native.preventDefault();
        };
        const up = (native: TouchEvent): void => end(native.timeStamp, false);
        const cancel = (native: TouchEvent): void => end(native.timeStamp, true);
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', up);
        window.addEventListener('touchcancel', cancel);
        begin(first.clientX, first.clientY, event.timeStamp, event.currentTarget.clientWidth / columns, () => {
          window.removeEventListener('touchmove', move);
          window.removeEventListener('touchend', up);
          window.removeEventListener('touchcancel', cancel);
        });
      }}
      onClickCapture={(event) => {
        if (!dragged.current) return;
        dragged.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div ref={strip} className="flex h-full w-full">
        {panes.map((pane, at) => (
          <div key={at} className="flex h-full min-h-0 shrink-0 flex-col" style={{ width: `${100 / columns}%` }}>
            {pane}
          </div>
        ))}
      </div>
    </div>
  );
}
