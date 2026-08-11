import type { PlayView } from '../runtime/session';
import { formatClock } from './format';

// The boundary between the map and the play surface: where the player is, read
// downward from Home and upward from the Map.
export function LocationBanner({ view }: { view: PlayView | null }): JSX.Element {
  return (
    <div className="min-h-[48px] border-y border-border bg-surface px-4 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="truncate text-base font-semibold">{view?.location.title}</h1>
        <span className="shrink-0 text-xs tabular-nums text-text-subtle">{view ? formatClock(view.time) : ''}</span>
      </div>
      {view && view.entities.length > 0 ? <p className="mt-0.5 truncate text-xs text-text-subtle">{view.entities.map((entity) => entity.title).join(' · ')}</p> : null}
    </div>
  );
}
