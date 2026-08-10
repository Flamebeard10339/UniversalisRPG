import { fillPercent, tidy } from './format';

// A named bar with an optional readout. Whatever is being whittled down — a
// resource on the header, a foe in a run — reads the same way.
export function Meter({ title, current, max, readout }: { title: string; current: number; max: number; readout: boolean }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-xs text-text-subtle">{title}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel">
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${fillPercent(current, max)}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-text-subtle">{readout ? `${tidy(current)}/${tidy(max)}` : ''}</span>
    </div>
  );
}
