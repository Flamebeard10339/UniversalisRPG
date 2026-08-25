import type { Answer } from '../runtime/localized';
import type { GroupRow, StatRow } from '../runtime/session';

export interface StatTab {
  // The group whose stats these are, or nothing where the world declared none for them. A corpus
  // cannot reach the second: one `# group` standing standard for the kind catches every stat that
  // names none. It is here so that a world under construction draws its stats rather than losing
  // them, which is the only way a sheet could ever disagree with the engine about what there is.
  group: GroupRow | null;
  rows: readonly StatRow[];
}

const keyOf = (row: StatRow): string => row.group?.id ?? '';

// One tab per group the stats belong to, in the order the view publishes them — which is the order
// the world declares them in. So the tab the sheet opens on is the group the first `# stat` belongs
// to, moving a stat between groups moves it between tabs, and there is no list of tabs anywhere to
// keep in step with the stats.
export function statTabs(rows: readonly StatRow[]): readonly StatTab[] {
  const tabs: StatTab[] = [];
  for (const row of rows) {
    const held = tabs.find((tab) => (tab.group?.id ?? '') === keyOf(row));
    if (held) (held.rows as StatRow[]).push(row);
    else tabs.push({ group: row.group ?? null, rows: [row] });
  }
  return tabs;
}

// The tab being read: the one the player last pressed, or the first there is. A tab the sheet no
// longer has — a stat regrouped under the player, or a module switched off — falls back rather than
// leaving the page blank, so nothing has to be forgotten when the world changes underneath it.
export const shownTab = (tabs: readonly StatTab[], chosen: Answer | null): StatTab | null =>
  tabs.find((tab) => tab.group?.id === chosen) ?? tabs[0] ?? null;
