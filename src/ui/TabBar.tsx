import { TABS } from './tabs';

export function TabBar({ active, onSelect }: { active: number; onSelect: (index: number) => void }): JSX.Element {
  return (
    <nav className="flex shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab, at) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(at)}
          className={`min-h-[52px] flex-1 px-1 text-xs ${at === active ? 'font-semibold text-accent' : 'text-text-subtle'}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
