import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { landingIndex, motionFrom, pagerOffset, releaseVelocity, sampleVelocity, wasDragged, type Motion } from './gesture';
import { RELAX_MS, useMomentPlayer } from './transient';
import { across, bodyHeights, LAYERS, layerOffsets, layerSpan, type Bands } from './nav';

interface Drag {
  y: number;
  dy: number;
  motion: Motion;
  release: () => void;
}

export function VStack({
  layer,
  onLayer,
  banners,
  beside,
  bodies,
}: {
  layer: number;
  onLayer: (layer: number) => void;
  banners: ReactNode[];
  beside?: ReactNode[];
  bodies: ReactNode[];
}): JSX.Element {
  const frame = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const strips = useRef<Array<HTMLElement | null>>([]);
  const shown = useRef<Array<HTMLElement | null>>([]);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const [bands, setBands] = useState<Bands>({ height: 0, banners: banners.map(() => 0) });
  const settle = useMomentPlayer('settle');

  const offsets = layerOffsets(bands);
  const heights = bodyHeights(bands);
  const restingAt = (at: number): string => `translate(0, ${-offsets[at]}px)`;
  const standing = useRef(layer);
  standing.current = layer;
  const natural = useRef<number[]>([]);
  const relaxing = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;

    const settleAt = (next: Bands): void => {
      const held = column.current;
      if (held) held.style.transform = `translate(0, ${-layerOffsets(next)[standing.current]}px)`;
    };

    const relax = (): void => {
      relaxing.current = null;
      setBands((held) => {
        const next = { height: held.height, banners: [...natural.current] };
        if (next.banners.every((value, at) => value === held.banners[at])) return held;
        settleAt(next);
        return next;
      });
    };

    const read = (): void => {
      natural.current = shown.current.map((band) => band?.offsetHeight ?? 0);
      setBands((held) => {
        const next = { height: node.clientHeight, banners: natural.current.map((now, at) => Math.max(now, held.banners[at] ?? 0)) };
        if (next.height === held.height && next.banners.every((value, at) => value === held.banners[at])) return held;
        settleAt(next);
        return next;
      });
      if (relaxing.current !== null) clearTimeout(relaxing.current);
      relaxing.current = setTimeout(relax, RELAX_MS);
    };

    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    for (const band of shown.current) if (band) observer.observe(band);
    return () => {
      observer.disconnect();
      if (relaxing.current !== null) clearTimeout(relaxing.current);
    };
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
    if (column.current) column.current.style.transform = `translate(0, ${-offsets[layer] + pagerOffset(dragging.dy, layer, LAYERS.length)}px)`;
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
      <div ref={column} className="flex w-full flex-col">
        {bodies.flatMap((body, at) => [
          <div key={`body-${LAYERS[at].id}`} className="flex w-full shrink-0 flex-col overflow-hidden" style={bands.height > 0 ? { height: heights[at] } : undefined}>
            {body}
          </div>,
          ...(at < banners.length
            ? [
                <div
                  key={`banner-${at}`}
                  ref={(node) => void (strips.current[at] = node)}
                  className="relative flex w-full shrink-0 items-stretch"
                  style={bands.banners[at] ? { height: bands.banners[at] } : undefined}
                >
                <button
                  data-drive="shell.layer"
                  data-boundary={at}
                  type="button"
                  className="block min-w-0 flex-1 touch-none text-left"
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
                  <div ref={(node) => void (shown.current[at] = node)}>{banners[at]}</div>
                </button>
                {beside?.[at] ?? null}
                </div>,
              ]
            : []),
        ])}
      </div>
    </div>
  );
}
