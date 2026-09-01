import { describe, expect, it } from 'vitest';
import { fixtureSources } from '../content/worldFixture';
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

describe('the shipped world, as the sheet lays it out', () => {
  const session = startSession(loadUniverseWithDiagnostics(fixtureSources()).registry);
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
