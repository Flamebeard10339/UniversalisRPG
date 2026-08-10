import type { LiveProgress } from '../runtime/command';
import { fillPercent } from './format';
import { Meter } from './Meter';

// Where the choices sit when nothing is running. Everything on it is the run's
// own report: the label the engine gave the action, its progress, and whatever
// it is whittling down. The stop control is a glyph rather than a word for the
// same reason the modal's submit is — a word here would be prose this layer
// wrote, and no engine value produced it.
export function LiveSheet({ progress, onCancel }: { progress: LiveProgress; onCancel: () => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-3 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{progress.label}</p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${fillPercent(progress.progress, 1)}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
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
        <Meter key={pool.title} title={pool.title} current={pool.current} max={pool.max} readout />
      ))}
    </div>
  );
}
