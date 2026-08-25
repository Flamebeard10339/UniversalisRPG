import { describe, expect, it } from 'vitest';
import { armAction, createGameState, GameState, initResources, resolve } from './runtime';
import { loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { secondsToMs } from './units';

const MODULE =
  FIXTURE_WORLD +
  `
# resource health
max: max-health

# skill lore

# event levelled
title: Levelled
trigger: level-up

# action train
title: train
continuous
time: 1
xp: lore 1000

# action train-until-level
title: train until level
continuous
time: 1
stops on: levelled
xp: lore 1000

# entity player
skills: lore
`;

const registry = loadInEnglish(MODULE);

function ran(action: string, seconds: number): GameState {
  const state = createGameState('camp');
  initResources(state, registry);
  armAction('action', action, action, registry, state);
  for (let second = 1; second <= seconds; second += 1) resolve(state, registry, secondsToMs(second));
  return state;
}

describe('an action ends on the events it names, and on none it does not', () => {
  it('runs the whole five seconds and banks 5000 experience where it names nothing', () => {
    const state = ran('train', 5);
    expect(state.xp.lore).toBe(5000);
    expect(state.activeAction).not.toBeNull();
  });

  it('stops at the first level-up, 1000 experience in, where it names the event that fires there', () => {
    const state = ran('train-until-level', 5);
    expect(state.xp.lore).toBe(1000);
    expect(state.activeAction).toBeNull();
  });

  it('refuses an event nothing declares, so a hook that would never fire is not a line that loads', () => {
    expect(() => loadInEnglish(MODULE.replace('stops on: levelled', 'stops on: no-such-moment'))).toThrow(/no-such-moment/);
  });
});
