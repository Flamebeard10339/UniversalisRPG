import type { LiveProgress } from '../runtime/command';
import { fillPercent, remainingBadge } from './format';
import { Meter } from './Meter';
import { FILL_TRANSITION, useMoment } from './transient';

export function LiveSheet({ progress, onCancel }: { progress: LiveProgress; onCancel: () => void }): JSX.Element {
  const working = useMoment('underway', progress.active, String(progress.label));

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {progress.label}
            {progress.detail === undefined ? null : <span className="ml-2 text-xs font-normal text-text-subtle">{progress.detail}</span>}
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel">
            <div className={`${working} h-full bg-accent`} style={{ ...FILL_TRANSITION, width: `${fillPercent(progress.progress, 1)}%` }} />
          </div>
        </div>
        <button
          data-drive="cancel"
          type="button"
          onClick={onCancel}
          aria-label={progress.label}
          className="min-h-[48px] min-w-[48px] shrink-0 rounded-xl border border-border bg-panel text-lg transition-transform duration-75 active:scale-[0.97] active:bg-danger active:text-accent-text"
        >
          ✕
        </button>
      </div>

      {progress.implicit ? (
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs tabular-nums text-text-subtle">×{progress.implicit.attempts}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel">
            <div className="h-full bg-accent-strong" style={{ width: `${fillPercent(progress.implicit.completion, 1)}%` }} />
          </div>
          <span className="w-16 shrink-0" />
        </div>
      ) : null}

      {progress.pools.map((pool) => (
        <div key={pool.title} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Meter title={pool.title} current={pool.current} max={pool.max} readout />
          </div>
          {remainingBadge(pool.remaining) !== null ? <span className="w-8 shrink-0 text-right text-xs tabular-nums text-text-subtle">{remainingBadge(pool.remaining)}</span> : null}
        </div>
      ))}
    </div>
  );
}
