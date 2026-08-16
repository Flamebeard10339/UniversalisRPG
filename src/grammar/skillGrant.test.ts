import { describe, expect, it } from 'vitest';
import { Cursor } from './parser';
import { grantValue, SkillGrant, skillGrant } from './skillGrant';

const parse = (line: string): SkillGrant => skillGrant.parse(new Cursor(line));

describe('a grant is one coefficient and one bound amount', () => {
  it('takes a coefficient, an amount, or a product of the two', () => {
    expect(parse('gain 4*amount experience on rat-bitten')).toEqual({ coefficient: 4, amount: true, event: 'rat-bitten' });
    expect(parse('gain 4 experience on rat-bitten')).toEqual({ coefficient: 4, amount: false, event: 'rat-bitten' });
    expect(parse('gain amount experience on rat-bitten')).toEqual({ coefficient: 1, amount: true, event: 'rat-bitten' });
  });

  it('refuses a grant that omits both halves, so a line always says a number', () => {
    expect(() => parse('gain experience on rat-bitten')).toThrow('expected a grant like');
  });

  // Anything more general is a second evaluator with its own variable binding,
  // and the refusal is what keeps this one from becoming one.
  it('refuses a second variable, a second term and an operator that is not the product', () => {
    for (const line of ['gain 4*damage experience on rat-bitten', 'gain amount*amount experience on rat-bitten', 'gain 4 + amount experience on rat-bitten', 'gain 4*amount+1 experience on rat-bitten', 'gain amount*4 experience on rat-bitten']) {
      expect(() => parse(line), line).toThrow('expected a grant like');
    }
  });

  it('reads the same grant however the spacing is written', () => {
    const spellings = ['gain 4*amount experience on rat-bitten', 'gain 4 * amount experience on rat-bitten', 'gain 4  *  amount   experience   on   rat-bitten', '  gain 4* amount experience on rat-bitten  '];
    for (const spelling of spellings) expect(parse(spelling), spelling).toEqual({ coefficient: 4, amount: true, event: 'rat-bitten' });
  });

  it('takes the event name as an ordinary reference, namespaced or not', () => {
    expect(parse('gain 2 experience on base.rat-bitten').event).toBe('base.rat-bitten');
  });

  it('refuses a line that names a skill, since the # skill it is written on is the one it trains', () => {
    expect(() => parse('gain 4 experience in melee on rat-bitten')).toThrow('expected a grant like');
  });
});

describe('what a moment is worth', () => {
  it('multiplies the coefficient by the amount only where the grant reads one', () => {
    expect(grantValue({ coefficient: 4, amount: true, event: 'e' }, 7)).toBe(28);
    expect(grantValue({ coefficient: 4, amount: false, event: 'e' }, 7)).toBe(4);
    expect(grantValue({ coefficient: 1, amount: true, event: 'e' }, 7)).toBe(7);
  });
});
