import type { PlayView } from '../runtime/session';
import { formatClock } from './format';
import { useMoment } from './transient';

export function LocationBanner({ view, flash }: { view: PlayView; flash: boolean }): JSX.Element {
  const arrived = useMoment('arrival', flash, view.location.id);

  return (
    <div className={`${arrived} min-h-[48px] border-y border-border bg-surface px-4 py-2`}>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="truncate text-base font-semibold">{view.location.title}</h1>
        <span className="shrink-0 text-xs tabular-nums text-text-subtle">{formatClock(view.time)}</span>
      </div>
      {view.entities.length > 0 ? <p className="mt-0.5 truncate text-xs text-text-subtle">{view.entities.map((entity) => entity.title).join(' · ')}</p> : null}
    </div>
  );
}
