import { TABS, type TabId } from './tabs';

export function TabBar({ active, onSelect }: { active: TabId; onSelect: (id: TabId) => void }): JSX.Element {
  return (
    <nav className="flex shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={`min-h-[52px] flex-1 px-1 text-xs ${tab.id === active ? 'font-semibold text-accent' : 'text-text-subtle'}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
