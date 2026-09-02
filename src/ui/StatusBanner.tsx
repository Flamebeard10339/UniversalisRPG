import type { LiveProgress } from '../runtime/command';
import type { PlayView } from '../runtime/session';
import { fillPercent, remainingBadge } from './format';
import { HeldStrip } from './HeldStrip';
import { Meter } from './Meter';
import { marchesAt } from './pace';
import { FILL_TRANSITION, RACING, STIRRING, useMoment } from './transient';

function Underway({ live, racing }: { live: LiveProgress; racing: boolean }): JSX.Element {
  const working = useMoment('underway', live.active, String(live.label));
  return (
    <div className="flex flex-col gap-1.5">
      <p className="truncate text-sm font-medium">
        {live.label}
        {live.detail === undefined ? null : <span className="ml-2 text-xs font-normal text-text-subtle">{live.detail}</span>}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-panel">
        {racing ? (
          <div data-live="hurrying" className={`${RACING} h-full w-full`} />
        ) : (
          <div data-live="fill" className={`${working} h-full bg-accent`} style={{ ...FILL_TRANSITION, width: `${fillPercent(live.progress, 1)}%` }} />
        )}
      </div>
      {live.implicit ? (
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs tabular-nums text-text-subtle">×{live.implicit.attempts}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel">
            <div className="h-full bg-accent-strong" style={{ width: `${fillPercent(live.implicit.completion, 1)}%` }} />
          </div>
          <span className="w-16 shrink-0" />
        </div>
      ) : null}
    </div>
  );
}

export function StatusBanner({ view, live, speed, stirring }: { view: PlayView; live: LiveProgress | null; speed: number; stirring: boolean }): JSX.Element {
  return (
    <div
      data-stirring={stirring ? 'yes' : undefined}
      className={`relative flex min-h-[48px] flex-col justify-center gap-1.5 border-y border-border bg-surface px-4 py-2 ${stirring ? STIRRING : ''}`}
    >
      <div className="pointer-events-none absolute bottom-full left-4 right-4 flex flex-col items-start justify-end pb-1">
        <HeldStrip held={view.held} />
      </div>
      {live === null ? null : <Underway live={live} racing={marchesAt(speed)} />}
      {(view.encounter?.foes ?? []).map((foe) => (
        <div key={foe.id} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Meter title={foe.title} current={foe.current} max={foe.max} readout />
          </div>
          {remainingBadge(foe.remaining) !== null ? <span className="w-8 shrink-0 text-right text-xs tabular-nums text-text-subtle">{remainingBadge(foe.remaining)}</span> : null}
        </div>
      ))}
      {view.resources.map((resource) => (
        <Meter key={resource.id} title={resource.title} current={resource.current} max={resource.max} readout={resource.display === 'full'} />
      ))}
    </div>
  );
}
