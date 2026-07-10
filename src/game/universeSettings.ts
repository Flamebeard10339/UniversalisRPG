import type { UniverseManifest, UniversePlayState, UniverseUiSettings } from './types';

export const DEFAULT_FLOATING_TEXT_DURATION_SECONDS = 2;
export const DEFAULT_LOOP_ACTIONS_BY_DEFAULT = true;
export const DEFAULT_TRAVEL_PATH_MAX_SECONDS = 1000;
export const DEFAULT_TRAVEL_PATH_MAX_NODES = 100;
export const DEFAULT_DISTANCE_BETWEEN_ADJACENT_TILES = 1;
export const DEFAULT_TIME_FLOWS_CONTINUOUSLY = true;
export const DEFAULT_SHOW_GROUND_ITEM_DURATION = true;
export const DEFAULT_EFFECT_XP_BATCH_SECONDS = 10;

export const resolveUniverseUiSettings = (
  settings?: UniverseUiSettings,
): Required<UniverseUiSettings> => ({
  floatingTextDurationSeconds:
    typeof settings?.floatingTextDurationSeconds === 'number' &&
    Number.isFinite(settings.floatingTextDurationSeconds) &&
    settings.floatingTextDurationSeconds > 0
      ? settings.floatingTextDurationSeconds
      : DEFAULT_FLOATING_TEXT_DURATION_SECONDS,
  loopActionsByDefault:
    typeof settings?.loopActionsByDefault === 'boolean'
      ? settings.loopActionsByDefault
      : DEFAULT_LOOP_ACTIONS_BY_DEFAULT,
  travelPathMaxSeconds:
    typeof settings?.travelPathMaxSeconds === 'number' &&
    Number.isFinite(settings.travelPathMaxSeconds) &&
    settings.travelPathMaxSeconds > 0
      ? settings.travelPathMaxSeconds
      : DEFAULT_TRAVEL_PATH_MAX_SECONDS,
  travelPathMaxNodes:
    typeof settings?.travelPathMaxNodes === 'number' &&
    Number.isFinite(settings.travelPathMaxNodes) &&
    settings.travelPathMaxNodes > 0
      ? Math.floor(settings.travelPathMaxNodes)
      : DEFAULT_TRAVEL_PATH_MAX_NODES,
  distanceBetweenAdjacentTiles:
    typeof settings?.distanceBetweenAdjacentTiles === 'number' &&
    Number.isFinite(settings.distanceBetweenAdjacentTiles) &&
    settings.distanceBetweenAdjacentTiles > 0
      ? settings.distanceBetweenAdjacentTiles
      : DEFAULT_DISTANCE_BETWEEN_ADJACENT_TILES,
  timeFlowsContinuously:
    typeof settings?.timeFlowsContinuously === 'boolean'
      ? settings.timeFlowsContinuously
      : DEFAULT_TIME_FLOWS_CONTINUOUSLY,
  showGroundItemDuration:
    typeof settings?.showGroundItemDuration === 'boolean'
      ? settings.showGroundItemDuration
      : DEFAULT_SHOW_GROUND_ITEM_DURATION,
  effectXpBatchSeconds:
    typeof settings?.effectXpBatchSeconds === 'number' &&
    Number.isFinite(settings.effectXpBatchSeconds) &&
    settings.effectXpBatchSeconds > 0
      ? settings.effectXpBatchSeconds
      : DEFAULT_EFFECT_XP_BATCH_SECONDS,
});

export const resolveManifestUiSettings = (
  manifest?: Pick<UniverseManifest, 'ui'>,
) => resolveUniverseUiSettings(manifest?.ui);

// resolveIdleTimers (and its pauseTimersWhileIdle) only ever run when
// something schedules them — an activeAction/activeTravel/resource
// boundary — so merely re-rendering (switching tabs, anything else that
// doesn't touch playState) never calls it. A countdown display that reads
// `expiresAt - Date.now()` directly would keep visibly ticking down purely
// from re-rendering, even though the underlying state is correctly frozen
// — the display needs its own "what time is it, for pause purposes" that
// matches: while paused (timeFlowsContinuously off and no activeAction),
// freeze at the state's own lastTickAt instead of the live clock, so the
// number only moves again once something real actually updates playState.
export const effectiveCountdownNow = (
  playState: Pick<UniversePlayState, 'activeAction' | 'lastTickAt'>,
  settings: Pick<Required<UniverseUiSettings>, 'timeFlowsContinuously'>,
  liveNow: number,
): number => (!settings.timeFlowsContinuously && !playState.activeAction ? (playState.lastTickAt ?? liveNow) : liveNow);
