import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { stageNow } from '../content/sections/quest';
import { evaluateCondition } from './conditions';
import { journal } from './journal';
import { createGameState } from './runtime';
import { runTest } from './session';
import type { GameState } from './state';

const WORLD = ['# location shore', 'x: 0, y: 0', 'starting', '', '# flag mirror-done', '', '# flag loaf-baked', '', '# flag met-someone', '', '# entity miki', 'title: Miki'].join('\n');

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
const standing = (...set: string[]): string | undefined => stageNow(registry.quests.get('finding-your-feet')!, (asked) => evaluateCondition(asked, held(...set), registry))?.name;

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
  const shown = (...set: string[]) => journal(registry, held(...set));

  // Every quest the world declares is in the list, whether or not the player has touched it: that is how they learn there is one.
  it('holds a quest nobody has begun, saying so rather than reading out what has not happened', () => {
    expect(shown()).toEqual([{ quest: 'finding-your-feet', title: 'Finding Your Feet', stage: 'offered', standing: 'unstarted', lines: [], hint: null }]);
  });

  it('reads a line for each stage the quest has been through, crossing off all but the one it stands on', () => {
    expect(shown('finding-your-feet.offered')).toMatchObject([
      {
        standing: 'started',
        stage: 'offered',
        lines: [{ stage: 'offered', said: 'Miki offered to show you the ropes.', struck: false }],
        hint: 'Talk to Miki.',
      },
    ]);
    expect(shown('finding-your-feet.offered', 'finding-your-feet.name-yourself')).toMatchObject([
      {
        standing: 'started',
        stage: 'name-yourself',
        lines: [
          { stage: 'offered', said: 'Miki offered to show you the ropes.', struck: true },
          { stage: 'name-yourself', said: 'Miki wants you to name yourself.', struck: false },
        ],
      },
    ]);
  });

  it('crosses off everything once the quest is done, and offers nothing further to do', () => {
    const [over] = shown('finding-your-feet.offered', 'finding-your-feet.name-yourself', 'mirror-done');

    expect(over).toMatchObject({ standing: 'complete', stage: 'sendoff', hint: null });
    expect(over!.lines.every((line) => line.struck)).toBe(true);
    expect(over!.lines.map((line) => line.stage)).toEqual(['offered', 'name-yourself', 'sendoff']);
  });
});

// A stage left by a line an entity says stands over more than one beat — bake the loaf, then carry it back — so no one string is right for the whole of it. The same is true of a quest nobody has begun, whose hint has to survive until whatever begins it comes round.
const TWO_BEATS = [
  '# quest fetch-the-loaf',
  'title: Fetch the Loaf',
  'log: Someone in the house is asking after bread.',
  'hint: Find whoever is asking.',
  'hint when met-someone: They want a loaf. Go back and say yes.',
  '',
  'stage baking:',
  '  log: You said you would bake a loaf.',
  '  hint: Knead the dough, then bake it in the oven.',
  '  hint when loaf-baked: Take the loaf back to Miki.',
  '  miki says:',
  '    Well?',
  '    -> Here it is.',
  '      goto handed-over',
  '',
  'stage handed-over:',
  '  log: The loaf changed hands.',
  '  complete',
].join('\n');

describe('what the journal says there is left to do', () => {
  const twoBeats = loadInEnglish([WORLD, TWO_BEATS].join('\n\n'));
  const hintOf = (...set: string[]): string | null => journal(twoBeats, held(...set))[0]!.hint;

  it('is the last hint whose condition holds, so a plain hint: is the default and each hint when under it is an exception', () => {
    expect(hintOf('fetch-the-loaf.baking')).toBe('Knead the dough, then bake it in the oven.');
    expect(hintOf('fetch-the-loaf.baking', 'loaf-baked')).toBe('Take the loaf back to Miki.');
  });

  // The same gap, one level up: a quest nobody has begun reads its own hint, and that hint has to survive until whatever begins it comes round.
  it('reads the quest own hints the same way before anything of it has happened', () => {
    expect(hintOf()).toBe('Find whoever is asking.');
    expect(hintOf('met-someone')).toBe('They want a loaf. Go back and say yes.');
  });

  // What a hint is gated on says nothing about a quest that is over: there is nothing left to do, whatever still holds.
  it('offers nothing once the quest is finished, whatever a hint of it was gated on', () => {
    expect(hintOf('fetch-the-loaf.baking', 'fetch-the-loaf.handed-over', 'loaf-baked')).toBeNull();
  });
});

describe('journal: lets a # test claim what the journal currently reads', () => {
  const withTest = (id: string, ...lines: string[]) => loadInEnglish([WORLD, TWO_BEATS, '', `# test ${id}`, ...lines].join('\n\n'));

  it('passes when the words match the hint the journal is currently showing', () => {
    const played = withTest('matches', 'journal: fetch-the-loaf says Find whoever is asking.');
    expect(runTest('matches', played, createGameState())).toEqual({ passed: true });
  });

  it('fails naming what the journal actually said', () => {
    const played = withTest('mismatch', 'journal: fetch-the-loaf says Something else entirely.');
    const result = runTest('mismatch', played, createGameState());

    expect(result.passed).toBe(false);
    expect(result.failure).toContain('Find whoever is asking.');
  });

  it('reads the hint a `hint when` condition picked, once state holds it', () => {
    const played = withTest('after-flag', 'journal: fetch-the-loaf says They want a loaf. Go back and say yes.');
    expect(runTest('after-flag', played, held('met-someone'))).toEqual({ passed: true });
  });

  it('rejects an unknown quest id at load, the way every other directive names its reference', () => {
    expect(() => loadInEnglish([WORLD, TWO_BEATS, '', '# test bad', 'journal: no-such-quest says Anything.'].join('\n\n'))).toThrow();
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
    expect(journal(played, state)).toMatchObject([{ stage: 'name-yourself', standing: 'started', lines: [{ said: 'Miki offered to show you the ropes.', struck: true }, { said: 'Miki wants you to name yourself.', struck: false }] }]);
  });
});
