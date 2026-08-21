import type { Subpage } from './nav';
import type { Words } from './words';

export function TabBar({ tabs, active, columns = 1, onSelect, words }: { tabs: readonly Subpage[]; active: number; columns?: number; onSelect: (index: number) => void; words: Words }): JSX.Element {
  const shown = (at: number): boolean => at >= active && at < active + columns;

  return (
    <nav className="flex shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      {tabs.map((tab, at) => (
        <button
          key={tab.id}
          data-drive="shell.subpage"
          data-subpage={tab.id}
          data-drawn={shown(at) ? 'yes' : undefined}
          type="button"
          onClick={() => onSelect(at)}
          className={`min-h-[52px] flex-1 px-1 text-xs ${shown(at) ? 'font-semibold text-accent' : 'text-text-subtle'}`}
        >
          {words(tab.id)}
        </button>
      ))}
    </nav>
  );
}
