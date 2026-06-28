import type { UniverseManifest, UniverseUiSettings } from './types';

export const DEFAULT_FLOATING_TEXT_DURATION_SECONDS = 2;

export const resolveUniverseUiSettings = (
  settings?: UniverseUiSettings,
): Required<UniverseUiSettings> => ({
  floatingTextDurationSeconds:
    typeof settings?.floatingTextDurationSeconds === 'number' &&
    Number.isFinite(settings.floatingTextDurationSeconds) &&
    settings.floatingTextDurationSeconds > 0
      ? settings.floatingTextDurationSeconds
      : DEFAULT_FLOATING_TEXT_DURATION_SECONDS,
});

export const resolveManifestUiSettings = (
  manifest?: Pick<UniverseManifest, 'ui'>,
) => resolveUniverseUiSettings(manifest?.ui);
