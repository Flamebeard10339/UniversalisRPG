import { LABELS } from './labels';
import type { Subpage } from './nav';

// Fixed where a thumb rests, and carrying the current layer's pages rather than
// every destination in the app: the layers are reached by the banners, so this
// bar answers one question and the banners answer the other.
export function TabBar({ tabs, active, onSelect }: { tabs: readonly Subpage[]; active: number; onSelect: (index: number) => void }): JSX.Element {
  return (
    <nav className="flex shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      {tabs.map((tab, at) => (
        <button
          key={tab.id}
          data-drive="shell.subpage"
          data-subpage={tab.id}
          type="button"
          onClick={() => onSelect(at)}
          className={`min-h-[52px] flex-1 px-1 text-xs ${at === active ? 'font-semibold text-accent' : 'text-text-subtle'}`}
        >
          {LABELS[tab.id]}
        </button>
      ))}
    </nav>
  );
}
