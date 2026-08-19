import { DslError, Parser } from './parser';
import { REFERENCE } from './values';

// One line of training: what a moment is worth, and which moment it is. The
// skill is the `# skill` the line is written on, so nothing here names one.
export interface SkillGrant {
  coefficient: number;
  // Whether the moment's own quantity is read. A grant that ignores it is worth
  // its coefficient every time, which is what a moment carrying no quantity is
  // worth anyway.
  amount: boolean;
  event: string;
}

// The whole line, because every part of it is fixed: only the coefficient, the
// presence of `amount` and the event name vary, and a grant missing both halves
// of the expression is refused by the alternation rather than by a check.
const GRANT = new RegExp(String.raw`^gain[ \t]+(?:(?<coefficient>\d+(?:\.\d+)?)(?:[ \t]*\*[ \t]*(?<scaled>amount))?|(?<bare>amount))[ \t]+experience[ \t]+on[ \t]+(?<event>${REFERENCE.source})[ \t]*$`);

export const skillGrant: Parser<SkillGrant> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = cursor.take(/[^\n]*/) ?? '';
    const groups = GRANT.exec(raw.trim())?.groups;
    if (!groups) {
      throw new DslError(`expected a grant like \`gain 4 * amount experience on rat-bitten\`, with a coefficient, an amount, or both, got ${JSON.stringify(raw)}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    }
    return {
      coefficient: groups.coefficient === undefined ? 1 : Number(groups.coefficient),
      amount: groups.bare !== undefined || groups.scaled !== undefined,
      event: groups.event!,
    };
  },
  // Every part of the line but the coefficient, the `amount` and the event name
  // is fixed, so the printer is the alternation above read backwards.
  print: (grant) => `gain ${grant.coefficient === 1 && grant.amount ? '' : String(grant.coefficient)}${grant.coefficient !== 1 && grant.amount ? ' * ' : ''}${grant.amount ? 'amount' : ''} experience on ${grant.event}`,
  examples: ['gain amount experience on rat-bitten', 'gain 4 * amount experience on rat-bitten', 'gain 4 experience on rat-bitten', 'gain 1 experience on rat-bitten'],
};

// What one moment of `amount` is worth, before it is rounded to whole xp.
export const grantValue = (grant: SkillGrant, amount: number): number => grant.coefficient * (grant.amount ? amount : 1);
