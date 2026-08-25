import type { Answer, Localized } from '../runtime/localized';
import { standingLine, type PlayView } from '../runtime/session';
import { signed } from './format';
import { crossings } from './levelling';
import type { Words } from './words';

// The key is what merging goes by and nothing else: two happenings under one key count up into a
// single line, so whoever raises one chooses how coarse its counting is.
export interface Notice {
  key: Answer;
  count: number;
  words: Localized;
}

export interface Shown extends Notice {
  id: number;
  told: number;
}

export const NOTICE_LIFETIME_MS = 2000;

export const sayingOf = (notice: Notice): string => (notice.count === 0 ? notice.words : `${signed(notice.count)} ${notice.words}`);

// A key is minted here and read back here, so what a watcher writes into one and what a fold reads
// out of one are the same rule rather than two spellings of it.
export const noticeKey = (under: string, id: Answer): Answer => `${under}:${id}`;

const under = (notice: Notice): string => notice.key.slice(0, notice.key.indexOf(':'));

// Gains that landed together and are the same size read as one line naming all of them: +5 Attack
// and +5 Defence is +5 Attack, Defence. The count is not summed — a player who gained five of each
// gained five, and +10 would say they gained ten of something there is no ten of.
//
// Held to one namespace as well as one count, because a run that hands over an item and the xp for
// taking it raises both at once: roasting one chestnut is +1 of the chestnut and +1 of cooking, and
// counting alone would say `+1 Roast Chestnut, Cooking`, which is a sentence about nothing. A
// notice counting nothing is a whole sentence of its own and never folds.
export function saidLines(shown: readonly Shown[]): { at: Shown; text: string }[] {
  const lines: { at: Shown; text: string }[] = [];
  for (const notice of shown) {
    const last = lines[lines.length - 1];
    const foldable = notice.count !== 0 && last !== undefined && last.at.count === notice.count && under(last.at) === under(notice);
    if (foldable) lines[lines.length - 1] = { at: last.at, text: `${last.text}, ${notice.words}` };
    else lines.push({ at: notice, text: sayingOf(notice) });
  }
  return lines;
}

export function merged(shown: readonly Shown[], said: Notice, id: number): { shown: readonly Shown[]; one: Shown } {
  const at = shown.findIndex((each) => each.key === said.key);
  if (at < 0) {
    const one: Shown = { ...said, id, told: 1 };
    return { shown: [one, ...shown], one };
  }
  const one: Shown = { ...shown[at], count: shown[at].count + said.count, words: said.words, told: shown[at].told + 1 };
  return { shown: shown.map((each, index) => (index === at ? one : each)), one };
}

type Watcher = (before: PlayView, after: PlayView, words: Words) => Notice[];

function climbed<Row extends { id: Answer }>(before: readonly Row[], after: readonly Row[], under: string, amount: (row: Row) => number, said: (row: Row) => Localized): Notice[] {
  const held = new Map(before.map((row) => [row.id, amount(row)]));
  return after.flatMap((row) => {
    const risen = amount(row) - (held.get(row.id) ?? 0);
    return risen > 0 ? [{ key: noticeKey(under, row.id), count: risen, words: said(row) }] : [];
  });
}

const standingOf = (entry: PlayView['journal'][number]): string => `${entry.stage}/${entry.standing}`;

// Every happening that has words for the player. A notification is a line here and nothing else:
// nothing downstream asks what raised one, so removing a line removes a notification whole.
const RAISED_BY: readonly Watcher[] = [
  (before, after) => climbed(before.xp, after.xp, 'xp', (row) => row.value, (row) => row.title),
  (before, after) => climbed(before.carried, after.carried, 'item', (row) => row.count, (row) => row.name),
  (before, after, words) =>
    crossings(before.xp, after.xp).flatMap((id) => {
      const row = after.xp.find((each) => each.id === id);
      return row === undefined ? [] : [{ key: noticeKey('level', id), count: 0, words: words('levelled', { skill: row.title, level: row.level }) }];
    }),
  (before, after) => {
    const stood = new Map(before.journal.map((entry) => [entry.quest, standingOf(entry)]));
    return after.journal.flatMap((entry) => {
      const was = stood.get(entry.quest);
      return was === undefined || was === standingOf(entry) ? [] : [{ key: noticeKey('quest', entry.quest), count: 0, words: standingLine(entry) ?? entry.title }];
    });
  },
];

export const noticesBetween = (before: PlayView, after: PlayView, words: Words): Notice[] => RAISED_BY.flatMap((raise) => raise(before, after, words));
