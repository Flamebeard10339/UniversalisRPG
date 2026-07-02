import type { DisplayColorPalette, DisplayProfileDefinition, UniverseManifest } from './types';

export type DisplayScheme = 'light' | 'dark';
export type FullDisplayColorPalette = Required<DisplayColorPalette>;

export const displayColorKeys = [
  'background',
  'surface',
  'surfaceRaised',
  'panel',
  'border',
  'text',
  'textMuted',
  'textSubtle',
  'accent',
  'accentStrong',
  'accentText',
  'danger',
  'dangerSurface',
  'dangerText',
  'success',
  'warning',
] as const satisfies readonly (keyof DisplayColorPalette)[];

export const lightDisplayProfile: DisplayProfileDefinition & { colors: FullDisplayColorPalette } = {
  id: 'light',
  titleKey: 'displayProfile.light.title',
  colors: {
    background: '#f5f7fb',
    surface: '#ffffff',
    surfaceRaised: '#eef3f8',
    panel: '#e7edf5',
    border: '#cbd5e1',
    text: '#142033',
    textMuted: '#475569',
    textSubtle: '#64748b',
    accent: '#0f9bb3',
    accentStrong: '#0e7490',
    accentText: '#ffffff',
    danger: '#dc2626',
    dangerSurface: '#fff1f2',
    dangerText: '#9f1239',
    success: '#059669',
    warning: '#d97706',
  },
};

export const darkDisplayProfile: DisplayProfileDefinition & { colors: FullDisplayColorPalette } = {
  id: 'dark',
  titleKey: 'displayProfile.dark.title',
  colors: {
    background: '#0b1020',
    surface: '#111827',
    surfaceRaised: '#0f172a',
    panel: '#1f2937',
    border: '#334155',
    text: '#e5e7eb',
    textMuted: '#cbd5e1',
    textSubtle: '#94a3b8',
    accent: '#22d3ee',
    accentStrong: '#67e8f9',
    accentText: '#082f49',
    danger: '#fb7185',
    dangerSurface: '#4c0519',
    dangerText: '#ffe4e6',
    success: '#34d399',
    warning: '#fbbf24',
  },
};

export const defaultDisplayProfile = darkDisplayProfile;

export const createCustomDisplayProfile = (): DisplayProfileDefinition => ({
  id: 'custom',
  colors: { ...darkDisplayProfile.colors },
});

export const resolveDisplayScheme = (preference: 'system' | DisplayScheme): DisplayScheme => {
  if (preference !== 'system') return preference;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export const profileTitleKey = (profileId: string) => `displayProfile.${profileId}.title`;

export const findDisplayProfile = (
  manifest: UniverseManifest,
  profileId: string,
  customProfile: DisplayProfileDefinition,
): DisplayProfileDefinition => {
  if (profileId === 'custom') return customProfile;
  if (profileId === lightDisplayProfile.id) return lightDisplayProfile;
  if (profileId === darkDisplayProfile.id || profileId === 'default') return darkDisplayProfile;
  return manifest.displayProfiles?.find((profile) => profile.id === profileId) ?? darkDisplayProfile;
};

export const resolveDisplayPalette = (
  manifest: UniverseManifest,
  profileId: string,
  customProfile: DisplayProfileDefinition,
  scheme: DisplayScheme = 'dark',
): FullDisplayColorPalette => {
  const profile = findDisplayProfile(manifest, profileId, customProfile);
  const fallback = profileId === 'light' ? lightDisplayProfile.colors : darkDisplayProfile.colors;
  const profilePalette = profile.colors ?? profile[scheme] ?? profile.dark ?? profile.light ?? {};
  return {
    ...fallback,
    ...profilePalette,
  };
};

export const isLightPalette = (palette: FullDisplayColorPalette) => {
  const hex = palette.background.replace('#', '');
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150;
};

export const applyDisplayPalette = (palette: FullDisplayColorPalette) => {
  const root = document.documentElement;
  for (const key of displayColorKeys) {
    const cssName = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    root.style.setProperty(`--color-${cssName}`, palette[key]);
  }
};
