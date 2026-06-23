import { skillTitleKey } from '../game/contentIds';
import { getSkillTotals } from '../game/adversarial';
import { COMBAT_CV } from '../game/combatBalance';
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
        <h2 className="text-base font-semibold text-slate-100">{t('characterStats.skills.title')}</h2>
        <p className="text-xs text-slate-400">{t('characterStats.combatVariance', { percent: COMBAT_CV * 100 })}</p>
      </div>
      <div className="grid gap-2 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead className="text-slate-400">
            <tr className="border-b border-slate-800">
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.skill')}</th>
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.base')}</th>
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.added')}</th>
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.increased')}</th>
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.effective')}</th>
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.rate')}</th>
            </tr>
          </thead>
          <tbody>
            {bundle.skills.map((skill) => {
              const totals = getSkillTotals(playState, skill);

              return (
                <tr className="border-b border-slate-800/80 text-slate-200" key={skill.id}>
                  <td className="py-2 pr-3 font-semibold text-slate-100">{t(skillTitleKey(skill.id))}</td>
                  <td className="py-2 pr-3">{formatNumber(totals.base)}</td>
                  <td className="py-2 pr-3">{formatNumber(totals.added)}</td>
                  <td className="py-2 pr-3">{formatNumber(totals.increased)}</td>
                  <td className="py-2 pr-3 text-cyan-100">{formatNumber(totals.effectiveTotal)}</td>
                  <td className="py-2 pr-3">{t('characterStats.rateValue', { rate: formatNumber(totals.rate) })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>

    <section className="rounded border border-slate-800 bg-slate-900 p-4">
      <ResourceStatus bundle={bundle} playState={playState} showEffects t={t} />
    </section>
  </section>
);
