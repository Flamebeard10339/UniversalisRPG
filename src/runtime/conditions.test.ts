import { describe, expect, it } from 'vitest';
import { condition } from '../grammar/condition';
import { evaluateCondition } from './conditions';
import { loadInEnglish } from '../content/engineLocale';
import { parseWhole } from '../grammar/parser';
import { createGameState, GameState } from './runtime';
import { Registry } from '../content/registry';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { xpForLevel } from './skills';

const MODULE =
  FIXTURE_WORLD +
  `
# skill mining
`;

const registry: Registry = loadInEnglish(MODULE);

function at(experience: number): GameState {
  const state = createGameState('camp');
  state.xp.mining = experience;
  return state;
}

const holds = (written: string, state: GameState): boolean => evaluateCondition(parseWhole(condition, written, 0, 'a condition'), state, registry);

describe('level.<skill> reads the level the experience has bought', () => {
  it('turns the same 999 experience that reads under 1000 as xp into level 1', () => {
    expect(xpForLevel(2)).toBe(1000);
    expect(holds('xp.mining >= 1000', at(999))).toBe(false);
    expect(holds('level.mining >= 2', at(999))).toBe(false);
    expect(holds('level.mining = 1', at(999))).toBe(true);
  });

  it('reaches level 2 on the 1000th point and not on the 999th', () => {
    expect(holds('level.mining >= 2', at(xpForLevel(2) - 1))).toBe(false);
    expect(holds('level.mining >= 2', at(xpForLevel(2)))).toBe(true);
  });

  it('reads a skill nothing has practised as level 1 rather than as absent', () => {
    expect(holds('level.mining = 1', createGameState('camp'))).toBe(true);
  });
});

describe('highest-level is a bound on any one skill', () => {
  const practised = (xp: Record<string, number>): GameState => {
    const state = createGameState('camp');
    state.xp = xp;
    return state;
  };

  it('stands at the highest of the skills practised, not the last or the sum of them', () => {
    expect(holds('highest-level >= 2', practised({ mining: xpForLevel(4), fishing: 0 }))).toBe(true);
    expect(holds('highest-level >= 4', practised({ mining: xpForLevel(4), fishing: 0 }))).toBe(true);
    expect(holds('highest-level >= 5', practised({ mining: xpForLevel(4), fishing: 0 }))).toBe(false);
    expect(holds('highest-level >= 3', practised({ mining: xpForLevel(2), fishing: xpForLevel(2) }))).toBe(false);
  });

  it('stands at level 1 on a run that has practised nothing, the level every skill starts on', () => {
    expect(holds('highest-level = 1', createGameState('camp'))).toBe(true);
    expect(holds('highest-level >= 2', createGameState('camp'))).toBe(false);
  });

  // The whole of why this root exists rather than a disjunction an author writes out: a skill the world
  // gains after the condition was written is one the condition already counts.
  it('counts a skill the module asking about it never named', () => {
    expect(holds('highest-level >= 2', practised({ 'a-skill-written-next-month': xpForLevel(2) }))).toBe(true);
  });
});
