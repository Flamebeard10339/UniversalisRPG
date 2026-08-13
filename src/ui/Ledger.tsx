// A published dictionary, drawn as rows. Stats, skills, equipment and what the
// player is carrying are four of these and differ only in what the engine put
// in them, so the sheet is one component and four readings of the view.
//
// A row opens something where the shell has something for it to open, and the
// sheet is passive either way: it holds no selection and knows nothing about
// what opening one leads to.
export function Ledger({ entries, onOpen }: { entries: Array<{ name: string; value: string }>; onOpen?: (name: string) => void }): JSX.Element {
  return (
    <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <dl className="mx-auto flex max-w-2xl flex-col">
        {entries.map((entry) => (
          <div key={entry.name} className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
            <dt className="min-w-0 flex-1 truncate text-sm">
              {onOpen ? (
                <button data-drive="send" type="button" onClick={() => onOpen(entry.name)} className="w-full truncate text-left transition-transform duration-75 active:scale-[0.99] active:text-accent">
                  {entry.name}
                </button>
              ) : (
                entry.name
              )}
            </dt>
            <dd className="shrink-0 text-sm tabular-nums text-text-subtle">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
