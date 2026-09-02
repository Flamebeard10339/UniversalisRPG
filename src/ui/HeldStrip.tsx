import type { HeldEffect } from '../runtime/session';

export function HeldStrip({ held }: { held: readonly HeldEffect[] }): JSX.Element | null {
  if (held.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {held.map((effect) => (
        <span key={effect.id} className="flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 text-xs text-text-subtle">
          <span className="truncate">{effect.title}</span>
          {effect.stacks > 1 ? <span className="tabular-nums">{`×${effect.stacks}`}</span> : null}
          <span className="tabular-nums text-accent">{`${effect.secondsLeft}s`}</span>
        </span>
      ))}
    </div>
  );
}
