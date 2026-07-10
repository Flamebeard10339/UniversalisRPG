import { useEffect, useState } from 'react';
import type { ContentBundle, GameAction, UniversePlayState } from '../game/types';
import { entityTitleKey, itemTitleKey } from '../game/contentIds';
import { getActionDps, getActionDurationMs, getEnemyAttackDps, isContinuousAction, isInstantAction } from '../game/adversarial';
import type { Translator } from '../game/i18n';
import { useNow } from '../hooks/useNow';
import { canStartAction, isActionVisible } from '../game/conditions';
import { isPureTravelAction } from '../game/travel';
import { getActionDescriptionText, getActionTitleText } from '../game/actionLocalization';
import { availableRecipesForStation, resolveStationAction } from '../game/recipes';
import { effectiveCountdownNow, resolveManifestUiSettings } from '../game/universeSettings';

type ActionPanelProps = {
  bundle: ContentBundle;
  debugEnabled: boolean;
  playState: UniversePlayState;
  onPickUpGroundItem: (groundItemId: string) => void;
  onStartAction: (action: GameAction, recipeId?: string) => void;
  showTravelActions: boolean;
  t: Translator;
};

export const ActionPanel = ({ bundle, debugEnabled, playState, onPickUpGroundItem, onStartAction, showTravelActions, t }: ActionPanelProps) => {
  const groundItems = playState.groundItems.filter((stack) => stack.locationId === playState.currentLocationId);
  const [expandedEntities, setExpandedEntities] = useState<Record<string, boolean>>({});
  const [instantActionPulse, setInstantActionPulse] = useState<Record<string, number>>({});
  const isTravelling = Boolean(playState.activeTravel);
  const uiSettings = resolveManifestUiSettings(bundle.manifest);
  // When timeFlowsContinuously is off, a ground item's remaining time only
  // advances while the player is doing something (pauseTimersWhileIdle in
  // timers.ts) — a fast/continuous tick here would show a countdown running
  // while genuinely idle, contradicting that pause. 1s granularity is
  // plenty for a "245s remaining" label (unlike the 16ms `now` below, which
  // exists for smooth action-progress bars).
  const groundItemNow = useNow(Boolean(playState.activeAction) || (uiSettings.timeFlowsContinuously && groundItems.length > 0), 1000);
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
    recipes: bundle.recipes,
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
  const activeRecipeItemTitle = (() => {
    if (!activeAction?.stationId || !playState.activeAction?.recipeId) return null;
    const recipe = (bundle.recipes ?? []).find((candidate) =>
      candidate.id === playState.activeAction?.recipeId && candidate.stationId === activeAction.stationId);
    const itemId = recipe?.inputs[0]?.itemId;
    return itemId ? t(itemTitleKey(itemId), itemId) : null;
  })();
  const activeActionIsContinuous = Boolean(activeAction && isContinuousAction(activeAction, actionContext));
  const now = useNow((Boolean(playState.activeAction) && !activeActionIsContinuous) || Object.keys(instantActionPulse).length > 0, 16);
  useEffect(() => {
    const nextPulse = Object.fromEntries(
      Object.entries(instantActionPulse).filter(([, expiresAt]) => expiresAt > now),
    );

    if (Object.keys(nextPulse).length !== Object.keys(instantActionPulse).length) {
      setInstantActionPulse(nextPulse);
    }
  }, [instantActionPulse, now]);
  const getActionProgress = (action: GameAction) => {
    const progress = playState.actionProgress[action.id];
    const elapsedMs = (progress?.elapsedMs ?? 0) + (progress?.runningSince ? Math.max(0, now - progress.runningSince) : 0);
    const durationMs = getActionDurationMs(playState, action, actionContext);
    if (durationMs <= 0) {
      return 100;
    }
    return Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100));
  };
  const triggerInstantActionPulse = (actionId: string) => {
    const expiresAt = Date.now() + 650;
    setInstantActionPulse((current) => ({ ...current, [actionId]: expiresAt }));
    window.setTimeout(() => {
      setInstantActionPulse((current) => (current[actionId] === expiresAt
        ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== actionId))
        : current));
    }, 650);
  };
  const renderActionButton = (action: GameAction, options: { entityAction?: boolean; recipeId?: string; titleOverride?: string } = {}) => {
    const isStationRecipe = action.stationId !== undefined;
    const recipeMatches = !isStationRecipe || playState.activeAction?.recipeId === options.recipeId;
    const active = playState.activeAction?.actionId === action.id && recipeMatches;
    const progressMatches = !isStationRecipe || playState.actionProgress[action.id]?.recipeId === options.recipeId;
    const playerDps = debugEnabled ? getActionDps(playState, action, actionContext) : null;
    const entityDps = debugEnabled ? getEnemyAttackDps(playState, action, actionContext) : null;
    const actionProgress = progressMatches ? getActionProgress(action) : 0;
    const requirementsMet = canStartAction(playState, action, actionContext);
    const completions = playState.actionCompletions[action.id] ?? 0;
    const remaining = action.maxCompletions === undefined ? null : Math.max(0, action.maxCompletions - completions);
    const continuous = isContinuousAction(action, actionContext);
    const instant = isInstantAction(playState, action);
    const buttonKey = options.recipeId ? `${action.id}:${options.recipeId}` : action.id;
    const pulsing = Boolean(instantActionPulse[buttonKey] && instantActionPulse[buttonKey] > now);

    return (
      <button
        className="relative overflow-hidden rounded border border-slate-700 bg-slate-900 p-3 text-left transition hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
        data-action-id={buttonKey}
        data-requirements-met={requirementsMet}
        disabled={isTravelling || !requirementsMet}
        key={buttonKey}
        onClick={() => {
          if (instant) {
            triggerInstantActionPulse(buttonKey);
          }
          onStartAction(action, options.recipeId);
        }}
        type="button"
      >
        {pulsing && (
          <span aria-hidden="true" className="instant-action-pulse pointer-events-none absolute inset-0" />
        )}
        {active && continuous && (
          <span className="continuous-action-progress absolute inset-y-0 left-0 w-full opacity-70" />
        )}
        {!continuous && !instant && (active || actionProgress > 0) && (
          <span
            className={`absolute inset-y-0 left-0 ${active ? 'bg-cyan-400/25' : 'bg-slate-700/60'}`}
            style={{ width: `${actionProgress}%` }}
          />
        )}
        <span className="relative block text-sm font-semibold text-slate-100">{options.titleOverride ?? getActionTitleText(action, bundle, t, playState, actionContext)}</span>
        {!options.entityAction && (
          <span className="relative mt-1 block text-xs text-slate-400">{getActionDescriptionText(action, bundle, t)}</span>
        )}
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

  const renderAction = (action: GameAction, options: { entityAction?: boolean } = {}) => {
    if (!action.stationId) {
      return renderActionButton(action, options);
    }

    const recipes = availableRecipesForStation(playState, action.stationId, actionContext);
    if (recipes.length === 0) {
      return (
        <p className="px-2 py-1 text-sm text-slate-500" key={action.id}>{t('actionPanel.noRecipesAvailable')}</p>
      );
    }

    return recipes.map((recipe) => {
      const itemId = recipe.inputs[0]?.itemId;
      return renderActionButton(resolveStationAction(action, recipe.id, actionContext), {
        ...options,
        recipeId: recipe.id,
        titleOverride: itemId ? t(itemTitleKey(itemId), itemId) : undefined,
      });
    });
  };

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{t('actionPanel.title')}</h2>
        <p className="text-sm text-slate-400">
          {isTravelling
            ? t('actionPanel.travelling')
            : activeAction
              ? t('actionPanel.working', { action: activeRecipeItemTitle ?? getActionTitleText(activeAction, bundle, t, playState, actionContext) })
              : t('actionPanel.choose')}
        </p>
      </div>

      {groundItems.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-slate-100">{t('groundItems.title')}</h3>
          {groundItems.map((stack) => {
            const remainingSeconds = uiSettings.showGroundItemDuration
              ? Math.max(0, Math.ceil((stack.expiresAt - effectiveCountdownNow(playState, uiSettings, groundItemNow)) / 1000))
              : null;

            return (
              <button
                className="flex items-center justify-between gap-3 rounded border border-slate-700 bg-slate-950 p-3 text-left transition hover:border-cyan-500"
                data-ground-item-id={stack.id}
                key={stack.id}
                onClick={() => onPickUpGroundItem(stack.id)}
                type="button"
              >
                <span className="grid">
                  <span className="text-sm font-semibold text-slate-100">{t(itemTitleKey(stack.itemId), stack.itemId)} ({stack.amount})</span>
                  {remainingSeconds !== null && (
                    <span className="text-xs text-slate-500">{t('groundItems.remaining', { seconds: remainingSeconds })}</span>
                  )}
                </span>
                <span className="text-xs font-semibold text-cyan-200">{t('groundItems.pickUp')}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-2">
        {normalActions.map((action) => renderAction(action))}
        {entities.map((entity) => {
          const expanded = Boolean(expandedEntities[entity.id]);
          const availableActions = entityActions(entity.actionIds);
          // isActionVisible already hides every non-examine entity action
          // until the entity's own examine has completed once, so
          // availableActions only ever contains the examine action itself
          // pre-discovery — the header below only needs to know whether
          // that's still the case to decide what a click on it should do.
          const examineActionId = `entity.${entity.id}.examine`;
          const examineAction = availableActions.find((action) => action.id === examineActionId);
          const discovered = (playState.actionCompletions[examineActionId] ?? 0) > 0;
          const examining = playState.activeAction?.actionId === examineActionId;
          const examineProgress = examineAction ? getActionProgress(examineAction) : 0;
          const examineAvailable = examineAction ? canStartAction(playState, examineAction, actionContext) : false;

          return (
            <div className="grid gap-2 rounded border border-slate-700 bg-slate-950 p-2" key={entity.id}>
              <button
                aria-expanded={discovered ? expanded : undefined}
                className="relative flex min-w-0 items-center gap-3 overflow-hidden rounded px-2 py-2 text-left transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                data-entity-id={entity.id}
                disabled={isTravelling || (!discovered && !examineAvailable)}
                onClick={() => {
                  if (!discovered) {
                    if (examineAction) {
                      onStartAction(examineAction);
                      // Marked expanded now (not once discovery lands) so the
                      // action list simply appears the instant the examine
                      // finishes, instead of needing a second click.
                      setExpandedEntities((current) => ({ ...current, [entity.id]: true }));
                    }
                    return;
                  }
                  setExpandedEntities((current) => ({ ...current, [entity.id]: !current[entity.id] }));
                }}
                type="button"
              >
                {!discovered && examining && (
                  <span className="absolute inset-y-0 left-0 bg-cyan-400/25" style={{ width: `${examineProgress}%` }} />
                )}
                <span className="relative w-4 shrink-0 text-cyan-200">{discovered ? (expanded ? 'v' : '>') : '?'}</span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{t(entityTitleKey(entity.id))}</span>
                </span>
              </button>
              {discovered && expanded && (
                <div className="grid gap-2 pl-4">
                  {availableActions.length > 0
                    ? availableActions.map((action) => renderAction(action, { entityAction: true }))
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
