import { skillTitleKey, statTitleKey } from '../game/contentIds';
import { getCharacterStatValue } from '../game/characterStats';
import { skillLevelFromXp } from '../game/skills';
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
              <th className="py-2 pr-3 font-medium">{t('characterStats.column.skill')}</th>
            </tr>
          </thead>
          <tbody>
            {bundle.stats.map((stat) => {
              const skillLevel = stat.skillId ? skillLevelFromXp(playState.skillXp[stat.skillId] ?? 0) : 0;
              const effective = getCharacterStatValue(playState, bundle.stats, stat.id, bundle.manifest.basePlayer);

              return (
                <tr className="border-b border-slate-800/80 text-slate-200" key={stat.id}>
                  <td className="py-2 pr-3 font-semibold text-slate-100">{t(statTitleKey(stat.id), stat.id)}</td>
                  <td className="py-2 pr-3">{formatNumber(bundle.manifest.basePlayer?.stats?.[stat.id] ?? stat.base ?? 0)}</td>
                  <td className="py-2 pr-3">{formatNumber(stat.added ?? 0)}</td>
                  <td className="py-2 pr-3">{formatNumber(stat.increased ?? 0)}</td>
                  <td className="py-2 pr-3 text-cyan-100">{formatNumber(effective)}</td>
                  <td className="py-2 pr-3">{stat.skillId ? `${t(skillTitleKey(stat.skillId), stat.skillId)} (+${formatNumber(skillLevel)})` : t('characterStats.noSkill')}</td>
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
