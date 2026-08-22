import type { JournalEntry } from '../runtime/session';
import { TONES } from './journalPanel';
import { useTestSurface } from './useTestSurface';
import type { Words } from './words';

// What the journal screen is showing, drawn above the question the screen is
// asking. The question, and everything about leaving it, is the shared sheet's.
export function QuestBody({ entry, words }: { entry: JournalEntry; words: Words }): JSX.Element {
  useTestSurface('quest', { entry });

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface-raised p-4">
      <h3 className={`text-base font-semibold ${TONES[entry.standing]}`}>{entry.title}</h3>
      {entry.lines.length === 0 ? <p className="mt-2 text-sm text-text-muted">{words('journal-untouched')}</p> : null}
      <ol className="unbarred mt-2 flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        {entry.lines.map((line, at) => (
          <li key={`${line.stage}-${at}`} className={`text-sm ${line.struck ? 'text-text-muted line-through' : ''}`}>
            {line.said}
          </li>
        ))}
      </ol>
      {entry.hint ? <p className="mt-3 text-xs text-accent">{entry.hint}</p> : null}
    </div>
  );
}
