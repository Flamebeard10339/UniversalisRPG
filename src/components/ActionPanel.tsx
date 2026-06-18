import type { ContentBundle, GameAction, UniversePlayState } from '../game/types';
import { actionDescriptionKey, actionTitleKey } from '../game/contentIds';
import { getActionDps, getActionDurationMs, getEnemy } from '../game/adversarial';
import type { Translator } from '../game/i18n';
import { useNow } from '../hooks/useNow';

type ActionPanelProps = {
  bundle: ContentBundle;
  debugEnabled: boolean;
  onSetLooping: (enabled: boolean) => void;
  playState: UniversePlayState;
  onStartAction: (action: GameAction) => void;
  t: Translator;
};

export const ActionPanel = ({ bundle, debugEnabled, onSetLooping, playState, onStartAction, t }: ActionPanelProps) => {
  const actions = bundle.actions.filter((action) => action.locationId === playState.currentLocationId);
  const activeAction = actions.find((action) => action.id === playState.activeAction?.actionId);
  const isTravelling = Boolean(playState.activeTravel);
  const now = useNow(Boolean(playState.activeAction), 16);
  const actionContext = {
    actions: bundle.actions,
    skills: bundle.skills,
    interactionTypes: bundle.interactionTypes,
    enemies: bundle.enemies,
  };
  const getActionProgress = (action: GameAction) => {
    const progress = playState.actionProgress[action.id];
    const elapsedMs = (progress?.elapsedMs ?? 0) + (progress?.runningSince ? Math.max(0, now - progress.runningSince) : 0);
    return Math.min(100, Math.max(0, (elapsedMs / getActionDurationMs(playState, action, actionContext)) * 100));
  };
  const getEnemyAttackProgress = () => {
    const active = playState.activeAction;

    if (!active?.enemyAttackStartedAt || !active.enemyAttackCompletesAt) {
      return null;
    }

    const duration = active.enemyAttackCompletesAt - active.enemyAttackStartedAt;
    return Math.min(100, Math.max(0, ((now - active.enemyAttackStartedAt) / duration) * 100));
  };

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{t('actionPanel.title')}</h2>
        <p className="text-sm text-slate-400">
          {isTravelling
            ? t('actionPanel.travelling')
            : activeAction
              ? t('actionPanel.working', { action: t(activeAction.titleKey ?? actionTitleKey(activeAction.id)) })
              : t('actionPanel.choose')}
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950 px-3 py-2">
        <span className="text-sm text-slate-300">{t('actionPanel.looping')}</span>
        <input
          checked={playState.actionLoopingEnabled}
          className="h-5 w-5"
          disabled={isTravelling}
          onChange={(event) => onSetLooping(event.target.checked)}
          type="checkbox"
        />
      </label>

      <div className="grid gap-2">
        {actions.map((action) => {
          const active = playState.activeAction?.actionId === action.id;
          const dps = debugEnabled ? getActionDps(playState, action, actionContext) : null;
          const enemy = getEnemy(action, actionContext);
          const targetHealth = active ? playState.activeAction?.targetHealth : playState.actionProgress[action.id]?.targetHealth;
          const enemyAttackProgress = active ? getEnemyAttackProgress() : null;

          return (
            <button
              className="relative overflow-hidden rounded border border-slate-700 bg-slate-900 p-3 text-left transition hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isTravelling}
              key={action.id}
              onClick={() => onStartAction(action)}
              type="button"
            >
              {(active || getActionProgress(action) > 0) && (
                <span
                  className={`absolute inset-y-0 left-0 ${active ? 'bg-cyan-400/25' : 'bg-slate-700/60'}`}
                  style={{ width: `${getActionProgress(action)}%` }}
                />
              )}
              <span className="relative block text-sm font-semibold text-slate-100">{t(action.titleKey ?? actionTitleKey(action.id))}</span>
              <span className="relative mt-1 block text-xs text-slate-400">{t(action.descriptionKey ?? actionDescriptionKey(action.id))}</span>
              <span className="relative mt-2 block text-xs text-cyan-200">{action.durationSeconds}s</span>
              {enemy && (
                <span className="relative mt-1 block text-xs text-rose-200">
                  {t('actionPanel.enemyHealth', { current: Math.ceil(targetHealth ?? enemy.health), max: enemy.health })}
                </span>
              )}
              {enemyAttackProgress !== null && (
                <span className="relative mt-2 block h-1 overflow-hidden rounded bg-rose-950">
                  <span className="block h-full bg-rose-400" style={{ width: `${enemyAttackProgress}%` }} />
                </span>
              )}
              {debugEnabled && dps !== null && (
                <span className="relative mt-1 block text-xs text-amber-200">{t('actionPanel.debugDps', { dps: dps.toFixed(2) })}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};
