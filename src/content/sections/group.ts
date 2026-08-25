import { colour } from '../../grammar/colour';
import { list } from '../../grammar/list';
import { Parser } from '../../grammar/parser';
import { id } from '../../grammar/values';
import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Group {
  id: string;
  title: string;
  colour: string;
  standardFor: string[];
}

// A section kind, written where a group says which kinds fall to it. Nothing declares one, so it is
// not an id and the reference walk leaves it alone.
export const kindName: Parser<string> = {
  parse: id.parse,
  print: id.print,
  forms: ['<kind>'],
  examples: ['item', 'entity'],
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

// The group a section belongs to: the one it names, or the one the world declared standard for its kind.
export const groupOf = (groups: ReadonlyMap<string, Group>, kind: string, named: string | undefined): Group | undefined =>
  (named === undefined ? undefined : groups.get(named)) ?? standardGroup(groups, kind);
