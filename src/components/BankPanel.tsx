import { itemTitleKey } from '../game/contentIds';
import type { ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';

type BankPanelProps = {
  bundle: ContentBundle;
  onDeposit: (itemId: string, amount: number) => void;
  onWithdraw: (itemId: string, amount: number) => void;
  playState: UniversePlayState;
  t: Translator;
};

export const BankPanel = ({ bundle, onDeposit, onWithdraw, playState, t }: BankPanelProps) => {
  const bankEntries = Object.entries(playState.bank).filter(([, amount]) => amount > 0);
  const inventoryEntries = Object.entries(playState.inventory).filter(([, amount]) => amount > 0);

  return (
    <section className="grid gap-4 rounded border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
      <section className="grid gap-2">
        <h2 className="text-base font-semibold text-slate-100">{t('bank.title')}</h2>
        {bankEntries.length === 0 ? (
          <p className="text-sm text-slate-500">{t('bank.empty')}</p>
        ) : (
          <ul className="grid gap-2">
            {bankEntries.map(([itemId, amount]) => (
              <li className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950 p-3" key={itemId}>
                <span className="text-sm text-slate-100">{t(itemTitleKey(itemId), itemId)} x{amount}</span>
                <button
                  className="rounded border border-cyan-700 px-3 py-1.5 text-xs font-semibold text-cyan-100"
                  onClick={() => onWithdraw(itemId, amount)}
                  type="button"
                >
                  {t('bank.withdraw')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="text-base font-semibold text-slate-100">{t('inventory.title')}</h2>
        {inventoryEntries.length === 0 ? (
          <p className="text-sm text-slate-500">{t('inventory.empty')}</p>
        ) : (
          <ul className="grid gap-2">
            {inventoryEntries.map(([itemId, amount]) => (
              <li className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950 p-3" key={itemId}>
                <span className="text-sm text-slate-100">{t(itemTitleKey(itemId), itemId)} x{amount}</span>
                <button
                  className="rounded border border-cyan-700 px-3 py-1.5 text-xs font-semibold text-cyan-100"
                  onClick={() => onDeposit(itemId, amount)}
                  type="button"
                >
                  {t('bank.deposit')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
};
