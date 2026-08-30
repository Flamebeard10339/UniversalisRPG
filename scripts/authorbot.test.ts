import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORPUS_DIR, shippedFiles } from '../src/content/shipped';
import { DEBUG_SWITCH_NAMES } from '../src/content/sections/test';
import { CIRCLING_DISTINCT, CIRCLING_WINDOW, DEFAULT_TURNS, parseArgs, refusalFor, statusLines, statusOf, summaryLines, systemFor, targetFor, verdictOf, workdirFor, type Reach } from './authorbot';

const REPO = path.resolve('/repo');
const WORK = path.resolve('/work');
const asked = (over: Partial<ReturnType<typeof parseArgs>> = {}) => ({ ...parseArgs(['brief.md']), ...over });

describe('what the run was asked for', () => {
  it('is one loose word, since the brief and the module it writes were the same word twice', () => {
    expect(parseArgs(['planning/A Grand Blade.md'])).toEqual({ brief: 'planning/A Grand Blade.md', target: 'a-grand-blade.dsl', open: false, turns: DEFAULT_TURNS, model: 'claude-sonnet-5', watch: false });
    expect(parseArgs(['--brief', 'quest.md'])).toMatchObject({ brief: 'quest.md', target: 'quest.dsl' });
  });

  // Not a convention this file invented: it is how the corpus is already named, so the module a
  // brief writes is the one an author would have typed after --target.
  it('names the module the way the shipped corpus is named', () => {
    for (const file of shippedFiles()) expect(targetFor(path.join(CORPUS_DIR, `${path.basename(file, '.dsl')}.md`))).toBe(path.basename(file));
  });

  it('refuses to run without one, rather than inventing something to write', () => {
    expect(() => parseArgs([])).toThrow(/the brief is a file/);
    expect(() => parseArgs(['a.md', 'b.md'])).toThrow(/named once/);
  });

  it('will not read the next flag as the value of the one before it', () => {
    expect(() => parseArgs(['--brief', '--open'])).toThrow(/--brief wants a value/);
    expect(() => parseArgs(['b.md', '--turns', '--open'])).toThrow(/--turns wants a value/);
  });

  it('takes a count where a count is meant and says so where it is not', () => {
    expect(parseArgs(['b.md', '--turns', '12']).turns).toBe(12);
    expect(() => parseArgs(['b.md', '--turns', 'lots'])).toThrow(/takes a count/);
    expect(() => parseArgs(['b.md', '--turns', '0'])).toThrow(/takes a count/);
  });

  it('reads the other flags, and refuses one it does not know rather than guessing what it meant', () => {
    expect(parseArgs(['b.md', '--open', '--target', 'tulsa.dsl', '--model', 'claude-opus-5'])).toMatchObject({ open: true, target: 'tulsa.dsl', model: 'claude-opus-5' });
    expect(() => parseArgs(['b.md', '--sideways'])).toThrow(/unknown flag/);
  });

  it('watches without a brief, since five runs at once are watched by asking after all of them', () => {
    expect(parseArgs(['--watch'])).toMatchObject({ watch: true, brief: null, target: null });
    expect(parseArgs(['--watch', 'b.md'])).toMatchObject({ watch: true, brief: 'b.md' });
  });

  it('runs a brief in the one place named by its own name, so watching it needs nothing kept beside it', () => {
    expect(workdirFor('planning/A Grand Blade.md')).toBe(workdirFor('elsewhere/a-grand-blade.md'));
  });
});

describe('where a run in flight stands', () => {
  const at = 1_000_000;
  const call = (turn: number, tool: string, target: string, over: Partial<Reach> = {}): Reach => ({ turn, tool, target, decision: 'allow', at, ...over });

  it('says how far it has got and how long since it last did anything', () => {
    const said = statusLines(statusOf('rats', [call(1, 'Bash', 'npm run oracle'), call(7, 'Read', 'content/tulsa.dsl')], false, at + 42_000)).join('\n');

    expect(said).toContain('rats — reply 7, 2 call(s), last 42s ago');
  });

  it('says a run is going in circles when it stops making calls it has not already made', () => {
    const looping = Array.from({ length: CIRCLING_WINDOW * 2 }, (_, i) => call(60 + i, i % 2 === 0 ? 'Edit' : 'Bash', i % 2 === 0 ? '/work/content/rats.dsl' : 'npm run probe -- content --test debug'));
    const working = Array.from({ length: CIRCLING_WINDOW * 2 }, (_, i) => call(60 + i, 'Read', `/work/content/room-${i}.dsl`));

    expect(statusLines(statusOf('rats', looping, false, at)).join('\n')).toContain('going in circles: 2 distinct call(s)');
    expect(statusLines(statusOf('rats', working, false, at)).join('\n')).not.toContain('going in circles');
  });

  it('will not call a run circling before it has made enough calls to have repeated itself', () => {
    const few = Array.from({ length: CIRCLING_DISTINCT }, (_, i) => call(i + 1, 'Edit', '/work/content/rats.dsl'));

    expect(statusLines(statusOf('rats', few, false, at)).join('\n')).not.toContain('going in circles');
  });

  it('says plainly that a run has ended, so a finished run does not read as a hung one', () => {
    expect(statusLines(statusOf('rats', [call(3, 'Read', 'a')], true, at + 900_000)).join('\n')).toContain('rats — ended, 3 reply(s)');
    expect(statusLines(statusOf('rats', [], false, at))).toContain('  nothing yet: no tool call has been made');
  });

  it('counts the reaches for the engine while the run is still going, not only in its final report', () => {
    const said = statusLines(statusOf('rats', [call(2, 'Read', 'src/runtime/session.ts', { decision: 'deny' }), call(3, 'Bash', 'npm run oracle')], false, at)).join('\n');

    expect(said).toContain('1 reach(es) for the engine');
  });
});

