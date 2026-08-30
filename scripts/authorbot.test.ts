import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEBUG_SWITCH_NAMES } from '../src/content/sections/test';
import { parseArgs, refusalFor, summaryLines, systemFor, verdictOf, type Reach } from './authorbot';

const REPO = path.resolve('/repo');
const WORK = path.resolve('/work');
const asked = (over: Partial<ReturnType<typeof parseArgs>> = {}) => ({ ...parseArgs(['--brief', 'brief.md']), ...over });

describe('what the run was asked for', () => {
  it('takes the brief as a file, since a brief that arrives as one line cannot be told from one that was', () => {
    expect(parseArgs(['--brief', 'quest.md'])).toEqual({ brief: 'quest.md', target: 'local-changes.dsl', open: false, turns: 80, model: 'claude-sonnet-5' });
  });

  it('refuses to run without one, rather than inventing something to write', () => {
    expect(() => parseArgs([])).toThrow(/--brief names the file/);
  });

  it('will not read the next flag as the value of the one before it', () => {
    expect(() => parseArgs(['--brief', '--open'])).toThrow(/--brief wants a value/);
    expect(() => parseArgs(['--brief', 'b.md', '--turns', '--open'])).toThrow(/--turns wants a value/);
  });

  it('takes a count where a count is meant and says so where it is not', () => {
    expect(parseArgs(['--brief', 'b.md', '--turns', '12']).turns).toBe(12);
    expect(() => parseArgs(['--brief', 'b.md', '--turns', 'lots'])).toThrow(/takes a count/);
    expect(() => parseArgs(['--brief', 'b.md', '--turns', '0'])).toThrow(/takes a count/);
  });

  it('reads the other flags, and refuses a loose word rather than guessing what it meant', () => {
    expect(parseArgs(['--brief', 'b.md', '--open', '--target', 'tulsa.dsl', '--model', 'claude-opus-5'])).toMatchObject({ open: true, target: 'tulsa.dsl', model: 'claude-opus-5' });
    expect(() => parseArgs(['--brief', 'b.md', 'tulsa'])).toThrow(/nothing is read off a loose word/);
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
      { turn: 1, tool: 'Bash', target: 'npm run oracle', decision: 'allow' },
      { turn: 4, tool: 'Read', target: 'src/runtime/runtime.ts', decision: 'engine' },
      { turn: 6, tool: 'Grep', target: 'src/content', decision: 'deny' },
    ];
    const said = summaryLines(reaches, cost, '/work').join('\n');

    expect(said).toContain('2 reach(es) for the engine');
    expect(said).toContain('reply 4: Read src/runtime/runtime.ts');
    expect(said).toContain('reply 6: refused — Grep src/content');
    expect(said).not.toContain('npm run oracle');
  });

  it('says so plainly where it never reached at all, which is the answer the run is looking for', () => {
    const said = summaryLines([{ turn: 1, tool: 'Bash', target: 'npm run oracle', decision: 'allow' }], cost, '/work').join('\n');

    expect(said).toContain('it never reached for the engine');
  });

  it('leaves the tokens unsaid rather than printing four zeroes, which reads like a run that was free', () => {
    expect(summaryLines([], { ...cost, usage: undefined }, '/work').join('\n')).toContain('nothing billed');
  });
});
