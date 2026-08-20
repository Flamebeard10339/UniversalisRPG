import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { PlayView } from '../runtime/session';
import { skillLevel, xpForLevel } from '../runtime/skills';
import { filled, panelOf, perHour, skillPanels, untilNext, type XpMark } from './skillPanels';

type Row = PlayView['xp'][number];

const row = (id: string, value: number): Row => {
  const level = skillLevel(value);
  const foot = xpForLevel(level);
  return { id, title: asLocalized(id[0].toUpperCase() + id.slice(1)), value, level, earned: value - foot, span: xpForLevel(level + 1) - foot };
};

const mark = (at: number, totals: Record<string, number>): XpMark => ({ at, totals });

describe('one skill, read off what the engine published', () => {
  it('draws the level the engine published rather than counting for itself', () => {
    for (const total of [0, 1, 999, 1000, 5432, 250_000]) {
      expect(panelOf(row('thieving', total)).level).toBe(skillLevel(total));
    }
    expect(panelOf({ id: 'thieving', title: asLocalized('Thieving'), value: 5, level: 99, earned: 2, span: 8 })).toMatchObject({ level: 99, into: 2, span: 8, toNext: 6 });
  });

  it('stands exactly on the foot of a level the moment it is reached', () => {
    for (const level of [2, 5, 11, 27]) {
      const panel = panelOf(row('thieving', xpForLevel(level)));

      expect(panel.level).toBe(level);
      expect(panel.into).toBe(0);
      expect(filled(panel)).toBe(0);
      expect(panel.toNext).toBe(xpForLevel(level + 1) - xpForLevel(level));
    }
  });

  it('is one grain short of the next level with one grain left to earn', () => {
    for (const level of [2, 9, 31]) {
      const panel = panelOf(row('thieving', xpForLevel(level) - 1));

      expect(panel.level).toBe(level - 1);
      expect(panel.toNext).toBe(1);
      expect(filled(panel)).toBeLessThan(1);
      expect(filled(panel)).toBeGreaterThan(0.9);
    }
  });

  it('accounts for the whole level between the ground under it and the ground still to cover', () => {
    for (const total of [0, 400, 1500, 90_000]) {
      const panel = panelOf(row('thieving', total));

      expect(panel.into + panel.toNext).toBe(panel.span);
      expect(panel.total).toBe(total);
    }
  });

  it('draws the ring between empty and full, whatever the total', () => {
    for (const total of [0, 1, 1000, 12_345, 5_000_000]) {
      expect(filled(panelOf(row('thieving', total)))).toBeGreaterThanOrEqual(0);
      expect(filled(panelOf(row('thieving', total)))).toBeLessThanOrEqual(1);
    }
  });
});

describe('the page as a whole', () => {
  it('draws one panel per row the view publishes', () => {
    const rows = [row('thieving', 10), row('attack', 20), row('defence', 0)];

    expect(skillPanels(rows).map((panel) => panel.id).sort()).toEqual(['attack', 'defence', 'thieving']);
  });

  it('holds them in one order however the engine listed them, so nothing moves under a thumb', () => {
    const names = (rows: Row[]): string[] => skillPanels(rows).map((panel) => panel.title as unknown as string);
    const rows = [row('thieving', 10), row('attack', 20), row('defence', 0)];

    expect(names(rows)).toEqual(['Attack', 'Defence', 'Thieving']);
    expect(names([...rows].reverse())).toEqual(names(rows));
    expect(names(rows.map((each) => ({ ...each, value: each.value + 5000 })))).toEqual(names(rows));
  });

  it('draws nothing at all for a character who has learned nothing', () => {
    expect(skillPanels([])).toEqual([]);
  });
});

describe('how fast it is arriving', () => {
  it('is unknown until the world clock has moved, which is not the same as nothing', () => {
    expect(perHour(mark(0, { thieving: 0 }), mark(0, { thieving: 500 }), 'thieving')).toBeNull();
  });

  it('is what was earned over the hours it took', () => {
    expect(perHour(mark(0, { thieving: 0 }), mark(3600, { thieving: 250 }), 'thieving')).toBe(250);
    expect(perHour(mark(100, { thieving: 40 }), mark(1900, { thieving: 140 }), 'thieving')).toBe(200);
  });

  it('is nothing for a skill nothing has been earned in, and not a division by nothing', () => {
    expect(perHour(mark(0, {}), mark(3600, { attack: 10 }), 'thieving')).toBe(0);
  });

  it('reads a skill the session had never heard of as having started from nothing', () => {
    expect(perHour(mark(0, {}), mark(3600, { thieving: 90 }), 'thieving')).toBe(90);
  });
});

describe('how long the next level takes', () => {
  it('is the ground still to cover at the rate it is being covered', () => {
    const panel = panelOf(row('thieving', 0));

    expect(untilNext(panel, panel.toNext)).toBe(3600);
    expect(untilNext(panel, panel.toNext * 2)).toBe(1800);
  });

  it('is unknown while the rate is, and while nothing is arriving at all', () => {
    const panel = panelOf(row('thieving', 0));

    expect(untilNext(panel, null)).toBeNull();
    expect(untilNext(panel, 0)).toBeNull();
    expect(untilNext(panel, -5)).toBeNull();
  });
});
