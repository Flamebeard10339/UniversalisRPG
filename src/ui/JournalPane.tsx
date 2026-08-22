import type { PlayView } from '../runtime/session';
import { journalRows } from './journalPanel';
import { useTestSurface } from './useTestSurface';
import type { Words } from './words';

export function JournalPane({ view, words }: { view: PlayView; words: Words }): JSX.Element {
  const rows = journalRows(view.journal);

  useTestSurface('journal', { rows });

  return (
    <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div className="mx-auto flex max-w-2xl flex-col">
        {rows.length === 0 ? <p className="py-6 text-center text-sm text-text-muted">{words('journal-empty')}</p> : null}
        {rows.map((row) => (
          <section key={row.id} className={`border-b border-border py-3 last:border-b-0 ${row.done ? 'text-text-muted' : ''}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="min-w-0 flex-1 text-sm font-semibold">{row.title}</h3>
              {row.done ? <span className="shrink-0 text-xs uppercase tracking-wide text-text-subtle">{words('journal-done')}</span> : null}
            </div>
            {row.log ? <p className="mt-1 text-sm">{row.log}</p> : null}
            {row.hint ? <p className="mt-1 text-xs text-accent">{row.hint}</p> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
