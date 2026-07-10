import { useEffect, useRef, useState } from 'react';
import { MovementArrows } from './MovementArrows';
import type { ActionResolutionContext, ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';

type MovementArrowsPanelProps = {
  bundle: ContentBundle;
  context: ActionResolutionContext;
  onMove: (locationId: string) => void;
  playState: UniversePlayState;
  t: Translator;
};

// Below this much pointer movement, a press-and-release on the handle is
// treated as a tap (toggle open/closed) rather than a drag.
const TAP_THRESHOLD_PX = 6;

// Reasonable estimate of the arrow grid's natural height — used until the
// ResizeObserver below reports a real measurement, so opening the panel
// works immediately rather than requiring a successful measurement pass
// first.
const FALLBACK_PANEL_HEIGHT_PX = 220;

// Stacked directly above the chat panel (a sibling in the same fixed
// bottom-of-screen column, not an independently-positioned overlay) so it's
// always right where the chat's own resize handle is, however tall chat
// currently is, and never covers chat's own content. Collapsed by default;
// dragging or tapping the handle expands the arrow grid upward, above the
// handle, rather than sliding in from a side.
export const MovementArrowsPanel = ({ bundle, context, onMove, playState, t }: MovementArrowsPanelProps) => {
  const [open, setOpen] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [panelHeight, setPanelHeight] = useState(FALLBACK_PANEL_HEIGHT_PX);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = panelRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setPanelHeight(entry.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onHandlePointerDown = (event: React.PointerEvent) => {
    const startY = event.clientY;
    const baseHeight = dragHeight ?? (open ? panelHeight : 0);
    let maxDelta = 0;

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaY = startY - moveEvent.clientY; // dragging up expands the panel upward
      maxDelta = Math.max(maxDelta, Math.abs(deltaY));
      setDragHeight(Math.min(panelHeight, Math.max(0, baseHeight + deltaY)));
    };
    const handleUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setDragHeight(null);
      if (maxDelta < TAP_THRESHOLD_PX) {
        setOpen((current) => !current);
        return;
      }
      const deltaY = startY - upEvent.clientY;
      const finalHeight = Math.min(panelHeight, Math.max(0, baseHeight + deltaY));
      setOpen(finalHeight > panelHeight / 2);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const height = dragHeight ?? (open ? panelHeight : 0);
  // visibility (not just the height/overflow clip below) is what actually
  // pulls the collapsed arrow buttons out of tab order and the
  // accessibility tree — see MovementArrowsDrawer's old version of this
  // comment for why a 0-height overflow:hidden box alone isn't enough.
  const revealed = height > 0;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div
        className="flex justify-end overflow-hidden"
        style={{ transition: dragHeight === null ? 'height 200ms ease-out' : 'none', visibility: revealed ? 'visible' : 'hidden', height }}
      >
        <div className="pb-2" ref={panelRef}>
          <MovementArrows bundle={bundle} context={context} onMove={onMove} playState={playState} t={t} />
        </div>
      </div>
      <div
        aria-expanded={open}
        aria-label={open ? t('movementArrows.collapse', 'Hide movement') : t('movementArrows.expand', 'Show movement')}
        className="flex h-11 touch-none select-none items-center justify-center rounded-t border border-b-0 border-slate-700 bg-slate-900 text-slate-400"
        data-testid="movement-panel-handle"
        onPointerDown={onHandlePointerDown}
        role="button"
        tabIndex={0}
      >
        <span aria-hidden="true" className="h-1 w-10 rounded-full bg-slate-600" />
      </div>
    </div>
  );
};
