import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { stageNow } from '../content/sections/quest';
import { evaluateCondition } from './conditions';
import { loadUniverse } from '../content/load';
import { fixtureSources } from '../content/worldFixture';
import { journal, standingLine } from './journal';
import { QUEST_STANDINGS } from '../content/sections/quest';
import { standingGroup } from '../content/sections/group';
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

const standing = (...set: string[]): string | undefined => stageNow(registry.quests.get('finding-your-feet')!, (asked) => evaluateCondition(asked, held(...set), registry))?.name;

describe('where a quest stands', () => {
  it('is its first stage before anything has happened, and moves as stages are reached', () => {
    expect(standing()).toBe('offered');
    expect(standing('finding-your-feet.offered')).toBe('offered');
    expect(standing('finding-your-feet.offered', 'finding-your-feet.name-yourself')).toBe('name-yourself');
  });

  it('leaves a stage on its own once that stage says it is done', () => {
    expect(standing('finding-your-feet.name-yourself')).toBe('name-yourself');
    expect(standing('finding-your-feet.name-yourself', 'mirror-done')).toBe('sendoff');
  });
});

describe('the journal', () => {
  const shown = (...set: string[]) => journal(registry, held(...set));

  it('holds a quest nobody has begun, saying so rather than reading out what has not happened', () => {
    expect(shown()).toEqual([{ quest: 'finding-your-feet', title: 'Finding Your Feet', stage: 'offered', standing: 'unstarted', lines: [] }]);
  });

  it('reads a line for each stage the quest has been through, crossing off all but the one it stands on', () => {
    expect(shown('finding-your-feet.offered')).toMatchObject([
      {
        standing: 'started',
        stage: 'offered',
        lines: [{ stage: 'offered', said: 'Miki offered to show you the ropes.', struck: false }],
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

    expect(over).toMatchObject({ standing: 'complete', stage: 'sendoff' });
    expect(over!.lines.every((line) => line.struck)).toBe(true);
    expect(over!.lines.map((line) => line.stage)).toEqual(['offered', 'name-yourself', 'sendoff']);
  });
});

const TWO_BEATS = [
  '# quest fetch-the-loaf',
  'title: Fetch the Loaf',
  'log: Someone in the house is asking after bread.',
  '',
  'stage baking:',
  '  log: You said you would bake a loaf.',
  '  miki says:',
  '    Well?',
  '    -> Here it is.',
  '      goto handed-over',
  '',
  'stage handed-over:',
  '  log: The loaf changed hands.',
  '  complete',
].join('\n');

describe('the line a quest is standing on', () => {
  const twoBeats = loadInEnglish([WORLD, TWO_BEATS].join('\n\n'));
  const standingOn = (...set: string[]): string | null => {
    const line = standingLine(journal(twoBeats, held(...set))[0]!);
    return line === null ? null : String(line);
  };

  it("is the log of the stage the quest stands on, and holds across both beats of a stage that spans two", () => {
    expect(standingOn('fetch-the-loaf.baking')).toBe('You said you would bake a loaf.');
    expect(standingOn('fetch-the-loaf.baking', 'loaf-baked')).toBe('You said you would bake a loaf.');
  });

  it("is the quest's own log before anything of it has happened", () => {
    expect(standingOn()).toBe('Someone in the house is asking after bread.');
  });

  it('is nothing once the quest is finished, because every line of it is crossed off', () => {
    expect(standingOn('fetch-the-loaf.baking', 'fetch-the-loaf.handed-over')).toBeNull();
  });
});

describe('journal: lets a # test claim what the journal currently reads', () => {
  const withTest = (id: string, ...lines: string[]) => loadInEnglish([WORLD, TWO_BEATS, '', `# test ${id}`, ...lines].join('\n\n'));

  it('passes when the words match the line the journal is standing on', () => {
    const played = withTest('matches', 'journal: fetch-the-loaf says Someone in the house is asking after bread.');
    expect(runTest('matches', played, createGameState())).toEqual({ passed: true });
  });

  it('fails naming what the journal actually said', () => {
    const played = withTest('mismatch', 'journal: fetch-the-loaf says Something else entirely.');
    const result = runTest('mismatch', played, createGameState());

    expect(result.passed).toBe(false);
    expect(result.failure).toContain('Someone in the house is asking after bread.');
  });

  it('moves to the new line once the quest has moved on, leaving the one behind it crossed off', () => {
    const played = withTest('after-stage', 'journal: fetch-the-loaf says You said you would bake a loaf.');
    expect(runTest('after-stage', played, held('fetch-the-loaf.baking'))).toEqual({ passed: true });
  });

  it('rejects an unknown quest id at load, the way every other directive names its reference', () => {
    expect(() => loadInEnglish([WORLD, TWO_BEATS, '', '# test bad', 'journal: no-such-quest says Anything.'].join('\n\n'))).toThrow();
  });
});

describe('a quest played through', () => {
  const PLAYED = [WORLD, QUEST, '', '# test takes-the-offer', 'talk: miki', 'choose: 0', 'assert: finding-your-feet.name-yourself'].join('\n\n');

  it("reaches the quest's lines through the entity it named, and moves on the choice taken", () => {
    const played = loadInEnglish(PLAYED);
    const state = createGameState();

    expect(runTest('takes-the-offer', played, state)).toEqual({ passed: true });
    expect(state.flags['finding-your-feet.offered']).toBe(true);
    expect(journal(played, state)).toMatchObject([{ stage: 'name-yourself', standing: 'started', lines: [{ said: 'Miki offered to show you the ropes.', struck: true }, { said: 'Miki wants you to name yourself.', struck: false }] }]);
  });
});

describe('where a quest stands reaches a surface as a group', () => {
  const world = loadUniverse(fixtureSources());
  const STANDINGS = [...QUEST_STANDINGS];

  it('finds a group the world says it stands for, and a colour for each', () => {
    expect(STANDINGS.flatMap((each) => (standingGroup(world.groups, each)?.colour ? [] : [`nothing in the world says it stands for ${each}, or what says so declares no colour`]))).toEqual([]);
  });

  it('is a different colour for every one of them, so no two standings read alike', () => {
    const colours = STANDINGS.map((each) => standingGroup(world.groups, each)!.colour);

    expect(new Set(colours).size).toBe(STANDINGS.length);
  });

  it('publishes it on every entry the journal carries', () => {
    const state = createGameState();
    state.location = [...world.locations.values()].find((each) => each.starting)!.id;
    const entries = journal(world, state);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((entry) => entry.group?.colour)).toEqual(entries.map((entry) => standingGroup(world.groups, entry.standing)!.colour));
  });

  it('draws nothing where a world says which group means nothing', () => {
    const silent = loadUniverse(fixtureSources().map((each) => ({ ...each, text: each.text.replace(/^stands for: .*$/gm, '') })));
    const state = createGameState();
    state.location = [...silent.locations.values()].find((each) => each.starting)!.id;

    expect(journal(silent, state).map((entry) => entry.group)).toEqual(journal(silent, state).map(() => undefined));
  });
});

describe('the journal costs no more the deeper a quest runs', () => {
  const chain = (id: string, stages: number): string =>
    [
      `# quest ${id}`,
      `title: Quest ${id}`,
      ...Array.from({ length: stages }, (_, at) => [`stage s${at}:`, `  log: stage ${at}`, ...(at + 1 < stages ? [`  done when: time >= ${at + 1}`, `  goto s${at + 1}`] : ['  complete'])]).flat(),
    ].join('\n');

  const walked = (stages: number): number => {
    const world = loadInEnglish([WORLD, chain('deep', stages)].join('\n\n'));
    const state = createGameState();
    state.location = 'shore';
    journal(world, state);
    const at = performance.now();
    for (let round = 0; round < 20; round += 1) journal(world, state);
    return (performance.now() - at) / 20;
  };

  it('reaches a stage by deriving each stage it stands on once, not once per path that reaches it', () => {
    const shallow = Math.max(walked(12), 0.01);
    const deep = walked(24);

    expect(journal(loadInEnglish([WORLD, chain('deep', 24)].join('\n\n')), Object.assign(createGameState(), { location: 'shore' })).length).toBe(1);
    expect(deep / shallow, `twice the stages cost ${(deep / shallow).toFixed(1)}x, which is the shape of a walk that doubles per stage`).toBeLessThan(50);
  });
});
