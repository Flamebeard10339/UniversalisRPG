import { fillOf } from './lineStyle';
import type { Entry } from './sheet';
import { doll, GRID, type Layout } from './sheetLayout';
import { TOUCH_FLOOR } from './viewport';

function Opener({ entry, onOpen }: { entry: Entry; onOpen?: (id: string) => void }): JSX.Element | null {
  if (!onOpen || entry.id === undefined) return null;
  return <button data-drive="send" type="button" aria-label={entry.name} onClick={() => onOpen(entry.id!)} className="absolute inset-0 z-10 w-full" />;
}

function Row({ entry, onOpen }: { entry: Entry; onOpen?: (id: string) => void }): JSX.Element {
  return (
    <div className="relative border-b border-border py-2 last:border-b-0 active:scale-[0.99] active:text-accent">
      <Opener entry={entry} onOpen={onOpen} />
      <div className="flex items-baseline justify-between gap-3">
        <dt className="min-w-0 flex-1 truncate text-sm">{entry.name}</dt>
        <dd className="shrink-0 text-sm tabular-nums text-text-subtle">{entry.value}</dd>
      </div>
      {entry.detail ? <dd className="mt-0.5 text-xs tabular-nums text-text-muted">{entry.detail}</dd> : null}
    </div>
  );
}

// Where a cell sits is the cell's own business: an entry that says where it belongs takes that
// square of whatever grid it is drawn in, and one that says nothing takes the next square going.
function Cell({ entry, onOpen }: { entry: Entry; onOpen?: (id: string) => void }): JSX.Element {
  return (
    <div
      style={{ minHeight: TOUCH_FLOOR, ...fillOf(entry.group), ...(entry.at === undefined ? {} : { gridColumn: entry.at.column, gridRow: entry.at.row }) }}
      className="relative flex flex-col justify-center rounded-2xl border border-border bg-surface-raised px-2 py-2 transition-transform duration-75 active:scale-[0.98] active:border-accent"
    >
      <Opener entry={entry} onOpen={onOpen} />
      <dt className="w-full truncate text-center text-xs font-semibold">{entry.name}</dt>
      <dd className="w-full truncate text-center text-xs tabular-nums text-text-subtle">{entry.value}</dd>
      {entry.detail ? <dd className="w-full truncate text-center text-xs tabular-nums text-text-muted">{entry.detail}</dd> : null}
    </div>
  );
}

const keyOf = (entry: Entry): string => entry.id ?? entry.name;

function Body({ entries, layout, onOpen }: { entries: readonly Entry[]; layout: Layout; onOpen?: (id: string) => void }): JSX.Element {
  if (layout === 'list') {
    return (
      <dl className="mx-auto flex max-w-2xl flex-col">
        {entries.map((entry) => (
          <Row key={keyOf(entry)} entry={entry} onOpen={onOpen} />
        ))}
      </dl>
    );
  }

  if (layout === 'grid') {
    return (
      <dl className={`mx-auto max-w-2xl ${GRID}`}>
        {entries.map((entry) => (
          <Cell key={keyOf(entry)} entry={entry} onOpen={onOpen} />
        ))}
      </dl>
    );
  }

  const { body, beneath, columns, rows } = doll(entries);
  return (
    <dl className="mx-auto flex max-w-2xl flex-col gap-3">
      {columns > 0 ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
          {body.map((entry) => (
            <Cell key={keyOf(entry)} entry={entry} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
      {beneath.length > 0 ? (
        <div className={GRID}>
          {beneath.map((entry) => (
            <Cell key={keyOf(entry)} entry={entry} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </dl>
  );
}

export function Ledger({ entries, layout = 'list', onOpen }: { entries: readonly Entry[]; layout?: Layout; onOpen?: (id: string) => void }): JSX.Element {
  return (
    <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Body entries={entries} layout={layout} onOpen={onOpen} />
    </div>
  );
}
