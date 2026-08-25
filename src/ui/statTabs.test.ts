import { describe, expect, it } from 'vitest';
import { shippedSources } from '../content/shipped';
import { loadUniverseWithDiagnostics } from '../content/load';
import { asLocalized } from '../runtime/localizedFixture';
import { sessionLocalizer, startSession, view } from '../runtime/session';
import type { GroupRow, StatRow } from '../runtime/session';
import { shownTab, statTabs } from './statTabs';

const group = (id: string, title: string): GroupRow => ({ id, title: asLocalized(title), colour: '#000000' });

const row = (id: string, of?: GroupRow): StatRow => ({ id, title: asLocalized(id), value: 1, from: [], ...(of ? { group: of } : {}) });

const FIGHTING = group('core.fighting', 'Fighting');
const UPKEEP = group('core.upkeep', 'Upkeep');

describe('the tabs the character sheet keeps its stats under', () => {
  it('is one tab per group the stats belong to, in the order the world declares the stats', () => {
    const tabs = statTabs([row('attack', FIGHTING), row('regeneration', UPKEEP), row('defense', FIGHTING)]);

    expect(tabs.map((tab) => tab.group?.id)).toEqual(['core.fighting', 'core.upkeep']);
    expect(tabs.map((tab) => tab.rows.map((each) => each.id))).toEqual([['attack', 'defense'], ['regeneration']]);
  });

  it('opens on the group the first stat belongs to, which is what makes that the main tab', () => {
    const tabs = statTabs([row('regeneration', UPKEEP), row('attack', FIGHTING)]);

    expect(shownTab(tabs, null)?.group?.id).toBe('core.upkeep');
    expect(shownTab(tabs, 'core.fighting')?.group?.id).toBe('core.fighting');
  });

  // A world that classifies none of its stats still draws all of them, on one tab with no strip
  // above it. No corpus reaches that — a `# group` standing standard for the kind catches every stat
  // naming none — but a sheet that lost a row over it would be disagreeing with the engine.
  it('keeps every stat a world grouped none of, on the one tab there then is', () => {
    const tabs = statTabs([row('attack'), row('luck')]);

    expect(tabs).toHaveLength(1);
    expect(tabs[0].group).toBeNull();
    expect(tabs[0].rows.map((each) => each.id)).toEqual(['attack', 'luck']);
  });

  it('falls back rather than drawing an empty page when the tab the player was on is gone', () => {
    expect(shownTab(statTabs([row('attack', FIGHTING)]), 'core.knack')?.group?.id).toBe('core.fighting');
    expect(shownTab(statTabs([]), 'core.fighting')).toBeNull();
  });
});

// The whole point of reading the tab off the stat's own `group:` is that nothing here has to be
// edited when a stat or a group is. So the claim is made against the shipped world rather than a
// fixture: every stat it declares is on a tab, and there is more than one tab to be on.
describe('the shipped world, as the sheet lays it out', () => {
  const session = startSession(loadUniverseWithDiagnostics(shippedSources()).registry);
  const shown = view(session);
  const localizer = sessionLocalizer(session);

  it('leaves no stat off the sheet, because a group standard for the kind catches one naming none', () => {
    const tabs = statTabs(shown.stats);

    expect(shown.stats.length).toBeGreaterThan(4);
    expect(tabs.flatMap((tab) => tab.rows.map((row) => row.id)).sort()).toEqual(shown.stats.map((row) => row.id).sort());
  });

  it('has more than one tab, and names each of them in the words its own group is titled with', () => {
    const tabs = statTabs(shown.stats);

    expect(tabs.length).toBeGreaterThan(1);
    for (const tab of tabs) expect(tab.group?.title).toBe(localizer.title('group', tab.group!.id));
  });
});
