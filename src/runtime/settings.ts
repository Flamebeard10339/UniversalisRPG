import type { EngineKey } from '../content/locale';

export type SettingValue = boolean | number | string;

// What the player may set one to: the value the run is played by, the word they write to reach it,
// and the words a page draws it with.
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

// Every preference a run is played by. What `/settings` lists, what it accepts, what the settings
// page draws, what the save carries and what a `setting.<name>` reference answers are all read off
// here, so one added below is one line and nothing else is edited. The words are the locale's, named
// rather than written out, the way the player's own sheet names the question that filled it.
export const SETTINGS = {
  hardcore: { title: 'engine.setting.hardcore', note: 'engine.setting.hardcore.note', choices: OFF_ON, standing: false },
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
  const held = value as Record<string, unknown>;
  return SETTING_NAMES.every((name) => isValue(held[name]));
}

export const settingStands = (sheet: SettingSheet, name: SettingName): SettingValue => sheet[name] ?? settingNamed(name).standing;

export const standingChoice = (name: SettingName, value: SettingValue): SettingChoice | undefined => settingNamed(name).choices.find((choice) => choice.value === value);

export const choiceWritten = (name: SettingName, typed: string): SettingChoice | undefined => settingNamed(name).choices.find((choice) => choice.typed === typed);

export const chosenSetting = (sheet: SettingSheet, name: SettingName, choice: SettingChoice): SettingSheet => ({ ...sheet, [name]: choice.value });
