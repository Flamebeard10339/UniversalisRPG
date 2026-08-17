import type { UniverseProblem } from '../runtime/openUniverse';
import { remediesFor, type Remedy } from './driver';
import type { Words } from './words';

// Drawn over whatever the shell managed to open, because the state it is about
// is one the pages below cannot be used to leave: an author whose local module
// stopped the session opening cannot edit their way out of it, since editing
// needs the session that failed. Every remedy the report has is a control here,
// so a problem reaches a screen with something to do beside it or it does not
// reach one at all.
//
// Which controls stand is asked of the door's report rather than decided here,
// so the one that discards an author's work is offered exactly where the local
// module is one of the modules the door reported a problem against.
export function FaultBanner({ problems, words, onRemedy }: { problems: readonly UniverseProblem[]; words: Words; onRemedy: (remedy: Remedy) => void }): JSX.Element {
  const remedies = remediesFor(problems);

  return (
    <div role="alert" className="flex shrink-0 flex-col gap-2 border-b border-border bg-surface-raised px-3 py-2">
      {problems.map((problem) => (
        <p key={problem.message} className="select-text break-words font-mono text-xs text-text-subtle">
          {problem.message}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        {remedies.includes('clear-local') ? (
          <button
            data-drive="clear-local"
            type="button"
            onClick={() => onRemedy('clear-local')}
            className="grow rounded-xl bg-accent px-3 text-sm font-medium text-accent-text transition-transform duration-75 active:scale-[0.97]"
          >
            {words('clear')}
          </button>
        ) : null}
        {remedies.includes('reopen') ? (
          <button
            data-drive="reopen"
            type="button"
            onClick={() => onRemedy('reopen')}
            className="grow rounded-xl border border-border bg-panel px-3 text-sm text-text-subtle transition-transform duration-75 active:scale-[0.97]"
          >
            {words('reopen')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
