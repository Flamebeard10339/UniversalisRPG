import type { SettingRow } from '../runtime/session';

export const settingLine = (name: string, written: string): string => `/settings ${name} ${written}`;

export const standsAt = (row: SettingRow, written: string): boolean => row.standing === written;
