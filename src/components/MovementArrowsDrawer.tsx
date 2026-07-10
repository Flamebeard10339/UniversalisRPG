import { useEffect, useRef, useState } from 'react';
import { MovementArrows } from './MovementArrows';
import type { ActionResolutionContext, ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';

type MovementArrowsDrawerProps = {
  bundle: ContentBundle;
  context: ActionResolutionContext;
  onMove: (locationId: string) => void;
  playState: UniversePlayState;
  t: Translator;
};

// Below this much pointer movement, a press-and-release on the handle is
// treated as a tap (toggle open/closed) rather than a drag.
const TAP_THRESHOLD_PX = 6;

// Reasonable estimate of the arrow grid's natural width (3 columns of 48px
// buttons + gaps + padding) — used until the ResizeObserver below reports a
// real measurement, so opening the drawer works immediately rather than
// requiring a successful measurement pass first.
const FALLBACK_PANEL_WIDTH_PX = 200;

// A persistent floating drawer (handle always visible, arrow pad tucked away
// by default) rather than inline page content — so movement is reachable
// from the Home tab without scrolling past it, matching the chat panel's own
// floating/fixed treatment. Width-based (not transform-based) so the handle
// never has to move: only the space given to the arrow pad animates between
// 0 and its natural width, with overflow clipping it while collapsed.
export const MovementArrowsDrawer = ({ bundle, context, onMove, playState, t }: MovementArrowsDrawerProps) => {
  const [open, setOpen] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [panelWidth, setPanelWidth] = useState(FALLBACK_PANEL_WIDTH_PX);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = panelRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setPanelWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onHandlePointerDown = (event: React.PointerEvent) => {
    const startX = event.clientX;
    const baseWidth = dragWidth ?? (open ? panelWidth : 0);
    let maxDelta = 0;

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = startX - moveEvent.clientX;
      maxDelta = Math.max(maxDelta, Math.abs(deltaX));
      setDragWidth(Math.min(panelWidth, Math.max(0, baseWidth + deltaX)));
    };
    const handleUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setDragWidth(null);
      if (maxDelta < TAP_THRESHOLD_PX) {
        setOpen((current) => !current);
        return;
      }
      const deltaX = startX - upEvent.clientX;
      const finalWidth = Math.min(panelWidth, Math.max(0, baseWidth + deltaX));
      setOpen(finalWidth > panelWidth / 2);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const width = dragWidth ?? (open ? panelWidth : 0);
  // visibility (not just the width/overflow clip below) is what actually
  // pulls the collapsed arrow buttons out of tab order and the accessibility
  // tree — a 0-width overflow:hidden box on its own still leaves its
  // descendants focusable/announced, which would let keyboard/screen-reader
  // users tab into invisible controls.
  const revealed = width > 0;

  return (
    <div className="fixed inset-x-0 z-10" style={{ bottom: 'calc(73px + 0.75rem)' }}>
      <div className="mx-auto flex max-w-7xl justify-end px-4">
        <div className="flex items-stretch">
          <div
            className="overflow-hidden"
            style={{ transition: dragWidth === null ? 'width 200ms ease-out' : 'none', visibility: revealed ? 'visible' : 'hidden', width }}
          >
            <div className="w-max" ref={panelRef}>
              <MovementArrows bundle={bundle} context={context} onMove={onMove} playState={playState} t={t} />
            </div>
          </div>
          <button
            aria-expanded={open}
            aria-label={open ? t('movementArrows.collapse', 'Hide movement') : t('movementArrows.expand', 'Show movement')}
            className="flex w-7 shrink-0 touch-none select-none items-center justify-center self-stretch rounded-r border border-l-0 border-slate-700 bg-slate-900 text-slate-400"
            data-testid="movement-drawer-handle"
            onPointerDown={onHandlePointerDown}
            type="button"
          >
            <span aria-hidden="true">⋮</span>
          </button>
        </div>
      </div>
    </div>
  );
};
