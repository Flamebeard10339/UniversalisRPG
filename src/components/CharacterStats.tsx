import { statTitleKey } from '../game/contentIds';
import { getCharacterStatTotals } from '../game/characterStats';
import type { ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { ResourceStatus } from './ResourceStatus';

type CharacterStatsProps = {
  bundle: ContentBundle;
  onOpenStat: (statId: string) => void;
  playState: UniversePlayState;
  t: Translator;
};

export const CharacterStats = ({ bundle, onOpenStat, playState, t }: CharacterStatsProps) => (
  <section className="grid gap-4">
    <section className="grid gap-3 rounded border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-base font-semibold text-slate-100">{t('characterStats.stats.title')}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {bundle.stats.map((stat) => {
          const totals = getCharacterStatTotals(playState, bundle.stats, stat.id, bundle.skills, bundle.items, bundle.manifest.experienceCurve, bundle.statModifiers);

          return (
            <button
              className="grid gap-1 rounded border border-slate-800 bg-slate-950 p-3 text-left transition hover:border-cyan-500"
              data-stat-id={stat.id}
              key={stat.id}
              onClick={() => onOpenStat(stat.id)}
              type="button"
            >
              <span className="text-xs font-medium text-slate-400">{t(statTitleKey(stat.id), stat.id)}</span>
              <span className="text-xl font-semibold text-cyan-100">{Math.trunc(totals.effectiveTotal)}</span>
            </button>
          );
        })}
      </div>
    </section>

    <section className="rounded border border-slate-800 bg-slate-900 p-4">
      <ResourceStatus bundle={bundle} includeMinimal={false} playState={playState} showEffects t={t} />
    </section>
  </section>
);
