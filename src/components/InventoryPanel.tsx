import { itemDescriptionKey, itemTitleKey } from '../game/contentIds';
import type { UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';

type InventoryPanelProps = {
  playState: UniversePlayState;
  t: Translator;
};

export const InventoryPanel = ({ playState, t }: InventoryPanelProps) => {
  const entries = Object.entries(playState.inventory).filter(([, amount]) => amount > 0);

  return (
    <section className="grid gap-2 rounded border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-base font-semibold text-slate-100">{t('inventory.title')}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">{t('inventory.empty')}</p>
      ) : (
        <div className="grid gap-2">
          {entries.map(([itemId, amount]) => (
              <section className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-3" key={itemId}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{t(itemTitleKey(itemId), itemId)}</h3>
                    <p className="mt-1 text-xs text-slate-400">{t(itemDescriptionKey(itemId), '')}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-100">{amount}</span>
                </div>
              </section>
          ))}
        </div>
      )}
    </section>
  );
};
