import type { Condition } from '../../grammar/condition';
import { DslError, type Parser } from '../../grammar/parser';
import { point, Range, range } from '../../grammar/range';
import { decimal, id, numberOrStat } from '../../grammar/values';
import { firstCycle } from '../cycle';
import { hiddenIf, section } from './define';
import { GROUP_FIELD } from './group';
import { TITLE_FIELD } from './info';

export interface Conversion {
  from: string;
  to: string;
}

export interface Stat {
  id: string;
  title: string;
  base: Range;
  group?: string;
  hiddenIf?: Condition;
  deals?: string;
  resists?: string;
  converts?: Conversion;
  atMost?: number | string;
  roundsTo?: number;
}

const conversion: Parser<Conversion> = {
  parse(cursor) {
    const from = id.parse(cursor);
    if (cursor.take(/[ \t]+to[ \t]+/) === null) {
      throw new DslError('expected `to` between the type converted and the type it lands as', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.src.length) });
    }
    return { from, to: id.parse(cursor) };
  },
  print: ({ from, to }) => `${from} to ${to}`,
  lands: [
    { how: 'ref', field: 'from', names: 'damage-type' },
    { how: 'ref', field: 'to', names: 'damage-type' },
  ],
  forms: ['<damage-type> to <damage-type>'],
  examples: ['physical to fire'],
};

const ROLES = ['deals', 'resists', 'converts'] as const;

const IN_A_SWING = 'a role in a swing, and a stat has one:';

export const stat = section<Stat>()({
  kind: 'stat',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'stats',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    base: { parser: range, default: () => point(0), printed: 'always' },
    group: GROUP_FIELD,
    hiddenIf: hiddenIf(
      'the stat is kept off the sheet the player reads while this holds, which is how a stat the world keeps for itself stays off it — `hidden if: always` never shows, and `hidden if: not changed.<this stat>` shows it only once something has moved it off the base it was declared with',
    ),
    deals: {
      parser: id,
      names: { id: 'damage-type' },
      standsWithout: true,
      note: `${IN_A_SWING} whoever carries this stat deals its value as that type on every swing of theirs that lands, on top of the untyped contest the action names. Untyped damage is the absence of a type, so a swing with no dealt stat on either side is what it always was`,
    },
    resists: {
      parser: id,
      names: { id: 'damage-type' },
      standsWithout: true,
      note: `${IN_A_SWING} whoever carries this stat takes its value off every point of that type that lands on them, read as a percent — 50 halves it, and -50 adds half again — and read no higher than its \`at most:\` where it declares one`,
    },
    converts: {
      parser: conversion,
      standsWithout: true,
      note: `${IN_A_SWING} this stat's value is the percent of the first type whoever carries it would have dealt that lands as the second instead, moved before either type is resisted. Conversions are read in one pass in the order they chain, so a chain that comes back round to a type is refused when the world loads, and stats that together convert more than the whole of a type share the whole of it`,
    },
    roundsTo: {
      parser: decimal,
      keyword: 'rounds to',
      standsWithout: true,
      note: 'the step every value the engine works out for this stat is rounded to the nearest of — what a point of a # passive budget comes to, and anything else solved rather than written. `rounds to: 5` gives a stat that moves in fives however the ladder under it falls, which is worth more than an exact figure nobody can hold in their head. A worth that is more than nothing never rounds away to nothing: it comes up to one step rather than down to none. A stat saying nothing here keeps whatever fraction it was solved to',
    },
    atMost: {
      parser: numberOrStat,
      keyword: 'at most',
      standsWithout: true,
      note: 'the stat reads no higher than this — a number, or another stat read off the same carrier, which is how a resistance stops at seventy-five while the stat that says so stops at ninety. A stat may not cap itself, nor stand in a ring of caps, and either is refused when the world loads',
    },
  },
  validate: (value) => {
    const roles = ROLES.filter((role) => value[role] !== undefined);
    if (roles.length > 1) return `declares ${roles.join(' and ')}, and a stat is one thing in a swing: declare a stat per role`;
    if (value.converts !== undefined && value.converts.from === value.converts.to) return `converts: ${value.converts.from} to ${value.converts.to} moves a type onto itself, which would never finish`;
    if (value.atMost === value.id) return 'at most: names itself, so it could never be read';
    if (value.roundsTo !== undefined && value.roundsTo <= 0) return `rounds to: ${String(value.roundsTo)} is not a step anything could be rounded to; a step is more than zero`;
    return undefined;
  },
});

export function statRing(stats: ReadonlyMap<string, Stat>): DslError | null {
  const blame = (along: readonly string[], says: string): DslError => new DslError(says, undefined, { kind: 'stat', id: along[0]! });
  const capped = [...stats.values()].filter((each) => typeof each.atMost === 'string').map((each) => each.id);
  const caps = firstCycle(capped, (statId) => {
    const cap = stats.get(statId)?.atMost;
    return typeof cap === 'string' ? [cap] : [];
  });
  if (caps) {
    return blame(caps.slice(0, -1), `# stat ${caps[0]} is capped in a ring — ${caps.join(' -> ')} — so none of them could ever be read: an \`at most:\` may not come back round to the stat it caps`);
  }

  const converting = new Map<string, Stat[]>();
  for (const each of stats.values()) {
    if (each.converts === undefined) continue;
    converting.set(each.converts.from, [...(converting.get(each.converts.from) ?? []), each]);
  }
  const types = firstCycle([...converting.keys()], (type) => (converting.get(type) ?? []).map((each) => each.converts!.to));
  if (!types) return null;
  const along = types.slice(0, -1).map((from, at) => (converting.get(from) ?? []).find((each) => each.converts!.to === types[at + 1])!.id);
  return blame(along, `${along.map((statId) => `# stat ${statId}`).join(' and ')} convert in a ring — ${types.join(' -> ')} — which would never finish: damage is read in one pass, so a type may not come back round to itself`);
}
