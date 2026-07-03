import { describe, expect, it } from 'vitest';
import { skillLevelFromXp, xpRequiredForLevel, xpRequiredForNextLevel } from './skills';

describe('experience curve', () => {
  it('starts at 1000 XP and doubles each 10 levels by default', () => {
    expect(xpRequiredForNextLevel(1)).toBe(1000);
    expect(xpRequiredForNextLevel(11)).toBe(2000);
  });

  it('converts cumulative XP back into skill levels', () => {
    expect(skillLevelFromXp(999)).toBe(1);
    expect(skillLevelFromXp(1000)).toBe(2);
    expect(skillLevelFromXp(xpRequiredForLevel(10))).toBe(10);
  });
});
