import type { PlayView } from '../runtime/session';
import { journalRows, TONES } from './journalPanel';
import { useTestSurface } from './useTestSurface';
import type { Words } from './words';

// The list itself. Reading one is a screen the engine opens, so a row sends the
// line that opens it rather than holding a quest open on its own.
export function JournalPane({ view, words, onOpen }: { view: PlayView; words: Words; onOpen: (quest: string) => void }): JSX.Element {
  const rows = journalRows(view.journal);

  useTestSurface('journal', { rows, controls: { open: onOpen } });

  return (
    <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <ul className="mx-auto flex max-w-2xl flex-col">
        {rows.length === 0 ? <li className="py-6 text-center text-sm text-text-muted">{words('journal-empty')}</li> : null}
        {rows.map((row) => (
          <li key={row.id} className="border-b border-border last:border-b-0">
            <button data-drive="send" type="button" onClick={() => onOpen(row.id)} className="w-full py-3 text-left active:scale-[0.99]">
              <span className={`text-sm font-semibold ${TONES[row.standing]}`}>{row.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
