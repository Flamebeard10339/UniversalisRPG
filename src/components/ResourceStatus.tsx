import { effectTitleKey, resourceTitleKey } from '../game/contentIds';
import type { ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { getEffectRatePerMinute, isEffectApplicable, projectResourcePool } from '../game/resources';
import { useNow } from '../hooks/useNow';

type ResourceStatusProps = {
  bundle: ContentBundle;
  playState: UniversePlayState;
  showEffects?: boolean;
  t: Translator;
};

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

export const ResourceStatus = ({ bundle, playState, showEffects = false, t }: ResourceStatusProps) => {
  const resources = bundle.resourceDefinitions ?? [];
  const now = useNow(Boolean(playState.activeAction), 100);

  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold text-slate-100">{t('resources.title')}</h2>

      {resources.length === 0 ? (
        <p className="text-sm text-slate-500">{t('resources.empty')}</p>
      ) : (
        <div className="grid gap-3">
          {resources.map((resource) => {
            const pool = projectResourcePool(bundle, playState, resource, now);
            const percent = ((pool.current - pool.min) / Math.max(1, pool.max - pool.min)) * 100;
            const effects = (bundle.effects ?? []).filter((effect) => effect.resourceId === resource.id);

            return (
              <section className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-3" key={resource.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-100">{t(resourceTitleKey(resource.id), resource.id)}</span>
                  <span className="text-xs text-slate-300">
                    {t('resources.value', {
                      current: formatNumber(pool.current),
                      min: formatNumber(pool.min),
                      max: formatNumber(pool.max),
                    })}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-800">
                  <div className="h-full bg-rose-400" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
                </div>

                {showEffects && (
                  <div className="grid gap-1 border-t border-slate-800 pt-2 text-xs">
                    {effects.length === 0 ? (
                      <p className="text-slate-500">{t('resources.effects.empty')}</p>
                    ) : (
                      effects.map((effect) => {
                        const rate = getEffectRatePerMinute(bundle.stats, playState, effect, bundle.manifest.basePlayer);
                        const active = Boolean(playState.activeAction) && isEffectApplicable(playState, effect);

                        return (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300" key={effect.id}>
                            <span>{t(effectTitleKey(effect.id), effect.id)}</span>
                            <span className={active ? 'text-emerald-200' : 'text-slate-500'}>
                              {t(active ? 'resources.effects.activeRate' : 'resources.effects.inactiveRate', {
                                rate: formatNumber(rate),
                              })}
                              {` ${t('resources.effects.fromStat', { stat: effect.sourceStat })}`}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
};
