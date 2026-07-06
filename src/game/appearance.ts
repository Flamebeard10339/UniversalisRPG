export type AppearancePreset = {
  id: string;
  labelKey: string;
};

export const DEFAULT_APPEARANCE_PRESET_ID = 'default';

export const appearancePresets: AppearancePreset[] = [
  { id: 'default', labelKey: 'appearance.preset.default' },
  { id: 'weathered', labelKey: 'appearance.preset.weathered' },
  { id: 'bright-eyed', labelKey: 'appearance.preset.bright-eyed' },
  { id: 'scarred', labelKey: 'appearance.preset.scarred' },
];
