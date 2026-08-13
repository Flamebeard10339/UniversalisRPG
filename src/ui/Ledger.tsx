import type { Entry } from './sheet';

// A published dictionary, drawn as rows. Stats, skills, equipment and what the
// player is carrying are four of these and differ only in what the engine put
// in them, so the sheet is one component and four readings of the view.
//
// A row opens something where the shell has something for it to open, and the
// sheet is passive either way: it holds no selection and knows nothing about
// what opening one leads to.
export function Ledger({ entries, onOpen }: { entries: readonly Entry[]; onOpen?: (id: string) => void }): JSX.Element {
  return (
    <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <dl className="mx-auto flex max-w-2xl flex-col">
        {entries.map((entry) => (
          <div key={entry.id ?? entry.name} className="border-b border-border py-2 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0 flex-1 truncate text-sm">
                {onOpen ? (
                  <button data-drive="send" type="button" onClick={() => onOpen(entry.id ?? entry.name)} className="w-full truncate text-left transition-transform duration-75 active:scale-[0.99] active:text-accent">
                    {entry.name}
                  </button>
                ) : (
                  entry.name
                )}
              </dt>
              <dd className="shrink-0 text-sm tabular-nums text-text-subtle">{entry.value}</dd>
            </div>
            {entry.detail ? <dd className="mt-0.5 text-xs tabular-nums text-text-muted">{entry.detail}</dd> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
