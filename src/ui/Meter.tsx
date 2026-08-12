import { LIVE_TICK_MS } from '../runtime/command';
import { fillPercent, tidy } from './format';

// The fill eases linearly over exactly one tick, so a bar the clock moves every
// tick arrives as the next tick leaves and reads as continuous rather than as
// steps. Read off the cadence rather than spelled again as a Tailwind duration:
// the two would have to be changed together, and nothing would say so.
export const FILL_TRANSITION = { transitionProperty: 'width', transitionTimingFunction: 'linear', transitionDuration: `${LIVE_TICK_MS}ms` };

// A named bar with an optional readout. Whatever is being whittled down — a
// resource on the header, a foe in a run — reads the same way.
export function Meter({ title, current, max, readout }: { title: string; current: number; max: number; readout: boolean }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-xs text-text-subtle">{title}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel">
        <div className="h-full bg-accent" style={{ ...FILL_TRANSITION, width: `${fillPercent(current, max)}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-text-subtle">{readout ? `${tidy(current)}/${tidy(max)}` : ''}</span>
    </div>
  );
}
