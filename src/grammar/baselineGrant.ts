import { DslError, Parser } from './parser';
import { REFERENCE } from './values';

export const AXES = ['added', 'increased'] as const;

export type Axis = (typeof AXES)[number];

export interface BaselineGrant {
  times: number;
  axis: Axis;
  statId: string;
}

const GRANT = new RegExp(String.raw`^(?<sign>[+-])(?<times>\d+(?:\.\d+)?)x[ \t]+(?<axis>${AXES.join('|')})[ \t]+(?<stat>${REFERENCE.source})$`);

export const baselineGrant: Parser<BaselineGrant> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = cursor.take(/[^,\n]*/) ?? '';
    const groups = GRANT.exec(raw.trim())?.groups;
    if (!groups) {
      throw new DslError(
        `expected a grant relative to the ladder, like \`+2x added physical-damage\`, where the multiple is of what one level of that stat's ladder is worth on that half of it, got ${JSON.stringify(raw)}`,
        { start: cursor.abs(start), end: cursor.abs(cursor.pos) },
      );
    }
    return { times: Number(groups.sign === '-' ? `-${groups.times!}` : groups.times!), axis: groups.axis as Axis, statId: groups.stat! };
  },
  print: ({ times, axis, statId }) => `${times < 0 ? '-' : '+'}${String(Math.abs(times))}x ${axis} ${statId}`,
  forms: AXES.flatMap((axis) => [`+<float>x ${axis} <stat>`, `-<float>x ${axis} <stat>`]),
  examples: ['+2x added physical-damage', '-1x added defense', '+3x increased physical-damage', '-0.5x increased defense'],
};
