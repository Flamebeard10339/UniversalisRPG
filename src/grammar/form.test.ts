import { describe, expect, it } from 'vitest';
import { align, fits, holesIn, matches, standingIn, valueIn } from './form';

const standing = (form: string, written: string): string | null => align(form, written)?.open?.name ?? null;

describe('a form read against a whole line', () => {
  it('takes a line that is every part of it', () => {
    expect(matches('xp: <skill> <amount>', 'xp: mining 4-7')).toBe(true);
  });

  it('refuses a line that runs past its end', () => {
    expect(matches('stop', 'stop it')).toBe(false);
  });

  it('refuses a line that stops short of a part it needs', () => {
    expect(matches('give: <count> <item>', 'give: plank')).toBe(false);
    expect(matches('give: <item>', 'give: plank')).toBe(true);
  });

  it('takes an optional part either way', () => {
    expect(matches('inflict: <buff>[ on <party>]', 'inflict: dazzled')).toBe(true);
    expect(matches('inflict: <buff>[ on <party>]', 'inflict: dazzled on them')).toBe(true);
  });

  it('takes one value or many where a list trails off', () => {
    expect(matches('adjacent: <location>, …', 'adjacent: beach')).toBe(true);
    expect(matches('adjacent: <location>, …', 'adjacent: beach, cave')).toBe(true);
  });
});

describe('a form read against a line still being written', () => {
  it('stands in the hole the text runs out inside', () => {
    expect(standing('xp: <skill> <amount>', 'xp: min')).toBe('skill');
  });

  it('moves on once the text that ends a hole is written', () => {
    expect(standing('xp: <skill> <amount>', 'xp: mining ')).toBe('amount');
    expect(standing('xp: <skill> <amount>', 'xp: mining 4')).toBe('amount');
  });

  it('stands in a hole that has nothing in it yet', () => {
    expect(align('xp: <skill> <amount>', 'xp: ')?.open).toEqual({ name: 'skill', start: 4, end: 4 });
  });

  it('fits a line that has not reached its first hole', () => {
    expect(fits('xp: <skill> <amount>', 'xp')).toBe(true);
    expect(standing('xp: <skill> <amount>', 'xp')).toBeNull();
  });

  it('fits nothing of another shape', () => {
    expect(fits('xp: <skill> <amount>', 'say: hello')).toBe(false);
  });

  it('says a half-written line is not yet whole', () => {
    expect(align('xp: <skill> <amount>', 'xp: mining')?.complete).toBe(false);
    expect(align('xp: <skill> <amount>', 'xp: mining 4')?.complete).toBe(true);
  });
});

describe('a form read against its own example', () => {
  it('cuts the example into what each hole holds', () => {
    const holes = holesIn('xp: <skill> <amount>', 'xp: mining 4-7')!;
    expect(holes.map((hole) => [hole.name, valueIn('xp: mining 4-7', hole)])).toEqual([
      ['skill', 'mining'],
      ['amount', '4-7'],
    ]);
  });

  it('stands something else in one hole and leaves the rest alone', () => {
    const holes = holesIn('xp: <skill> <amount>', 'xp: mining 4-7')!;
    expect(standingIn('xp: mining 4-7', holes[0]!, 'probe')).toBe('xp: probe 4-7');
  });

  it('finds nothing where the example is not the form', () => {
    expect(holesIn('give: <count> <item>', 'give: plank')).toBeNull();
  });
});
