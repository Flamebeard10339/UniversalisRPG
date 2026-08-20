import { DslError, Parser } from './parser';
import { REFERENCE } from './values';

export interface SkillGrant {
  coefficient: number;
  amount: boolean;
  event: string;
}

const GRANT = new RegExp(String.raw`^gain[ \t]+(?:(?<coefficient>\d+(?:\.\d+)?)(?:[ \t]*\*[ \t]*(?<scaled>amount))?|(?<bare>amount))[ \t]+experience[ \t]+on[ \t]+(?<event>${REFERENCE.source})[ \t]*$`);

export const skillGrant: Parser<SkillGrant> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = cursor.take(/[^,\n]*/) ?? '';
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
  print: (grant) => `gain ${grant.coefficient === 1 && grant.amount ? '' : String(grant.coefficient)}${grant.coefficient !== 1 && grant.amount ? ' * ' : ''}${grant.amount ? 'amount' : ''} experience on ${grant.event}`,
  examples: ['gain amount experience on rat-bitten', 'gain 4 * amount experience on rat-bitten', 'gain 4 experience on rat-bitten', 'gain 1 experience on rat-bitten'],
};

export const grantValue = (grant: SkillGrant, amount: number): number => grant.coefficient * (grant.amount ? amount : 1);
