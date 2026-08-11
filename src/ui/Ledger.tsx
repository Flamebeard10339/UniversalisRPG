// A published dictionary, drawn as rows. Stats, skills, equipment and what the
// player is carrying are four of these and differ only in what the engine put
// in them, so the sheet is one component and four readings of the view.
export function Ledger({ entries }: { entries: Array<{ name: string; value: string }> }): JSX.Element {
  return (
    <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <dl className="mx-auto flex max-w-2xl flex-col">
        {entries.map((entry) => (
          <div key={entry.name} className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
            <dt className="min-w-0 truncate text-sm">{entry.name}</dt>
            <dd className="shrink-0 text-sm tabular-nums text-text-subtle">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
