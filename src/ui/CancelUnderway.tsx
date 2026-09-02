import type { Localized } from '../runtime/localized';

export function CancelUnderway({ label, onCancel }: { label: Localized; onCancel: () => void }): JSX.Element {
  return (
    <div className="flex shrink-0 items-center border-y border-l-0 border-border bg-surface pr-4">
      <button
        data-drive="cancel"
        type="button"
        onClick={onCancel}
        aria-label={label}
        className="min-h-[48px] min-w-[48px] shrink-0 rounded-xl border border-border bg-panel text-lg transition-transform duration-75 active:scale-[0.97] active:bg-danger active:text-accent-text"
      >
        ✕
      </button>
    </div>
  );
}
