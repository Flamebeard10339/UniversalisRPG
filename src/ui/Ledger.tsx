import type { PlayView } from '../runtime/session';
import { Question } from './Question';
import type { Entry } from './sheet';

type Option = PlayView['modals'][number]['options'][number];

// What one row is being asked: the question itself and the row it is about, so
// the page draws it where the row is.
export interface RowQuestion {
  id: string;
  option: Option;
  onAnswer: (key: string, value: string) => void;
}

// A published dictionary, drawn as rows. Stats, skills, equipment and what the
// player is carrying are four of these and differ only in what the engine put
// in them, so the sheet is one component and four readings of the view.
//
// A row opens something where the shell has something for it to open, and what
// the opening asked comes back under that same row rather than over the page
// (c20): the verbs an entry offers are reached from the entry, one press to open
// it and one to take one. The sheet is passive either way — it holds no
// selection, composes no question and knows nothing about what answering one
// leads to.
export function Ledger({ entries, onOpen, asking }: { entries: readonly Entry[]; onOpen?: (id: string) => void; asking?: RowQuestion }): JSX.Element {
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
            {asking && asking.id === entry.id ? (
              <dd className="mt-2 rounded-xl border border-border bg-surface-raised p-3">
                <Question option={asking.option} onAnswer={asking.onAnswer} />
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
