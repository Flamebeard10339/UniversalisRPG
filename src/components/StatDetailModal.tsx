import { getCharacterStatSources, getCharacterStatTotals } from '../game/characterStats';
import { itemTitleKey, skillTitleKey, statExamineKey, statModifierTitleKey, statTitleKey } from '../game/contentIds';
import type { ContentBundle, StatSource, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { useNow } from '../hooks/useNow';

type StatDetailModalProps = {
  bundle: ContentBundle;
  onClose: () => void;
  playState: UniversePlayState;
  statId: string;
  t: Translator;
};

const formatNumber = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
const formatPercent = (value: number) => `${formatNumber(value * 100)}%`;
const formatSigned = (value: number, formatter: (value: number) => string) => `${value > 0 ? '+' : ''}${formatter(value)}`;

const formatBonusPair = (added: number, increased: number) => {
  const parts: string[] = [];
  if (added !== 0) parts.push(formatSigned(added, formatNumber));
  if (increased !== 0) parts.push(formatSigned(increased, formatPercent));
  return parts.join(', ');
};

const sourceKey = (source: StatSource) => {
  if (source.kind === 'skill') return `skill:${source.skillId}`;
  if (source.kind === 'modifier') return `modifier:${source.modifierId}`;
  return `${source.kind}:${source.itemId}`;
};

const sourceLabel = (source: StatSource, t: Translator) => {
  if (source.kind === 'skill') return t('characterStats.bonuses.skillSource', { skill: t(skillTitleKey(source.skillId), source.skillId) });
  if (source.kind === 'modifier') return t(statModifierTitleKey(source.modifierId), source.modifierId);
  return t(itemTitleKey(source.itemId), source.itemId);
};

export const StatDetailModal = ({ bundle, onClose, playState, statId, t }: StatDetailModalProps) => {
  const totals = getCharacterStatTotals(playState, bundle.stats, statId, bundle.skills, bundle.items, bundle.manifest.experienceCurve, bundle.statModifiers);
  const sources = getCharacterStatSources(playState, bundle.stats, statId, bundle.skills, bundle.items, bundle.manifest.experienceCurve, bundle.statModifiers);
  const hasBuffSource = sources.some((source) => source.kind === 'buff');
  const now = useNow(hasBuffSource, 1000);
  const examineText = t(statExamineKey(statId), '');

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/80 p-4" onClick={onClose}>
      <section
        className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">
            {t('characterStats.detail.title', { stat: t(statTitleKey(statId), statId), value: String(Math.trunc(totals.effectiveTotal)) })}
          </h2>
          <button className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-100" onClick={onClose} type="button">
            {t('dialog.close')}
          </button>
        </div>

        {examineText && <p className="mt-2 text-sm text-slate-400">{examineText}</p>}

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
          <span>{t('characterStats.column.base')}: {formatNumber(totals.base)}</span>
          <span>{t('characterStats.column.added')}: {formatNumber(totals.added)}</span>
          <span>{t('characterStats.column.increased')}: {formatPercent(totals.increased)}</span>
        </div>

        <div className="mt-4 border-t border-slate-800 pt-3">
          <h3 className="text-sm font-semibold text-slate-100">{t('characterStats.bonuses.title')}</h3>
          {sources.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t('characterStats.bonuses.empty')}</p>
          ) : (
            <div className="mt-2 grid gap-1 text-sm">
              {sources.map((source) => (
                <div className="flex items-baseline justify-between gap-3 text-slate-200" key={sourceKey(source)}>
                  <span>{sourceLabel(source, t)}</span>
                  <span className="text-cyan-100">
                    {formatBonusPair(source.added, source.increased)}
                    {source.kind === 'buff' && (
                      <span className="ml-2 text-xs text-slate-400">
                        ({t('characterStats.bonuses.remaining', { seconds: String(Math.max(0, Math.ceil((source.expiresAt - now) / 1000))) })})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
