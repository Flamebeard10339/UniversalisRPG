import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { landingIndex, motionFrom, pagerOffset, releaseVelocity, sampleVelocity, wasDragged, type Motion } from './gesture';
import { useMomentPlayer } from './transient';
import { across, bodyHeights, LAYERS, layerOffsets, layerSpan, type Bands } from './nav';

interface Drag {
  y: number;
  dy: number;
  motion: Motion;
  release: () => void;
}

// The layers as one tall column, moved behind a window one layer high.
//
// The banners are inside the column rather than pinned around it, which is what
// makes each of them one strip and not two: crossing a boundary slides the
// banner from the bottom of the window to the top of it, and the same node ends
// the layer above and begins the layer below.
//
// Only the banners take a drag. A vertical drag anywhere else belongs to
// whatever is scrolling under the finger, and the narration column is the thing
// this surface exists to let the player read.
export function VStack({ layer, onLayer, banners, bodies }: { layer: number; onLayer: (layer: number) => void; banners: ReactNode[]; bodies: ReactNode[] }): JSX.Element {
  const frame = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const strips = useRef<Array<HTMLElement | null>>([]);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const [bands, setBands] = useState<Bands>({ height: 0, banners: banners.map(() => 0) });
  const settle = useMomentPlayer('settle');

  const offsets = layerOffsets(bands);
  const heights = bodyHeights(bands);
  const restingAt = (at: number): string => `translate3d(0, ${-offsets[at]}px, 0)`;

  // The column is sized from what the banners actually measured, so a banner
  // that grows a line of entities moves the layers rather than being clipped.
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const read = (): void =>
      setBands((held) => {
        const next = { height: node.clientHeight, banners: strips.current.map((strip) => strip?.offsetHeight ?? 0) };
        const same = next.height === held.height && next.banners.every((value, at) => value === held.banners[at]);
        return same ? held : next;
      });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    for (const strip of strips.current) if (strip) observer.observe(strip);
    return () => observer.disconnect();
  }, [banners.length]);

  useLayoutEffect(() => {
    const node = column.current;
    if (node) node.style.transform = restingAt(layer);
  });

  const begin = (y: number, at: number, release: () => void): void => {
    dragged.current = false;
    drag.current = { y, dy: 0, motion: motionFrom(y, at), release };
    if (column.current) column.current.style.transition = 'none';
  };

  const moveTo = (y: number, at: number): void => {
    const dragging = drag.current;
    if (!dragging) return;
    dragging.dy = y - dragging.y;
    dragging.motion = sampleVelocity(dragging.motion, y, at);
    if (dragging.dy !== 0) dragged.current = dragged.current || wasDragged(dragging.dy);
    if (column.current) column.current.style.transform = `translate3d(0, ${-offsets[layer] + pagerOffset(dragging.dy, layer, LAYERS.length)}px, 0)`;
  };

  const end = (at: number, taken: boolean): void => {
    const dragging = drag.current;
    drag.current = null;
    dragging?.release();
    const node = column.current;
    if (!dragging || !node) return;

    const landing = landingIndex({ dx: dragging.dy, width: layerSpan(offsets, layer, dragging.dy), velocity: releaseVelocity(dragging.motion, at), taken }, layer, LAYERS.length);
    node.style.transition = settle();
    node.style.transform = restingAt(landing);
    if (landing !== layer) onLayer(landing);
  };

  return (
    <div ref={frame} className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={column} className="flex w-full flex-col will-change-transform">
        {bodies.flatMap((body, at) => [
          <div key={`body-${LAYERS[at].id}`} className="flex w-full shrink-0 flex-col overflow-hidden" style={bands.height > 0 ? { height: heights[at] } : undefined}>
            {body}
          </div>,
          ...(at < banners.length
            ? [
                // A button, so the boundary is crossed by a tap with no gesture
                // in it; the drag is the same control answering a longer press.
                // Its accessible name is whatever the engine published inside
                // it, which is the only thing a banner is allowed to say.
                <button
                  key={`banner-${at}`}
                  data-drive="shell.layer"
                  data-boundary={at}
                  ref={(node) => void (strips.current[at] = node)}
                  type="button"
                  className="block w-full shrink-0 touch-none text-left"
                  onClick={() => {
                    if (dragged.current) {
                      dragged.current = false;
                      return;
                    }
                    onLayer(across(layer, at));
                  }}
                  onMouseDown={(event) => {
                    if (event.button !== 0) return;
                    const move = (native: MouseEvent): void => moveTo(native.clientY, native.timeStamp);
                    const up = (native: MouseEvent): void => end(native.timeStamp, false);
                    window.addEventListener('mousemove', move);
                    window.addEventListener('mouseup', up);
                    begin(event.clientY, event.timeStamp, () => {
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
                      moveTo(touch.clientY, native.timeStamp);
                      if (native.cancelable) native.preventDefault();
                    };
                    const up = (native: TouchEvent): void => end(native.timeStamp, false);
                    const cancel = (native: TouchEvent): void => end(native.timeStamp, true);
                    window.addEventListener('touchmove', move, { passive: false });
                    window.addEventListener('touchend', up);
                    window.addEventListener('touchcancel', cancel);
                    begin(first.clientY, event.timeStamp, () => {
                      window.removeEventListener('touchmove', move);
                      window.removeEventListener('touchend', up);
                      window.removeEventListener('touchcancel', cancel);
                    });
                  }}
                >
                  {banners[at]}
                </button>,
              ]
            : []),
        ])}
      </div>
    </div>
  );
}
