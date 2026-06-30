import type { ContentBundle, GameAction, UniversePlayState } from '../game/types';
import { actionDescriptionKey, actionTitleKey } from '../game/contentIds';
import { getActionDps, getActionDurationMs, getEnemyAttackDps, isContinuousAction } from '../game/adversarial';
import type { Translator } from '../game/i18n';
import { useNow } from '../hooks/useNow';
import { canStartAction, isActionVisible } from '../game/conditions';

type ActionPanelProps = {
  bundle: ContentBundle;
  debugEnabled: boolean;
  playState: UniversePlayState;
  onStartAction: (action: GameAction) => void;
  t: Translator;
};

export const ActionPanel = ({ bundle, debugEnabled, playState, onStartAction, t }: ActionPanelProps) => {
  const isTravelling = Boolean(playState.activeTravel);
  const actionContext = {
    manifest: bundle.manifest,
    actions: bundle.actions,
    skills: bundle.skills,
    stats: bundle.stats,
    locations: bundle.locations,
    items: bundle.items,
    flags: bundle.flags,
    resourceDefinitions: bundle.resourceDefinitions,
    effects: bundle.effects,
    interactionTypes: bundle.interactionTypes,
    enemies: bundle.enemies,
  };
  const actions = bundle.actions.filter((action) =>
    action.locationId === playState.currentLocationId
    && isActionVisible(playState, action, actionContext));
  const activeAction = actions.find((action) => action.id === playState.activeAction?.actionId);
  const activeActionIsContinuous = Boolean(activeAction && isContinuousAction(activeAction, actionContext));
  const now = useNow(Boolean(playState.activeAction) && !activeActionIsContinuous, 16);
  const getActionProgress = (action: GameAction) => {
    const progress = playState.actionProgress[action.id];
    const elapsedMs = (progress?.elapsedMs ?? 0) + (progress?.runningSince ? Math.max(0, now - progress.runningSince) : 0);
    return Math.min(100, Math.max(0, (elapsedMs / getActionDurationMs(playState, action, actionContext)) * 100));
  };

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{t('actionPanel.title')}</h2>
        <p className="text-sm text-slate-400">
          {isTravelling
            ? t('actionPanel.travelling')
            : activeAction
              ? t('actionPanel.working', { action: t(actionTitleKey(activeAction.id)) })
              : t('actionPanel.choose')}
        </p>
      </div>

      <div className="grid gap-2">
        {actions.map((action) => {
          const active = playState.activeAction?.actionId === action.id;
          const playerDps = debugEnabled ? getActionDps(playState, action, actionContext) : null;
          const entityDps = debugEnabled ? getEnemyAttackDps(playState, action, actionContext) : null;
          const actionProgress = getActionProgress(action);
          const requirementsMet = canStartAction(playState, action, actionContext);
          const completions = playState.actionCompletions[action.id] ?? 0;
          const remaining = action.maxCompletions === undefined ? null : Math.max(0, action.maxCompletions - completions);
          const continuous = isContinuousAction(action, actionContext);

          return (
            <button
              className="relative overflow-hidden rounded border border-slate-700 bg-slate-900 p-3 text-left transition hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isTravelling || !requirementsMet}
              key={action.id}
              onClick={() => onStartAction(action)}
              type="button"
            >
              {active && continuous && (
                <span className="continuous-action-progress absolute inset-y-0 left-0 w-full opacity-70" />
              )}
              {!continuous && (active || actionProgress > 0) && (
                <span
                  className={`absolute inset-y-0 left-0 ${active ? 'bg-cyan-400/25' : 'bg-slate-700/60'}`}
                  style={{ width: `${actionProgress}%` }}
                />
              )}
              <span className="relative block text-sm font-semibold text-slate-100">{t(actionTitleKey(action.id))}</span>
              <span className="relative mt-1 block text-xs text-slate-400">{t(actionDescriptionKey(action.id))}</span>
              <span className="relative mt-2 block text-xs text-cyan-200">
                {continuous ? t('actionPanel.continuous') : `${action.durationSeconds}s`}
              </span>
              {remaining !== null && (action.maxCompletions ?? 0) > 1 && (
                <span className="relative mt-1 block text-xs text-slate-300">
                  {t('actionPanel.remaining', { remaining, total: action.maxCompletions ?? 0 })}
                </span>
              )}
              {debugEnabled && (playerDps !== null || entityDps !== null) && (
                <span className="relative mt-1 block text-xs text-amber-200">
                  {t('actionPanel.debugDps', {
                    playerDps: playerDps === null ? '-' : playerDps.toFixed(2),
                    entityDps: entityDps === null ? '-' : entityDps.toFixed(2),
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};
