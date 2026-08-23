import { describe, expect, it } from 'vitest';
import { fillPercent, formatClock, remainingBadge, tidy } from './format';

describe('the readouts', () => {
  it('reads simulated seconds as a clock, dropping the hour until there is one', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9.6)).toBe('0:09');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('holds a meter inside its track whatever the engine reports', () => {
    expect(fillPercent(15, 30)).toBe(50);
    expect(fillPercent(40, 30)).toBe(100);
    expect(fillPercent(-1, 30)).toBe(0);
    expect(fillPercent(5, 0)).toBe(0);
  });

  it('spends a decimal place only on a value that has one', () => {
    expect(tidy(30)).toBe('30');
    expect(tidy(29.55)).toBe('29.6');
  });

  it('marks a foe pool with the count still standing, and says nothing where there is no count', () => {
    expect(remainingBadge(null)).toBeNull();
    expect(remainingBadge(3)).toBe('×3');
    expect(remainingBadge(1)).toBe('×1');
  });
});