describe('a call the run makes', () => {
  const reaching = (tool: string, input: Record<string, unknown>) => verdictOf(tool, input, REPO, WORK);

  it('is reaching for the engine wherever it names a directory the engine lives in', () => {
    expect(reaching('Read', { file_path: path.join(REPO, 'src', 'content', 'load.ts') })).toEqual({ reaching: true, why: 'engine' });
    expect(reaching('Grep', { path: path.join(REPO, 'scripts') })).toEqual({ reaching: true, why: 'engine' });
    expect(reaching('Glob', { pattern: 'docs/**' })).toEqual({ reaching: true, why: 'engine' });
  });

  it('is reaching for it through a command as readily as through a file, since a grep is a read', () => {
    expect(reaching('Bash', { command: 'grep -rn "food" src/runtime' })).toEqual({ reaching: true, why: 'engine' });
    expect(reaching('Bash', { command: 'sed -n 1,40p scripts/oracle.ts' })).toEqual({ reaching: true, why: 'engine' });
  });

  it('is not reaching for it where it asks the oracle, reads the corpus, or runs a test', () => {
    expect(reaching('Bash', { command: 'npm run oracle -- quest' })).toEqual({ reaching: false });
    expect(reaching('Bash', { command: `npm run probe -- ${path.join(WORK, 'content')} --test a-route` })).toEqual({ reaching: false });
    expect(reaching('Read', { file_path: path.join(WORK, 'content', 'tulsa.dsl') })).toEqual({ reaching: false });
    expect(reaching('Read', { file_path: path.join(REPO, 'content', 'tulsa.dsl') })).toEqual({ reaching: false });
  });

  it('is writing where it may not wherever it writes outside the copy it was given', () => {
    expect(reaching('Write', { file_path: path.join(REPO, 'content', 'tulsa.dsl') })).toEqual({ reaching: true, why: 'elsewhere' });
    expect(reaching('Edit', { file_path: path.join(WORK, 'content', 'tulsa.dsl') })).toEqual({ reaching: false });
  });

  it('is told what to do instead, since a refusal that only says no teaches the run nothing', () => {
    expect(refusalFor('engine', '/work/content/x.dsl')).toContain('npm run oracle');
    expect(refusalFor('elsewhere', '/work/content/x.dsl')).toContain('/work/content/x.dsl');
  });
});

describe('what the run is told', () => {
  it('hands over the balance tool as well as the oracle, since what a number is worth is the one thing the oracle has no opinion about', () => {
    const said = systemFor(asked(), '/work/content', '/work/content/x.dsl');

    expect(said).toContain('npm run oracle');
    expect(said).toContain('npm run probe');
    expect(said).toContain('npm run balance');
  });

  it('hands over every debug switch the kind offers, so a route the engine grows one for is not written past it', () => {
    const said = systemFor(asked(), '/work/content', '/work/content/x.dsl');

    for (const name of DEBUG_SWITCH_NAMES) expect(said).toContain(name);
    expect(said).toContain('Balance is not yours to settle');
  });

  it('says the engine is off limits, or that it is not, and never both', () => {
    expect(systemFor(asked(), '/c', '/d')).toContain('off limits');
    expect(systemFor(asked({ open: true }), '/c', '/d')).not.toContain('off limits');
  });
});

describe('what the run cost', () => {
  const cost = { turns: 12, seconds: 61.5, calls: 30, usage: { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, output_tokens: 4 } };

  it('lists the reaches rather than counting them, since which question sent it into the engine is the answer', () => {
    const reaches: Reach[] = [
      { turn: 1, tool: 'Bash', target: 'npm run oracle', decision: 'allow', at: 0 },
      { turn: 4, tool: 'Read', target: 'src/runtime/runtime.ts', decision: 'engine', at: 1 },
      { turn: 6, tool: 'Grep', target: 'src/content', decision: 'deny', at: 2 },
    ];
    const said = summaryLines(reaches, cost, '/work').join('\n');

    expect(said).toContain('2 reach(es) for the engine');
    expect(said).toContain('reply 4: Read src/runtime/runtime.ts');
    expect(said).toContain('reply 6: refused — Grep src/content');
    expect(said).not.toContain('npm run oracle');
  });

  it('says so plainly where it never reached at all, which is the answer the run is looking for', () => {
    const said = summaryLines([{ turn: 1, tool: 'Bash', target: 'npm run oracle', decision: 'allow', at: 0 }], cost, '/work').join('\n');

    expect(said).toContain('it never reached for the engine');
  });

  it('leaves the tokens unsaid rather than printing four zeroes, which reads like a run that was free', () => {
    expect(summaryLines([], { ...cost, usage: undefined }, '/work').join('\n')).toContain('nothing billed');
  });
});
