import { useMemo, useState } from 'react';
import { calculateEnemyDiagnostics, DIAGNOSTIC_RATIOS } from '../../game/combatBalance';
import type { Translator } from '../../game/i18n';
import type { EnemyDefinition } from '../../game/types';

type EnemyDiagnosticsProps = {
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

const dangerClass = (value: number) => {
  if (!Number.isFinite(value) || value > 5) {
    return 'bg-emerald-950/60 text-emerald-200';
  }
  if (value >= 2) {
    return 'bg-cyan-950/60 text-cyan-200';
  }
  if (value >= 1) {
    return 'bg-amber-950/60 text-amber-200';
  }
  return 'bg-rose-950/60 text-rose-200';
};

export const EnemyDiagnostics = ({ enemy, t }: EnemyDiagnosticsProps) => {
  const [playerHealth, setPlayerHealth] = useState(100);
  const [playerRegeneration, setPlayerRegeneration] = useState(0);
  const [playerActionSeconds, setPlayerActionSeconds] = useState(1);
  const diagnostics = useMemo(() => calculateEnemyDiagnostics(enemy, {
    playerHealth,
    playerRegenerationPerMinute: playerRegeneration,
    playerActionSeconds,
  }), [enemy, playerActionSeconds, playerHealth, playerRegeneration]);

  return (
    <section className="grid min-w-0 gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-slate-400">
          <span>{t('contribution.enemyDiagnostics.playerHealth')}</span>
          <input className="rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100" min="1" onChange={(event) => setPlayerHealth(Number(event.target.value))} type="number" value={playerHealth} />
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span>{t('contribution.enemyDiagnostics.playerRegen')}</span>
          <input className="rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100" min="0" onChange={(event) => setPlayerRegeneration(Number(event.target.value))} step="0.1" type="number" value={playerRegeneration} />
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span>{t('contribution.enemyDiagnostics.playerActionTime')}</span>
          <input className="rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100" min="0.01" onChange={(event) => setPlayerActionSeconds(Number(event.target.value))} step="0.1" type="number" value={playerActionSeconds} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-slate-800 bg-slate-950 p-2">
          <span className="block text-slate-500">{t('contribution.enemyDiagnostics.canonicalHealth')}</span>
          <strong className="text-slate-100">{diagnostics.canonicalHealth.toFixed(1)}</strong>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950 p-2">
          <span className="block text-slate-500">{t('contribution.enemyDiagnostics.parityActions')}</span>
          <strong className="text-slate-100">{formatValue(diagnostics.parityActionsToKill, t)}</strong>
        </div>
      </div>

      <section className="grid gap-2">
        <h4 className="text-sm font-semibold text-slate-100">{t('contribution.enemyDiagnostics.actionsToKill')}</h4>
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-80 text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-1 text-left">{t('contribution.enemyDiagnostics.attackRatio')}</th>
                <th className="px-2 py-1 text-right">{t('contribution.enemyDiagnostics.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.actionsToKill.map((row) => (
                <tr className="border-t border-slate-800" key={row.ratio}>
                  <td className="px-2 py-1 text-slate-300">{row.ratio.toFixed(1)}x</td>
                  <td className="px-2 py-1 text-right text-slate-100">{formatValue(row.actions, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-2">
        <h4 className="text-sm font-semibold text-slate-100">{t('contribution.enemyDiagnostics.fightsPerDeath')}</h4>
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[32rem] border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr className="text-slate-500">
                <th>{t('contribution.enemyDiagnostics.attackDefense')}</th>
                {DIAGNOSTIC_RATIOS.map((ratio) => <th key={ratio}>{ratio.toFixed(1)}x</th>)}
              </tr>
            </thead>
            <tbody>
              {DIAGNOSTIC_RATIOS.map((attackRatio) => (
                <tr key={attackRatio}>
                  <th className="text-slate-500">{attackRatio.toFixed(1)}x</th>
                  {DIAGNOSTIC_RATIOS.map((defenseRatio) => {
                    const value = diagnostics.fightsPerDeath.find((cell) => cell.attackRatio === attackRatio && cell.defenseRatio === defenseRatio)?.value ?? 0;
                    return <td className={`rounded px-2 py-2 ${dangerClass(value)}`} key={defenseRatio}>{formatValue(value, t)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};
