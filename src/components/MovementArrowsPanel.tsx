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
// currently is, and never covers chat's own content. Collapsed by default.
// One seamless bordered panel with the handle at the *top* (mirrors
// ChatPanel's own handle-then-content layout) — the arrow grid expands
// downward from the handle, and since this whole panel sits directly above
// chat with its bottom edge pinned there, the handle rides up together with
// the panel's own top edge as it opens, instead of staying fixed at the
// bottom below a separately-bordered arrows box. Sized to its own content
// and right-aligned, not stretched full-width, so it reads as a small
// attached control rather than a second full-width bar.
export const MovementArrowsPanel = ({ bundle, context, onMove, playState, t }: MovementArrowsPanelProps) => {
  const [open, setOpen] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [panelHeight, setPanelHeight] = useState(FALLBACK_PANEL_HEIGHT_PX);
  const panelRef = useRef<HTMLDivElement>(null);
  // Tracks whether the in-progress pointer gesture moved past the tap
  // threshold, so the plain onClick fallback below (kept for devices/
  // browsers where a drag's pointerup doesn't reliably reach a window
  // listener) knows to skip toggling for a gesture the drag logic already
  // resolved.
  const draggedRef = useRef(false);

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
    draggedRef.current = false;

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaY = startY - moveEvent.clientY; // dragging up expands the panel upward
      if (Math.abs(deltaY) >= TAP_THRESHOLD_PX) draggedRef.current = true;
      setDragHeight(Math.min(panelHeight, Math.max(0, baseHeight + deltaY)));
    };
    const handleUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (!draggedRef.current) {
        // Not a real drag — let the click handler (below) do the toggle,
        // so a plain tap only flips open/closed once.
        setDragHeight(null);
        return;
      }
      const deltaY = startY - upEvent.clientY;
      const finalHeight = Math.min(panelHeight, Math.max(0, baseHeight + deltaY));
      setDragHeight(null);
      setOpen(finalHeight > panelHeight / 2);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  // A plain click, kept alongside the pointerdown/move/up drag tracking
  // above, so tapping still works even in a browser/device combination
  // where a drag's pointerup doesn't fire (click is a much older, more
  // universally reliable event). Skips toggling if the drag logic already
  // resolved this same gesture.
  const onHandleClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setOpen((current) => !current);
  };

  const height = dragHeight ?? (open ? panelHeight : 0);
  // visibility (not just the height/overflow clip below) is what actually
  // pulls the collapsed arrow buttons out of tab order and the
  // accessibility tree — see MovementArrowsDrawer's old version of this
  // comment for why a 0-height overflow:hidden box alone isn't enough.
  const revealed = height > 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl justify-end">
      {/* w-max (not items-end on the parent): shrink-wraps to the handle's
          own natural width so the whole panel reads as one small
          right-aligned control. overflow-hidden + rounded-t on this single
          wrapper (not on the handle and content separately) is what makes
          it one seamless box instead of two stacked, separately-bordered
          ones. */}
      <div className="w-max overflow-hidden rounded-t border border-b-0 border-slate-700 bg-slate-900">
        <button
          aria-expanded={open}
          aria-label={open ? t('movementArrows.collapse', 'Hide movement') : t('movementArrows.expand', 'Show movement')}
          className="flex h-11 w-full touch-none select-none items-center justify-center text-slate-400"
          data-testid="movement-panel-handle"
          onClick={onHandleClick}
          onPointerDown={onHandlePointerDown}
          type="button"
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-slate-600" />
        </button>
        <div
          className="overflow-hidden"
          style={{ transition: dragHeight === null ? 'height 200ms ease-out' : 'none', visibility: revealed ? 'visible' : 'hidden', height }}
        >
          <div className="pb-2" ref={panelRef}>
            <MovementArrows bundle={bundle} context={context} onMove={onMove} playState={playState} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
};
