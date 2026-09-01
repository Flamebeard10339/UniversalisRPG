import type { EngineKey } from '../content/locale';

export type SettingValue = boolean | number | string;

export interface SettingChoice {
  readonly value: SettingValue;
  readonly typed: string;
  readonly shown: EngineKey;
}

export interface Setting {
  readonly title: EngineKey;
  readonly note: EngineKey;
  readonly choices: readonly SettingChoice[];
  readonly standing: SettingValue;
}

const OFF_ON: readonly SettingChoice[] = [
  { value: false, typed: 'off', shown: 'engine.setting.off' },
  { value: true, typed: 'on', shown: 'engine.setting.on' },
];

export const REGION_SHAPES = ['blob', 'box'] as const;

export type RegionShape = (typeof REGION_SHAPES)[number];

const SHAPES: readonly SettingChoice[] = REGION_SHAPES.map((shape) => ({ value: shape, typed: shape, shown: `engine.setting.regions.${shape}` as EngineKey }));

export const SETTINGS = {
  hardcore: { title: 'engine.setting.hardcore', note: 'engine.setting.hardcore.note', choices: OFF_ON, standing: false },
  reveal: { title: 'engine.setting.reveal', note: 'engine.setting.reveal.note', choices: OFF_ON, standing: true },
  masking: { title: 'engine.setting.masking', note: 'engine.setting.masking.note', choices: OFF_ON, standing: true },
  regions: { title: 'engine.setting.regions', note: 'engine.setting.regions.note', choices: SHAPES, standing: 'blob' },
} as const satisfies Readonly<Record<string, Setting>>;

export type SettingName = keyof typeof SETTINGS;

export const SETTING_NAMES = Object.keys(SETTINGS) as SettingName[];

export const isSettingName = (name: string): name is SettingName => name in SETTINGS;

export const settingNamed = (name: SettingName): Setting => SETTINGS[name];

export type SettingSheet = Record<SettingName, SettingValue>;

export function standingSettings(): SettingSheet {
  const sheet = {} as SettingSheet;
  for (const name of SETTING_NAMES) sheet[name] = settingNamed(name).standing;
  return sheet;
}

const isValue = (held: unknown): boolean => typeof held === 'boolean' || typeof held === 'number' || typeof held === 'string';

export function isSettingSheet(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isValue);
}

export const settingStands = (sheet: SettingSheet, name: SettingName): SettingValue => sheet[name] ?? settingNamed(name).standing;

export const standingChoice = (name: SettingName, value: SettingValue): SettingChoice | undefined => settingNamed(name).choices.find((choice) => choice.value === value);

export const choiceWritten = (name: SettingName, typed: string): SettingChoice | undefined => settingNamed(name).choices.find((choice) => choice.typed === typed);

export const chosenSetting = (sheet: SettingSheet, name: SettingName, choice: SettingChoice): SettingSheet => ({ ...sheet, [name]: choice.value });

export const regionShape = (rows: readonly { name: string; standing: string }[]): RegionShape =>
  REGION_SHAPES.find((shape) => shape === rows.find((row) => row.name === 'regions')?.standing) ?? (settingNamed('regions').standing as RegionShape);
