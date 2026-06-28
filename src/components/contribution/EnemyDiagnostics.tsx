import { useMemo, useState } from 'react';
import {
  calculateProfileEnemyDiagnostic,
  DEBUG_PLAYER_PROFILES,
  getProfileStatSummary,
  profileTitle,
} from '../../game/playerProfiles';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, EnemyDefinition } from '../../game/types';

type EnemyDiagnosticsProps = {
  bundle: ContentBundle;
  enemy: EnemyDefinition;
  t: Translator;
};

const formatValue = (value: number, t: Translator) => {
  if (!Number.isFinite(value)) {
    return t('contribution.enemyDiagnostics.infinity');
  }
  if (value > 100) {
    return t('contribution.enemyDiagnostics.overHundred');
  }
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
};

const metricClass = (value: number) => {
  if (!Number.isFinite(value) || value > 5) return 'text-emerald-200';
  if (value >= 2) return 'text-cyan-200';
  if (value >= 1) return 'text-amber-200';
  return 'text-rose-200';
};

export const EnemyDiagnostics = ({ bundle, enemy, t }: EnemyDiagnosticsProps) => {
  const [selectedProfileId, setSelectedProfileId] = useState(DEBUG_PLAYER_PROFILES[0]?.id ?? '');
  const diagnostics = useMemo(() =>
    DEBUG_PLAYER_PROFILES.map((profile) => calculateProfileEnemyDiagnostic(bundle, enemy, profile)),
  [bundle, enemy]);
  const selectedProfile = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === selectedProfileId) ?? DEBUG_PLAYER_PROFILES[0];

  return (
    <section className="grid min-w-0 gap-3">
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[48rem] text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-1 text-left">{t('contribution.enemyDiagnostics.profile')}</th>
              <th className="px-2 py-1 text-right">{t('contribution.enemyDiagnostics.actionsWorst')}</th>
              <th className="px-2 py-1 text-right">{t('contribution.enemyDiagnostics.actionsAverage')}</th>
              <th className="px-2 py-1 text-right">{t('contribution.enemyDiagnostics.actionsBest')}</th>
              <th className="px-2 py-1 text-right">{t('contribution.enemyDiagnostics.fightsWorst')}</th>
              <th className="px-2 py-1 text-right">{t('contribution.enemyDiagnostics.fightsAverage')}</th>
              <th className="px-2 py-1 text-right">{t('contribution.enemyDiagnostics.fightsBest')}</th>
            </tr>
          </thead>
          <tbody>
            {diagnostics.map((row) => {
              const selected = row.profile.id === selectedProfile?.id;
              return (
                <tr className={`border-t border-slate-800 ${selected ? 'bg-slate-800/70' : ''}`} key={row.profile.id}>
                  <td className="px-2 py-1 text-left">
                    <button className="text-cyan-200 underline-offset-2 hover:underline" onClick={() => setSelectedProfileId(row.profile.id)} type="button">
                      {profileTitle(row.profile, t)}
                    </button>
                  </td>
                  <td className={`px-2 py-1 text-right ${metricClass(row.actionsToKill.worst)}`}>{formatValue(row.actionsToKill.worst, t)}</td>
                  <td className={`px-2 py-1 text-right ${metricClass(row.actionsToKill.average)}`}>{formatValue(row.actionsToKill.average, t)}</td>
                  <td className={`px-2 py-1 text-right ${metricClass(row.actionsToKill.best)}`}>{formatValue(row.actionsToKill.best, t)}</td>
                  <td className={`px-2 py-1 text-right ${metricClass(row.fightsPerDeath.worst)}`}>{formatValue(row.fightsPerDeath.worst, t)}</td>
                  <td className={`px-2 py-1 text-right ${metricClass(row.fightsPerDeath.average)}`}>{formatValue(row.fightsPerDeath.average, t)}</td>
                  <td className={`px-2 py-1 text-right ${metricClass(row.fightsPerDeath.best)}`}>{formatValue(row.fightsPerDeath.best, t)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedProfile && (
        <p className="rounded bg-slate-950 p-3 text-sm text-slate-300">
          {getProfileStatSummary(bundle, selectedProfile, t)}
        </p>
      )}
    </section>
  );
};
