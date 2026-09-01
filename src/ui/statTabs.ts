import type { Answer } from '../runtime/localized';
import type { GroupRow, StatRow } from '../runtime/session';

export interface StatTab {
  group: GroupRow | null;
  rows: readonly StatRow[];
}

const keyOf = (row: StatRow): string => row.group?.id ?? '';

export function statTabs(rows: readonly StatRow[]): readonly StatTab[] {
  const tabs: StatTab[] = [];
  for (const row of rows) {
    const held = tabs.find((tab) => (tab.group?.id ?? '') === keyOf(row));
    if (held) (held.rows as StatRow[]).push(row);
    else tabs.push({ group: row.group ?? null, rows: [row] });
  }
  return tabs;
}

export const shownTab = (tabs: readonly StatTab[], chosen: Answer | null): StatTab | null =>
  tabs.find((tab) => tab.group?.id === chosen) ?? tabs[0] ?? null;
