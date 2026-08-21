import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { stageNow } from '../content/sections/quest';
import { evaluateCondition } from './conditions';
import { journal } from './journal';
import { createGameState } from './runtime';
import { runTest } from './session';
import type { GameState } from './state';

const WORLD = ['# location shore', 'x: 0, y: 0', 'starting', '', '# flag mirror-done', '', '# entity miki', 'title: Miki'].join('\n');

const QUEST = [
  '# quest finding-your-feet',
  'title: Finding Your Feet',
  '',
  'stage offered:',
  '  log: Miki offered to show you the ropes.',
  '  hint: Talk to Miki.',
  '  miki says:',
  '    Welcome to the island.',
  '    -> Sounds good.',
  '      goto name-yourself',
  '',
  'stage name-yourself:',
  '  log: Miki wants you to name yourself.',
  '  done when: mirror-done',
  '  goto sendoff',
  '',
  'stage sendoff:',
  '  log: You saw Miki off.',
  '  complete',
].join('\n');

const registry = loadInEnglish([WORLD, QUEST].join('\n\n'));

const held = (...set: string[]): GameState => {
  const state = createGameState();
  for (const flag of set) state.flags[flag] = true;
  return state;
};

// The condition a stage compiles to is derived and evaluated, never written down, so what is held to account here is where the quest stands rather than how that condition prints.
const standing = (...set: string[]): string | undefined => stageNow(registry.quests.get('finding-your-feet')!, (asked) => evaluateCondition(asked, held(...set)))?.name;

describe('where a quest stands', () => {
  it('is its first stage before anything has happened, and moves as stages are reached', () => {
    expect(standing()).toBe('offered');
    expect(standing('finding-your-feet.offered')).toBe('offered');
    expect(standing('finding-your-feet.offered', 'finding-your-feet.name-yourself')).toBe('name-yourself');
  });

  // Nothing runs to move a quest on: a stage that says when it is done is simply no longer the one standing once that holds.
  it('leaves a stage on its own once that stage says it is done', () => {
    expect(standing('finding-your-feet.name-yourself')).toBe('name-yourself');
    expect(standing('finding-your-feet.name-yourself', 'mirror-done')).toBe('sendoff');
  });
});

describe('the journal', () => {
  it('holds nothing for a quest nobody has reached a stage of, whatever the world declares', () => {
    expect(journal(registry, held())).toEqual([]);
  });

  it('reads the log and the hint of the stage the quest stands on', () => {
    expect(journal(registry, held('finding-your-feet.offered'))).toEqual([
      { quest: 'finding-your-feet', title: 'Finding Your Feet', stage: 'offered', log: 'Miki offered to show you the ropes.', hint: 'Talk to Miki.', complete: false },
    ]);
  });

  it('follows the quest to the stage it has reached, and says when it is done', () => {
    expect(journal(registry, held('finding-your-feet.name-yourself'))).toMatchObject([{ stage: 'name-yourself', log: 'Miki wants you to name yourself.', hint: null, complete: false }]);
    expect(journal(registry, held('finding-your-feet.name-yourself', 'mirror-done'))).toMatchObject([{ stage: 'sendoff', log: 'You saw Miki off.', complete: true }]);
  });
});

describe('a quest played through', () => {
  // The whole route: the entity is spoken to, the quest's own lines are the ones reached, and taking a choice moves the quest and the journal with it.
  const PLAYED = [WORLD, QUEST, '', '# test takes-the-offer', 'talk: miki', 'choose: 0', 'assert: finding-your-feet.name-yourself'].join('\n\n');

  it("reaches the quest's lines through the entity it named, and moves on the choice taken", () => {
    const played = loadInEnglish(PLAYED);
    const state = createGameState();

    expect(runTest('takes-the-offer', played, state)).toEqual({ passed: true });
    expect(state.flags['finding-your-feet.offered']).toBe(true);
    expect(journal(played, state)).toMatchObject([{ stage: 'name-yourself', log: 'Miki wants you to name yourself.' }]);
  });
});
