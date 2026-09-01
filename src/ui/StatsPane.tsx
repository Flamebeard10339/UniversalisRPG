import { useState } from 'react';
import type { Answer, Localizer } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import { Ledger } from './Ledger';
import { fillOf } from './lineStyle';
import { counted, identity } from './sheet';
import { NAME } from './sheetLayout';
import { shownTab, statTabs } from './statTabs';
import { useTestSurface } from './useTestSurface';
import { TOUCH_FLOOR } from './viewport';

export function StatsPane({ view, localizer, onOpen }: { view: PlayView; localizer: Localizer; onOpen: (stat: string) => void }): JSX.Element {
  const [chosen, setChosen] = useState<Answer | null>(null);
  const tabs = statTabs(view.stats);
  const shown = shownTab(tabs, chosen);

  useTestSurface('stats', { tabs, chosen: shown?.group?.id ?? null, controls: { tab: setChosen } });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {tabs.length < 2 ? null : (
        <div className="unbarred flex shrink-0 gap-2 overflow-x-auto px-4 pt-3">
          {tabs.map((tab) => (
            <button
              key={tab.group?.id ?? ''}
              data-drive="stats.tab"
              data-group={tab.group?.id ?? ''}
              data-drawn={tab.group?.id === shown?.group?.id ? 'yes' : undefined}
              type="button"
              onClick={() => setChosen(tab.group?.id ?? null)}
              style={{ minHeight: TOUCH_FLOOR, ...(tab.group?.id === shown?.group?.id ? fillOf(tab.group ?? undefined) : {}) }}
              className={`shrink-0 rounded-xl border px-3 text-sm transition-transform duration-75 active:scale-[0.98] ${NAME} ${
                tab.group?.id === shown?.group?.id ? 'font-semibold' : 'border-border bg-panel text-text-subtle'
              }`}
            >
              {tab.group?.title}
            </button>
          ))}
        </div>
      )}
      <Ledger entries={[...identity(view.player), ...counted(shown?.rows ?? [], localizer)]} onOpen={(id) => void (view.stats.some((row) => row.id === id) && onOpen(id))} />
    </div>
  );
}
