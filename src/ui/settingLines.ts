import type { SettingRow } from '../runtime/session';

// The line the page sends when somebody picks a choice on a setting. It is the same line a player
// types, so the page is a way of writing it rather than a second way of setting one.
export const settingLine = (name: string, written: string): string => `/settings ${name} ${written}`;

export const standsAt = (row: SettingRow, written: string): boolean => row.standing === written;
