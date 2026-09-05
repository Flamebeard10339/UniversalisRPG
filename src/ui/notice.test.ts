import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { PlayView } from '../runtime/session';
import { skillLevel, xpForLevel } from '../runtime/skills';
import { merged, NOTICE_LIFETIME_MS, noticesBetween, saidLines, sayingOf, type Notice, type Shown } from './notice';
import type { Words } from './words';

const here = fileURLToPath(new URL('.', import.meta.url));

const named = (id: string): string => id[0].toUpperCase() + id.slice(1);

const row = (id: string, value: number): PlayView['xp'][number] => {
  const level = skillLevel(value);
  const foot = xpForLevel(level);
  return { id, title: asLocalized(named(id)), value, level, earned: value - foot, span: xpForLevel(level + 1) - foot };
};

const carried = (id: string, count: number): PlayView['carried'][number] => ({ id, name: asLocalized(named(id)), count, shown: asLocalized(`${id} x${count}`), grown: false, verbs: ['destroy'], base: false, slotted: false, sockets: false });

const quest = (id: string, stage: string, standing: PlayView['journal'][number]['standing'], said: string): PlayView['journal'][number] => ({
  quest: id,
  title: asLocalized(named(id)),
  stage,
  standing,
  lines: said === '' ? [] : [{ stage, said: asLocalized(said), authored: said, struck: false }],
});

const viewOf = (parts: Partial<PlayView>): PlayView => ({ xp: [], carried: [], journal: [], ...parts }) as PlayView;

const words = ((id, params) => asLocalized([id, ...Object.values(params ?? {})].join(' '))) as Words;

const said = (before: PlayView, after: PlayView): string[] => noticesBetween(before, after, words).map(sayingOf);

const keys = (before: PlayView, after: PlayView): string[] => noticesBetween(before, after, words).map((notice) => notice.key);

const notice = (key: string, count: number, text: string): Notice => ({ key, count, words: asLocalized(text) });

const shownAs = (shown: readonly Shown[]): string[] => shown.map(sayingOf);

describe('what a notification says', () => {
  it('is its own words, and nothing about what raised it', () => {
    expect(sayingOf(notice('anything at all', 0, 'The goat is found'))).toBe('The goat is found');
  });

  it('carries a tally in front of them when it is counting something', () => {
    expect(sayingOf(notice('xp:attack', 12, 'Attack'))).toBe('+12 Attack');
    expect(sayingOf(notice('item:rope', 1, 'Rope'))).toBe('+1 Rope');
  });
});

describe('a notification already on screen', () => {
  it('counts up rather than being followed by a second saying the same, whatever raised either', () => {
    let shown: readonly Shown[] = [];
    for (const each of [7, 4, 6]) shown = merged(shown, notice('xp:cooking', each, 'Cooking'), 1).shown;

    expect(shownAs(shown)).toEqual(['+17 Cooking']);
  });

  it('is told again, so the surface can begin its fade over from the top', () => {
    const first = merged([], notice('quest:goat', 0, 'You have agreed to find the goat'), 1);
    const again = merged(first.shown, notice('quest:goat', 0, 'The goat is found'), 2);

    expect(first.one.told).toBe(1);
    expect(again.one.told).toBe(2);
    expect(again.one.id).toBe(first.one.id);
    expect(shownAs(again.shown)).toEqual(['The goat is found']);
  });

  it('is the one under the same key, so a different happening begins one of its own, newest first', () => {
    const one = merged([], notice('xp:attack', 5, 'Attack'), 1);
    const two = merged(one.shown, notice('item:rope', 1, 'Rope'), 2);

    expect(shownAs(two.shown)).toEqual(['+1 Rope', '+5 Attack']);
  });
});

