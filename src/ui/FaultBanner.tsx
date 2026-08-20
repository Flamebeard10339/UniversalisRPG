import type { UniverseProblem } from '../runtime/openUniverse';
import type { Remedy } from './driver';
import type { Words } from './words';

export function FaultBanner({ problems, remedies, words, onRemedy }: { problems: readonly UniverseProblem[]; remedies: readonly Remedy[]; words: Words; onRemedy: (remedy: Remedy) => void }): JSX.Element {
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
