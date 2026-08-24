import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { NOTE_FIELDS, parseDirectiveLine, printDirective } from '../content/sections/test';
import { createGameState } from './runtime';
import { runTest, startSession, testSteps, view, walkTest } from './session';

// A recorded playtest is a `# test` and a `# test` is a recorded playtest — the difference is only
// whether the replay is expected to match the record. These are the lines a recording writes that
// an authored proof never did, and what running one over them means.

const WORLD = ['# location shore', 'x: 0, y: 0', 'starting', '', '# location cove', 'x: 1, y: 0', '', '# entity miki', 'title: Miki'].join('\n');

const ran = (...lines: string[]) => runTest('recorded', loadInEnglish([WORLD, '', '# test recorded', ...lines].join('\n')), createGameState());

describe('a body line the engine has no opinion about', () => {
  for (const field of NOTE_FIELDS) {
    it(`carries what the player said in ${field.name}: without changing the run`, () => {
      expect(ran(`${field.name}: the cove is over there but nothing says how far`)).toEqual({ passed: true });
    });
  }

  it('takes a note holding the word a terminator is spelled with as a note, not as a loop', () => {
    expect(parseDirectiveLine('note: I kept swinging until resource.health < 10')).toEqual({ kind: 'note', field: 'note', text: 'I kept swinging until resource.health < 10' });
  });

  it('passes over a page the app moved to, having no pages of its own', () => {
    expect(ran('page: character/inventory', 'goto: cove')).toEqual({ passed: true });
  });
});

describe('refused', () => {
  it('claims the refusal the line above it got, and the run carries on', () => {
    expect(ran('choose: 0', 'refused', 'goto: cove')).toEqual({ passed: true });
  });

  it('fails where the line above it took, which is how a fix is seen to have landed', () => {
    expect(ran('goto: cove', 'refused').failure).toContain('goto: cove was not refused');
  });

  // Refused at load rather than at run: a mark about nothing reads exactly like a mark about
  // something, and an author who wrote one should hear about it where they wrote it.
  it('is refused outright standing first, with nothing above it to be about', () => {
    expect(() => ran('refused')).toThrow('nothing stands there');
  });

  it('is refused outright standing under a line the engine was never asked to take', () => {
    expect(() => ran('goto: cove', 'note: went to the cove', 'refused')).toThrow('is not one');
    expect(() => ran('choose: 0', 'refused', 'refused')).toThrow('is not one');
  });

  it('leaves a refusal no line claims failing the run', () => {
    expect(ran('choose: 0', 'goto: cove').passed).toBe(false);
  });

  it('fails a run whose last line was refused and never claimed', () => {
    expect(ran('choose: 0').passed).toBe(false);
  });
});

// The suite, the REPL and the app's replay all drive a `# test`. They drive it through one walk,
// because a replay that stepped a test differently from the way the suite runs it would prove
// something about the replay rather than about the game.
describe('walking a test one step at a time', () => {
  const world = (...lines: string[]) => loadInEnglish([WORLD, '', '# test recorded', ...lines].join('\n'));
  const walking = (registry: ReturnType<typeof loadInEnglish>, upTo?: number) => walkTest(startSession(registry), testSteps('recorded', registry), upTo);

  it('expands a run: where it stands, so what is stepped is what is run', () => {
    const registry = loadInEnglish([WORLD, '', '# test inner', 'goto: cove', '', '# test recorded', 'run: inner', 'goto: shore'].join('\n'));
    expect(testSteps('recorded', registry).map(printDirective)).toEqual(['goto: cove', 'goto: shore']);
  });

  it('refuses a test that runs its way back to itself, once rather than in every driver', () => {
    const registry = loadInEnglish([WORLD, '', '# test recorded', 'run: recorded'].join('\n'));
    expect(() => testSteps('recorded', registry)).toThrow('cyclic test run');
  });

  it('stops where the author asked it to, which is what makes a replay scrubbable', () => {
    const registry = world('goto: cove', 'goto: shore', 'goto: cove');
    expect(walking(registry, 2).walked.map(printDirective)).toEqual(['goto: cove', 'goto: shore']);
    expect(walking(registry, 0).walked).toEqual([]);
  });

  // Going to step N walks from the start again. Nothing in the engine has to undo anything, and a
  // scrub backwards costs exactly what a scrub forwards does.
  it('lands in the same place walking to a step directly as walking past it and back', () => {
    const registry = world('goto: cove', 'goto: shore');
    const once = startSession(registry);
    walkTest(once, testSteps('recorded', registry), 1);

    const again = startSession(registry);
    walkTest(again, testSteps('recorded', registry), 2);
    walkTest(again, testSteps('recorded', registry), 1);

    expect(view(again).location.id).toBe(view(once).location.id);
  });

  it('stops at the first place the world stopped answering the way the record says', () => {
    const registry = world('goto: cove', 'choose: 0', 'goto: shore');
    const walked = walking(registry);
    expect(walked.failure).not.toBeNull();
    expect(walked.walked.map(printDirective)).toEqual(['goto: cove', 'choose: 0']);
  });

  it('agrees with runTest, which is the whole reason there is one walk', () => {
    for (const lines of [['goto: cove'], ['choose: 0', 'refused', 'goto: cove'], ['choose: 0'], ['goto: cove', 'refused']]) {
      const registry = world(...lines);
      expect(runTest('recorded', registry, createGameState()).passed).toBe(walking(registry).failure === null);
    }
  });
});