describe('what raises one', () => {
  it('is experience earned, one line to the skill that earned it', () => {
    const from = xpForLevel(20);
    const to = xpForLevel(21) - 1;
    expect(said(viewOf({ xp: [row('attack', from)] }), viewOf({ xp: [row('attack', to)] }))).toEqual([`+${to - from} Attack`]);
    const under = xpForLevel(2) - 1;
    expect(said(viewOf({}), viewOf({ xp: [row('thieving', under)] }))).toEqual([`+${under} Thieving`]);
  });

  it('is an item arriving, and never one being spent', () => {
    expect(said(viewOf({ carried: [carried('rope', 1)] }), viewOf({ carried: [carried('rope', 3)] }))).toEqual(['+2 Rope']);
    expect(said(viewOf({ carried: [carried('rope', 3)] }), viewOf({ carried: [carried('rope', 1)] }))).toEqual([]);
  });

  it('is a skill levelling, which asks for the skill and the level it reached', () => {
    const before = viewOf({ xp: [row('attack', xpForLevel(11) - 1)] });
    const after = viewOf({ xp: [row('attack', xpForLevel(12))] });

    expect(said(before, after)).toContain('levelled Attack 12');
    expect(keys(before, after)).toContain('level:attack');
  });

  it('is a quest moving, and says where it now stands', () => {
    const before = viewOf({ journal: [quest('goat', 'asked', 'unstarted', 'The goatherd is looking for someone')] });
    const after = viewOf({ journal: [quest('goat', 'searching', 'started', 'You have agreed to find the goat')] });

    expect(said(before, after)).toEqual(['You have agreed to find the goat']);
    expect(keys(before, after)).toEqual(['quest:goat']);
  });

  it('is a quest finishing, which stands on no line and so falls back to naming itself', () => {
    const before = viewOf({ journal: [quest('goat', 'searching', 'started', 'You have agreed to find the goat')] });
    const after = viewOf({ journal: [quest('goat', 'searching', 'complete', '')] });

    expect(said(before, after)).toEqual(['Goat']);
  });
});

describe('every raiser there is, whichever they turn out to be', () => {
  const before = viewOf({
    xp: [row('attack', xpForLevel(11) - 1), row('cooking', 40)],
    carried: [carried('rope', 1)],
    journal: [quest('goat', 'asked', 'unstarted', 'The goatherd is looking for someone')],
  });
  const after = viewOf({
    xp: [row('attack', xpForLevel(12)), row('cooking', 90)],
    carried: [carried('rope', 4), carried('blade', 1)],
    journal: [quest('goat', 'searching', 'started', 'You have agreed to find the goat')],
  });

  it('raises nothing at all for a turn in which nothing moved', () => {
    expect(noticesBetween(after, after, words)).toEqual([]);
  });

  it('keys what it raises apart, so two happenings at once are never counted up into one line', () => {
    const raised = keys(before, after);

    expect(new Set(raised).size).toBe(raised.length);
    expect(raised.length).toBeGreaterThan(4);
  });

  it('gives every line words to say', () => {
    for (const one of noticesBetween(before, after, words)) expect(sayingOf(one).trim(), one.key).not.toBe('');
  });
});

describe('how long a notification stays', () => {
  it('is exactly as long as the fade the stylesheet draws it with, so it never snaps back before it goes', () => {
    const stylesheet = readFileSync(resolve(here, '..', 'index.css'), 'utf8');
    const fade = /\.lingered\s*\{\s*animation:\s*lingered\s+(\d+)ms/.exec(stylesheet);

    expect(fade, 'the stylesheet draws no .lingered fade').not.toBeNull();
    expect(Number(fade?.[1])).toBe(NOTICE_LIFETIME_MS);
  });
});

describe('two gains the same size, landing together', () => {
  const shownOf = (...notices: Notice[]): Shown[] => notices.map((notice, at) => ({ ...notice, id: at + 1, told: 1 }));
  const said = (...notices: Notice[]): string[] => saidLines(shownOf(...notices)).map((line) => line.text);

  it('reads as one line naming both, and does not sum what they are worth', () => {
    expect(said(notice('xp:attack', 5, 'Attack'), notice('xp:defence', 5, 'Defence'))).toEqual(['+5 Attack, Defence']);
  });

  it('leaves two gains of different sizes as the two lines they are', () => {
    expect(said(notice('xp:attack', 5, 'Attack'), notice('xp:defence', 3, 'Defence'))).toEqual(['+5 Attack', '+3 Defence']);
  });

  it('leaves an item and a skill apart however alike their counts are', () => {
    expect(said(notice('item:roast-chestnut', 1, 'Roast Chestnut'), notice('xp:cooking', 1, 'Cooking'))).toEqual(['+1 Roast Chestnut', '+1 Cooking']);
  });

  it('never folds a notice that counts nothing, since each is a whole sentence', () => {
    expect(said(notice('quest:one', 0, 'A quest begins'), notice('quest:two', 0, 'Another begins'))).toEqual(['A quest begins', 'Another begins']);
  });

  it('folds a run of three, and keeps what follows it on its own line', () => {
    expect(said(notice('xp:attack', 5, 'Attack'), notice('xp:defence', 5, 'Defence'), notice('xp:melee', 5, 'Melee'), notice('xp:cooking', 2, 'Cooking'))).toEqual(['+5 Attack, Defence, Melee', '+2 Cooking']);
  });
});
