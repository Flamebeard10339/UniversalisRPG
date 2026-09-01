import { colour } from '../../grammar/colour';
import { list } from '../../grammar/list';
import { DslError, Parser } from '../../grammar/parser';
import { id } from '../../grammar/values';
import { section } from './define';
import { TITLE_FIELD } from './info';
import { QUEST_STANDINGS, type QuestStanding } from './quest';

export interface Group {
  id: string;
  title: string;
  colour: string;
  standardFor: string[];
  standsFor?: QuestStanding;
}

// A section kind, written where a group says which kinds fall to it. Nothing declares one, so it is
// not an id and the reference walk leaves it alone.
export const kindName: Parser<string> = {
  parse: id.parse,
  print: id.print,
  forms: ['<kind>'],
  examples: ['item', 'entity'],
};

// Which of a quest's three standings this group means. The engine has no ids of its own for them —
// what a journal fills a row with and what it calls that row are both read off whichever group says
// it stands here, so a world names its own groups and the engine names none of them.
const standingValue: Parser<QuestStanding> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = id.parse(cursor);
    if (!(QUEST_STANDINGS as readonly string[]).includes(raw)) {
      throw new DslError(`stands for: must be one of ${QUEST_STANDINGS.join(', ')}, got ${JSON.stringify(raw)}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    }
    return raw as QuestStanding;
  },
  print: (value) => value,
  forms: [...QUEST_STANDINGS],
  examples: [...QUEST_STANDINGS],
};

export const group = section<Group>()({
  kind: 'group',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'groups',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    colour: { parser: colour, note: 'what everything in this group is drawn in, wherever a surface fills something with the group it belongs to' },
    standardFor: {
      parser: list(kindName),
      keyword: 'standard for',
      default: () => [],
      note: 'the kinds whose sections fall to this group when they name none of their own, so nothing of those kinds is ever ungrouped',
    },
    standsFor: {
      parser: standingValue,
      keyword: 'stands for',
      note: 'the standing of a quest this group means, which is where the journal reads both the colour it fills a row with and the word it calls that row by',
    },
  },
  validate: (value) => (value.colour ? undefined : 'requires a colour:, which is what everything in the group is drawn in'),
});

// The site every kind that belongs to a group writes it at. Written once, so a kind that gains a
// group gains its parser, its printer, its reference walk and its offers along with it.
export const GROUP_FIELD = {
  parser: id,
  names: { id: 'group' },
  standsWithout: true,
  note: 'what kind of thing this is, which is what colours it; one naming none falls to the group that is standard for its kind',
} as const;

export const standardGroup = (groups: ReadonlyMap<string, Group>, kind: string): Group | undefined => [...groups.values()].find((each) => each.standardFor.includes(kind));

// The group a world says means this standing of a quest, or none where it says nothing.
export const standingGroup = (groups: ReadonlyMap<string, Group>, standing: QuestStanding): Group | undefined => [...groups.values()].find((each) => each.standsFor === standing);

// The group a section belongs to: the one it names, or the one the world declared standard for its kind.
export const groupOf = (groups: ReadonlyMap<string, Group>, kind: string, named: string | undefined): Group | undefined =>
  (named === undefined ? undefined : groups.get(named)) ?? standardGroup(groups, kind);
