import { statTitleKey } from '../game/contentIds';
import { getCharacterStatTotals } from '../game/characterStats';
import type { ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { ResourceStatus } from './ResourceStatus';

type CharacterStatsProps = {
  bundle: ContentBundle;
  playState: UniversePlayState;
  t: Translator;
};

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

export const CharacterStats = ({ bundle, playState, t }: CharacterStatsProps) => (
  <section className="grid gap-4">
    <section className="grid gap-3 rounded border border-slate-800 bg-slate-900 p-4">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{t('characterStats.stats.title')}</h2>
      </div>
      <div className="grid gap-2 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead className="text-slate-400">
            <tr className="border-b border-slate-800">
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.stat')}</th>
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.base')}</th>
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.added')}</th>
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.increased')}</th>
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.effective')}</th>
            </tr>
          </thead>
          <tbody>
            {bundle.stats.map((stat) => {
              const totals = getCharacterStatTotals(playState, bundle.stats, stat.id, bundle.skills, bundle.items);

              return (
                <tr className="border-b border-slate-800/80 text-slate-200" key={stat.id}>
                  <td className="py-2 pr-3 font-semibold text-slate-100">{t(statTitleKey(stat.id), stat.id)}</td>
                  <td className="py-2 pr-3">{formatNumber(totals.base)}</td>
                  <td className="py-2 pr-3">{formatNumber(totals.added)}</td>
                  <td className="py-2 pr-3">{formatNumber(totals.increased)}</td>
                  <td className="py-2 pr-3 text-cyan-100">{formatNumber(totals.effectiveTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>

    <section className="rounded border border-slate-800 bg-slate-900 p-4">
      <ResourceStatus bundle={bundle} includeMinimal={false} playState={playState} showEffects t={t} />
    </section>
  </section>
);
