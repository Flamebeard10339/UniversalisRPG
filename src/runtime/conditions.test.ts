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

# quest open-one
stage waiting:
  done when: open-two.arrived or always
  goto arrived
stage arrived:
  complete

# quest open-two
stage waiting:
  done when: open-one.arrived
  goto arrived
stage arrived:
  complete

# quest reads-both
stage waiting:
  done when: open-one.arrived and open-two.arrived
  goto arrived
stage arrived:
  complete

# quest reads-both-the-other-way
stage waiting:
  done when: open-two.arrived and open-one.arrived
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
  it('reads one store two ways: a point under the second threshold is level 1, and the threshold itself is level 2', () => {
    const threshold = xpForLevel(2);
    expect(holds(`xp.mining >= ${threshold}`, at(threshold - 1))).toBe(false);
    expect(holds('level.mining >= 2', at(threshold - 1))).toBe(false);
    expect(holds('level.mining = 1', at(threshold - 1))).toBe(true);
    expect(holds('level.mining >= 2', at(threshold))).toBe(true);
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

  it('counts a skill the module asking about it never named', () => {
    expect(holds('highest-level >= 2', practised({ 'a-skill-written-next-month': xpForLevel(2) }))).toBe(true);
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

  it('answers a stage reached through two quests the same whichever of them is asked about first', () => {
    const state = createGameState('camp');
    expect(asks('open-one.arrived', state), 'the one that leaves on its own').toBe(true);
    expect(asks('open-two.arrived', state), 'the one waiting on it').toBe(true);

    expect(asks('reads-both.arrived', createGameState('camp'))).toBe(true);
    expect(asks('reads-both-the-other-way.arrived', createGameState('camp'))).toBe(true);
    expect(asks('reads-both.arrived', state)).toBe(asks('reads-both-the-other-way.arrived', state));
  });
});
