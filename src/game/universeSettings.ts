import type { UniverseManifest, UniverseUiSettings } from './types';

export const DEFAULT_FLOATING_TEXT_DURATION_SECONDS = 2;
export const DEFAULT_LOOP_ACTIONS_BY_DEFAULT = true;
export const DEFAULT_TRAVEL_PATH_MAX_SECONDS = 1000;
export const DEFAULT_TRAVEL_PATH_MAX_NODES = 100;
export const DEFAULT_CONNECTIVITY_MODE = 'sparse';
export const DEFAULT_DISTANCE_BETWEEN_ADJACENT_TILES = 1;

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
  connectivityMode: settings?.connectivityMode === 'highly-connected' ? 'highly-connected' : DEFAULT_CONNECTIVITY_MODE,
  distanceBetweenAdjacentTiles:
    typeof settings?.distanceBetweenAdjacentTiles === 'number' &&
    Number.isFinite(settings.distanceBetweenAdjacentTiles) &&
    settings.distanceBetweenAdjacentTiles > 0
      ? settings.distanceBetweenAdjacentTiles
      : DEFAULT_DISTANCE_BETWEEN_ADJACENT_TILES,
});

export const resolveManifestUiSettings = (
  manifest?: Pick<UniverseManifest, 'ui'>,
) => resolveUniverseUiSettings(manifest?.ui);
