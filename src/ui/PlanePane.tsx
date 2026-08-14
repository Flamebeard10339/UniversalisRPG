import type { PlaneView } from './plane';
import { useTestSurface } from './testSurface';

// What the screen being answered has in hand, drawn above the question it
// belongs to. It is handed a plane and draws it; which screen published one,
// and whether the driver has ever heard of that screen, is nothing this file
// can ask.
export function PlanePane({ plane }: { plane: PlaneView }): JSX.Element {
  useTestSurface('plane', { plane });

  return (
    <div className="unbarred mx-auto min-h-0 w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface-raised p-4">
      <p className="text-xs uppercase tracking-wide text-text-subtle">{plane.title}</p>
      <dl className="mb-3 flex flex-wrap gap-x-4">
        {plane.facts.map((fact) => (
          <div key={fact.name} className="flex items-baseline gap-1">
            <dt className="text-xs uppercase tracking-wide text-text-subtle">{fact.name}</dt>
            <dd className="text-sm tabular-nums">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {plane.hexes.map((hex) => (
        <section key={hex.hex} className={`mb-2 rounded-xl border ${hex.focused ? 'border-accent' : 'border-border'} p-2 last:mb-0`}>
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-sm tabular-nums text-text-subtle">{hex.hex}</span>
            <span className="min-w-0 truncate text-sm">{hex.jewel}</span>
          </p>
          {hex.rows.map((row) => (
            <p key={row.node} className="flex items-baseline gap-2 border-t border-border pt-1 text-xs">
              <span className="w-14 shrink-0 uppercase tracking-wide text-text-subtle">{row.standing}</span>
              <span className="w-24 shrink-0 tabular-nums text-text-subtle">{row.node}</span>
              <span className="min-w-0 flex-1 truncate">{row.what}</span>
              <span className="shrink-0 tabular-nums text-text-muted">{row.worth}</span>
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
