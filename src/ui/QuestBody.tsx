import { CARD } from './sheetLayout';
import type { JournalEntry } from '../runtime/session';
import { inkOf } from './lineStyle';
import { useTestSurface } from './useTestSurface';
import type { Words } from './words';

export function QuestBody({ entry, words }: { entry: JournalEntry; words: Words }): JSX.Element {
  useTestSurface('quest', { entry });

  return (
    <div data-standing={entry.standing} className={CARD}>
      <h3 style={inkOf(entry.group)} className="text-base font-semibold">
        {entry.title}
      </h3>
      {entry.lines.length === 0 ? <p className="mt-2 text-sm text-text-muted">{words('journal-untouched')}</p> : null}
      <ol className="unbarred mt-2 flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        {entry.lines.map((line, at) => (
          <li key={`${line.stage}-${at}`} className={`text-sm ${line.struck ? 'text-text-muted line-through' : ''}`}>
            {line.said}
          </li>
        ))}
      </ol>
    </div>
  );
}
