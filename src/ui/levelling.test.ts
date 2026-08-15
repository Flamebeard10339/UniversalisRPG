import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { PlayView } from '../runtime/session';
import { skillLevel, xpForLevel } from '../runtime/skills';
import { crossings, looked, nothingCrossed, noticed, stirring } from './levelling';

type Row = PlayView['xp'][number];

// A published skill row, built through the curve the engine publishes it
// through, so a fixture and a running session cannot disagree about which level
// a total is.
const row = (id: string, value: number): Row => {
  const level = skillLevel(value);
  const foot = xpForLevel(level);
  return { id, title: asLocalized(id), value, level, earned: value - foot, span: xpForLevel(level + 1) - foot };
};

const at = (id: string, level: number, over = 0): Row => row(id, xpForLevel(level) + over);

describe('which skills went up', () => {
  it('names a skill that reached the foot of the next level', () => {
    expect(crossings([at('attack', 4, -1)], [at('attack', 5)])).toEqual(['attack']);
  });

  it('names none for a total that moved without reaching one', () => {
    expect(crossings([at('attack', 4)], [at('attack', 4, 1)])).toEqual([]);
  });

  it('names every skill that crossed, and only those', () => {
    const before = [at('attack', 4, -1), at('defence', 4), at('health', 9, -1)];
    const after = [at('attack', 5), at('defence', 4, 5), at('health', 10)];

    expect(crossings(before, after)).toEqual(['attack', 'health']);
  });

  it('names a skill the player has only just started earning in', () => {
    expect(crossings([], [at('thieving', 2)])).toEqual(['thieving']);
  });
});

describe('the mark that waits on the banner', () => {
  it('is not there until something crosses', () => {
    expect(stirring(nothingCrossed)).toBe(false);
    expect(stirring(noticed(nothingCrossed, []))).toBe(false);
  });

  it('is there the moment something does, and stays until the page is opened', () => {
    const held = noticed(nothingCrossed, ['attack']);

    expect(stirring(held)).toBe(true);
    expect(stirring(noticed(held, ['defence']))).toBe(true);
    expect(stirring(looked(held))).toBe(false);
  });

  it('greets exactly what was waiting when the page was opened', () => {
    const held = looked(noticed(noticed(nothingCrossed, ['attack']), ['health']));

    expect([...held.greeted].sort()).toEqual(['attack', 'health']);
    expect([...held.waiting]).toEqual([]);
  });

  it('greets again, under a new generation, the next time something crosses', () => {
    const first = looked(noticed(nothingCrossed, ['attack']));
    const second = looked(noticed(first, ['defence']));

    expect([...second.greeted]).toEqual(['defence']);
    expect(second.generation).toBeGreaterThan(first.generation);
  });

  it('greets nothing on a visit to a settled page, so a second look replays no flash', () => {
    const settled = looked(looked(noticed(nothingCrossed, ['attack'])));

    expect([...settled.greeted]).toEqual([]);
    expect(stirring(settled)).toBe(false);
  });

  it('changes nothing at all on a visit to a page that never had a mark', () => {
    expect(looked(nothingCrossed)).toBe(nothingCrossed);
  });
});
