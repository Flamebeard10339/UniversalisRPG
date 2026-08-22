import { useState } from 'react';
import type { Answer } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import { journalRows, rowNamed, TONES, type JournalRow } from './journalPanel';
import { useTestSurface } from './useTestSurface';
import type { Words } from './words';

function Detail({ row, words, onClose }: { row: JournalRow; words: Words; onClose: () => void }): JSX.Element {
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-bg/95 px-4 py-3">
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
          <h3 className={`min-w-0 flex-1 text-base font-semibold ${TONES[row.standing]}`}>{row.title}</h3>
          <button data-drive="send" type="button" onClick={onClose} className="shrink-0 text-xs uppercase tracking-wide text-text-subtle active:text-accent">
            {words('close')}
          </button>
        </div>
        <div className="unbarred min-h-0 flex-1 overflow-y-auto py-2">
          {row.lines.length === 0 ? <p className="py-4 text-sm text-text-muted">{words('journal-untouched')}</p> : null}
          <ol className="flex flex-col gap-1">
            {row.lines.map((line, at) => (
              <li key={`${line.stage}-${at}`} className={`text-sm ${line.struck ? 'text-text-muted line-through' : ''}`}>
                {line.said}
              </li>
            ))}
          </ol>
          {row.hint ? <p className="mt-3 text-xs text-accent">{row.hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function JournalPane({ view, words }: { view: PlayView; words: Words }): JSX.Element {
  const [opened, setOpened] = useState<Answer | null>(null);
  const rows = journalRows(view.journal);
  const shown = rowNamed(rows, opened);

  useTestSurface('journal', { rows, opened, controls: { open: setOpened } });

  return (
    <div className="unbarred relative min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <ul className="mx-auto flex max-w-2xl flex-col">
        {rows.length === 0 ? <li className="py-6 text-center text-sm text-text-muted">{words('journal-empty')}</li> : null}
        {rows.map((row) => (
          <li key={row.id} className="relative border-b border-border last:border-b-0">
            <button data-drive="send" type="button" onClick={() => setOpened(row.id)} className="w-full py-3 text-left active:scale-[0.99]">
              <span className={`text-sm font-semibold ${TONES[row.standing]}`}>{row.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {shown ? <Detail row={shown} words={words} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}
