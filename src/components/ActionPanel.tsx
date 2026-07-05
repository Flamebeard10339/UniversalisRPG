import { useState } from 'react';
import type { ContentBundle, GameAction, UniversePlayState } from '../game/types';
import { entityTitleKey } from '../game/contentIds';
import { getActionDps, getActionDurationMs, getEnemyAttackDps, isContinuousAction } from '../game/adversarial';
import type { Translator } from '../game/i18n';
import { useNow } from '../hooks/useNow';
import { canStartAction, isActionVisible } from '../game/conditions';
import { isPureTravelAction } from '../game/travel';
import { getActionDescriptionText, getActionTitleText } from '../game/actionLocalization';

type ActionPanelProps = {
  bundle: ContentBundle;
  debugEnabled: boolean;
  playState: UniversePlayState;
  onStartAction: (action: GameAction) => void;
  showTravelActions: boolean;
  t: Translator;
};

export const ActionPanel = ({ bundle, debugEnabled, playState, onStartAction, showTravelActions, t }: ActionPanelProps) => {
  const [expandedEntities, setExpandedEntities] = useState<Record<string, boolean>>({});
  const isTravelling = Boolean(playState.activeTravel);
  const actionContext = {
    manifest: bundle.manifest,
    actions: bundle.actions,
    skills: bundle.skills,
    stats: bundle.stats,
    locations: bundle.locations,
    entities: bundle.entities,
    items: bundle.items,
    flags: bundle.flags,
    resourceDefinitions: bundle.resourceDefinitions,
    effects: bundle.effects,
    interactionTypes: bundle.interactionTypes,
    enemies: bundle.enemies,
    dropTables: bundle.dropTables,
  };
  const currentLocation = bundle.locations.find((location) => location.id === playState.currentLocationId);
  const entities = (currentLocation?.entities ?? [])
    .map((entityId) => (bundle.entities ?? []).find((entity) => entity.id === entityId))
    .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity));
  const entityActionIds = new Set(entities.flatMap((entity) => entity.actionIds ?? []));
  const normalActions = bundle.actions.filter((action) =>
    action.locationId === playState.currentLocationId
    && !entityActionIds.has(action.id)
    && (showTravelActions || !isPureTravelAction(action))
    && isActionVisible(playState, action, actionContext));
  const entityActions = (actionIds: string[] = []) => actionIds
    .map((actionId) => bundle.actions.find((action) => action.id === actionId))
    .filter((action): action is GameAction => Boolean(action))
    .filter((action) => isActionVisible(playState, action, actionContext));
  const actions = [...normalActions, ...entities.flatMap((entity) => entityActions(entity.actionIds))];
  const activeAction = actions.find((action) => action.id === playState.activeAction?.actionId);
  const activeActionIsContinuous = Boolean(activeAction && isContinuousAction(activeAction, actionContext));
  const now = useNow(Boolean(playState.activeAction) && !activeActionIsContinuous, 16);
  const getActionProgress = (action: GameAction) => {
    const progress = playState.actionProgress[action.id];
    const elapsedMs = (progress?.elapsedMs ?? 0) + (progress?.runningSince ? Math.max(0, now - progress.runningSince) : 0);
    return Math.min(100, Math.max(0, (elapsedMs / getActionDurationMs(playState, action, actionContext)) * 100));
  };
  const renderActionButton = (action: GameAction) => {
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
        <span className="relative block text-sm font-semibold text-slate-100">{getActionTitleText(action, bundle, t)}</span>
        <span className="relative mt-1 block text-xs text-slate-400">{getActionDescriptionText(action, bundle, t)}</span>
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
  };

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{t('actionPanel.title')}</h2>
        <p className="text-sm text-slate-400">
          {isTravelling
            ? t('actionPanel.travelling')
            : activeAction
              ? t('actionPanel.working', { action: getActionTitleText(activeAction, bundle, t) })
              : t('actionPanel.choose')}
        </p>
      </div>

      <div className="grid gap-2">
        {normalActions.map(renderActionButton)}
        {entities.map((entity) => {
          const expanded = Boolean(expandedEntities[entity.id]);
          const availableActions = entityActions(entity.actionIds);
          return (
            <div className="grid gap-2 rounded border border-slate-700 bg-slate-950 p-2" key={entity.id}>
              <button
                aria-expanded={expanded}
                className="flex min-w-0 items-center gap-3 rounded px-2 py-2 text-left transition hover:bg-slate-900"
                onClick={() => setExpandedEntities((current) => ({ ...current, [entity.id]: !current[entity.id] }))}
                type="button"
              >
                <span className="w-4 shrink-0 text-cyan-200">{expanded ? 'v' : '>'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{t(entityTitleKey(entity.id))}</span>
                </span>
              </button>
              {expanded && (
                <div className="grid gap-2 pl-4">
                  {availableActions.length > 0
                    ? availableActions.map(renderActionButton)
                    : <p className="px-2 py-1 text-sm text-slate-500">{t('actionPanel.noEntityActions')}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
