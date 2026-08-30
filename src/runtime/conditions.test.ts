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

// Two quests left by nothing but a `done when:`, and a third pair each of which waits on the other.
const QUESTS =
  FIXTURE_WORLD +
  `
# flag struck

# quest errand
stage asked:
  done when: struck
  goto run
stage run:
  complete

# quest circle-one
stage waiting:
  done when: circle-two.arrived
  goto arrived
stage arrived:
  complete

# quest circle-two
stage waiting:
  done when: circle-one.arrived
  goto arrived
stage arrived:
  complete
`;

const quests: Registry = loadInEnglish(QUESTS);

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

describe('a quest stage flag reads as the stage having been reached', () => {
  const asks = (written: string, state: GameState): boolean => evaluateCondition(parseWhole(condition, written, 0, 'a condition'), state, quests);

  it('reads the stage a done when: leaves for, with nothing having set its flag', () => {
    const state = createGameState('camp');
    expect(asks('errand.run', state)).toBe(false);
    state.flags.struck = true;
    expect(asks('errand.run', state)).toBe(true);
    expect(state.flags['errand.run']).toBeUndefined();
  });

  it('still reads a flag really set, whatever the done when: says', () => {
    const state = createGameState('camp');
    state.flags['errand.run'] = true;
    expect(asks('errand.run', state)).toBe(true);
  });

  it('reads two quests each waiting on the other as neither of them arriving', () => {
    expect(asks('circle-one.arrived', createGameState('camp'))).toBe(false);
  });
});
