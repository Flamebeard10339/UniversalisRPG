import type { Entry } from './sheet';

export function Ledger({ entries, onOpen }: { entries: readonly Entry[]; onOpen?: (id: string) => void }): JSX.Element {
  return (
    <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <dl className="mx-auto flex max-w-2xl flex-col">
        {entries.map((entry) => (
          <div key={entry.id ?? entry.name} className="relative border-b border-border py-2 last:border-b-0 active:scale-[0.99] active:text-accent">
            {onOpen && entry.id !== undefined ? (
              <button
                data-drive="send"
                type="button"
                aria-label={entry.name}
                onClick={() => onOpen(entry.id!)}
                className="absolute inset-0 z-10 w-full"
              />
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0 flex-1 truncate text-sm">{entry.name}</dt>
              <dd className="shrink-0 text-sm tabular-nums text-text-subtle">{entry.value}</dd>
            </div>
            {entry.detail ? <dd className="mt-0.5 text-xs tabular-nums text-text-muted">{entry.detail}</dd> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
