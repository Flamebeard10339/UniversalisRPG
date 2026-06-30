import type { UniverseManifest, UniverseUiSettings } from './types';

export const DEFAULT_FLOATING_TEXT_DURATION_SECONDS = 2;
export const DEFAULT_LOOP_ACTIONS_BY_DEFAULT = true;

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
});

export const resolveManifestUiSettings = (
  manifest?: Pick<UniverseManifest, 'ui'>,
) => resolveUniverseUiSettings(manifest?.ui);
