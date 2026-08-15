import type { Entry } from './sheet';

// A published dictionary, drawn as rows. Stats, skills, equipment and what the
// player is carrying are four of these and differ only in what the engine put
// in them, so the sheet is one component and four readings of the view.
//
// A row opens something where the shell has something for it to open, and the
// sheet is passive either way: it holds no selection and knows nothing about
// what opening one leads to.
//
// What opens it is the whole row rather than the term on its left. The two
// halves of a row are the engine's two fields and not two things to press: on
// the equipment page the left half is the slot and the right is the thing worn
// in it, so a press that only counted on the left missed the name the player
// was aiming at.
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
