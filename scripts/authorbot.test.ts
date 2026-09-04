import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURE_CORPUS_DIR, fixtureFiles } from '../src/content/worldFixture';
import { DEBUG_SWITCH_NAMES } from '../src/content/sections/test';
import { ASK_LINE, ASKED_FOR_MINUTES, ENGINE_DIRS, ENGINE_IS_OFF_LIMITS } from './lib/ask';
import { foldersOf } from './floors';
import { CIRCLING_DISTINCT, CIRCLING_WINDOW, DEFAULT_TURNS, inLastMinute, parseArgs, refusalFor, statusLines, statusOf, summaryLines, systemFor, targetFor, verdictOf, workdirFor, type Reach } from './authorbot';

const REPO = path.resolve('/repo');
const WORK = path.resolve('/work');
const asked = (over: Partial<ReturnType<typeof parseArgs>> = {}) => ({ ...parseArgs(['brief.md']), ...over });

describe('what the run was asked for', () => {
  it('is one loose word, since the brief and the module it writes were the same word twice', () => {
    expect(parseArgs(['planning/A Grand Blade.md'])).toEqual({ brief: 'planning/A Grand Blade.md', target: 'a-grand-blade.dsl', open: false, turns: DEFAULT_TURNS, minutes: null, model: 'claude-sonnet-5', watch: false, once: false, askFor: ASKED_FOR_MINUTES, said: null, floors: false });
    expect(parseArgs(['--brief', 'quest.md'])).toMatchObject({ brief: 'quest.md', target: 'quest.dsl' });
  });

  it('names the module the way a world names its modules', () => {
    for (const file of fixtureFiles()) expect(targetFor(path.join(FIXTURE_CORPUS_DIR, `${path.basename(file, '.dsl')}.md`))).toBe(path.basename(file));
  });

  it('writes a --target the loader will read, whether it was named as a module or as a file', () => {
    for (const file of fixtureFiles()) {
      const named = path.basename(file, '.dsl');
      expect(parseArgs(['a-brief.md', '--target', named]).target).toBe(`${named}.dsl`);
      expect(parseArgs(['a-brief.md', '--target', `${named}.dsl`]).target).toBe(`${named}.dsl`);
    }
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
    expect(parseArgs(['b.md', '--minutes', '10']).minutes).toBe(10);
    expect(() => parseArgs(['b.md', '--turns', 'lots'])).toThrow(/takes a count/);
    expect(() => parseArgs(['b.md', '--turns', '0'])).toThrow(/takes a count/);
    expect(() => parseArgs(['b.md', '--minutes', '0'])).toThrow(/takes a count/);
  });

  it('knows the last minute of the clock, and never reaches one when no minutes were asked for', () => {
    const started = 1_000_000;
    const minute = 60_000;
    expect(inLastMinute(started, null, started + 500 * minute)).toBe(false);
    expect(inLastMinute(started, 10, started + 8 * minute)).toBe(false);
    expect(inLastMinute(started, 10, started + 9 * minute)).toBe(true);
    expect(inLastMinute(started, 10, started + 12 * minute)).toBe(true);
  });

  it('reads the other flags, and refuses one it does not know rather than guessing what it meant', () => {
    expect(parseArgs(['b.md', '--open', '--target', 'tulsa.dsl', '--model', 'claude-opus-5'])).toMatchObject({ open: true, target: 'tulsa.dsl', model: 'claude-opus-5' });
    expect(() => parseArgs(['b.md', '--sideways'])).toThrow(/unknown flag/);
  });

  it('tells an answered reach from a refused one, since a question somebody answered is not a hole in the oracle', () => {
    const at = 1_000_000;
    const said = summaryLines(
      [
        { turn: 2, tool: 'Read', target: 'src/runtime/runtime.ts', decision: 'asked', at },
        { turn: 9, tool: 'Bash', target: 'ls content/', decision: 'deny', at },
      ],
      { turns: 9, seconds: 1, calls: 2 },
      '/work',
    ).join(String.fromCharCode(10));

    expect(said).toContain('1 of them answered by the engine worker');
    expect(said).toContain('answered — Read src/runtime/runtime.ts');
    expect(said).toContain('refused — Bash ls content/');
  });

  it('takes an answer for one run, and refuses one that names no run to answer', () => {
    expect(parseArgs(['b.md', '--answer', 'yes, and it is called on refused:']).said).toBe('yes, and it is called on refused:');
    expect(parseArgs(['b.md']).said).toBeNull();
    expect(() => parseArgs(['--answer', 'yes'])).toThrow(/name the brief/);
  });

  it('takes how long a run stands still on a question, and has a default so nothing hangs for ever', () => {
    expect(parseArgs(['b.md']).askFor).toBe(ASKED_FOR_MINUTES);
    expect(parseArgs(['b.md', '--ask-for', '3']).askFor).toBe(3);
    expect(() => parseArgs(['b.md', '--ask-for', 'ages'])).toThrow(/takes a count/);
  });

  it('watches without a brief, since five runs at once are watched by asking after all of them', () => {
    expect(parseArgs(['--watch'])).toMatchObject({ watch: true, brief: null, target: null });
    expect(parseArgs(['--watch', 'b.md'])).toMatchObject({ watch: true, brief: 'b.md' });
  });

  it('says a status once when asked to, since a watch that holds the terminal cannot answer where a run stands', () => {
    expect(parseArgs(['--watch'])).toMatchObject({ once: false });
    expect(parseArgs(['--watch', '--once'])).toMatchObject({ watch: true, once: true });
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

  it('refuses every directory it calls the engine, through a command as readily as through a read', () => {
    for (const dir of ENGINE_DIRS) {
      expect(reaching('Read', { file_path: path.join(REPO, dir, 'held.txt') }), `Read ${dir}`).toEqual({ reaching: true, why: 'engine' });
      expect(reaching('Bash', { command: `cat ${dir}/held.txt` }), `cat ${dir}`).toEqual({ reaching: true, why: 'engine' });
    }
  });

  it('says the same set in the prose it shows the run as the one it enforces', () => {
    for (const dir of ENGINE_DIRS) expect(ASK_LINE, dir).toContain(`${dir}/`);
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

  it('is reaching for the checkout wherever a command names its world rather than the copy, since a shell can write as well as read', () => {
    expect(reaching('Bash', { command: `cp "${path.join(WORK, 'content', 'thieving.dsl')}" "${path.join(REPO, 'content', 'thieving.dsl')}"` })).toEqual({ reaching: true, why: 'checkout' });
    expect(reaching('Bash', { command: `cp x "${path.join(REPO, 'content', 'thieving.dsl').replace(/\\/g, '/')}"` })).toEqual({ reaching: true, why: 'checkout' });
    expect(reaching('Bash', { command: 'npm run oracle -- --at content' })).toEqual({ reaching: true, why: 'checkout' });
    expect(reaching('Bash', { command: 'npm run probe -- content --test a-route' })).toEqual({ reaching: true, why: 'checkout' });
    expect(reaching('Bash', { command: `npm run oracle -- --at ${path.join(WORK, 'content')}` })).toEqual({ reaching: false });
    expect(reaching('Bash', { command: 'grep -n "table of contents" notes.md' })).toEqual({ reaching: false });
    expect(refusalFor('checkout', '/work/content/x.dsl')).toContain('/work/content');
  });

  it('lets a command aimed at the run own corpus name the word content elsewhere in itself', () => {
    const own = path.join(WORK, 'content').replace(/\\/g, '/');
    const asked = `grep -rn "^# dialogue " "${own}"/*.dsl | grep -v "content/tulsa.dsl"`;

    expect(reaching('Bash', { command: asked }), 'the run grepped its own copy and was refused for a word in an exclude pattern').toEqual({ reaching: false });
  });

  it('still refuses a bare content argument from a command that names no corpus of its own', () => {
    expect(reaching('Bash', { command: 'cat content/tulsa.dsl' })).toEqual({ reaching: true, why: 'checkout' });
    expect(reaching('Bash', { command: 'grep -rn "x" content/' })).toEqual({ reaching: true, why: 'checkout' });
  });

  it('refuses the checkout corpus spelled in full even where the run own corpus is named beside it', () => {
    const own = path.join(WORK, 'content').replace(/\\/g, '/');
    const both = `diff "${own}/tulsa.dsl" "${path.join(REPO, 'content').replace(/\\/g, '/')}/tulsa.dsl"`;

    expect(reaching('Bash', { command: both })).toEqual({ reaching: true, why: 'checkout' });
  });

  it('is told what to do instead, since a refusal that only says no teaches the run nothing', () => {
    expect(refusalFor('engine', '/work/content/x.dsl')).toContain('npm run oracle');
    expect(refusalFor('elsewhere', '/work/content/x.dsl')).toContain('/work/content/x.dsl');
  });
});

describe('what the run is told', () => {
  it('points every tool at the run own world, since which directory is its own is the part no --help can know', () => {
    const said = systemFor(asked(), '/work/content', '/work/content/x.dsl');

    expect(said).toContain('npm run oracle');
    expect(said).toContain('npm run probe');
    expect(said).toContain('npm run simulate-activity -- --world /work/content');
    expect(said).toContain('npm run ladder-check -- --world /work/content');
  });

  it('says balance is declared rather than measured, which is what the tags are for', () => {
    const said = systemFor(asked(), '/work/content', '/work/content/x.dsl');

    expect(said).toContain('Balance is declared, not measured');
    expect(said, 'a run told to tune spends its turns on what the tags already decide').toContain('do not spend this run on');
    expect(said).not.toContain('Balance is yours');
  });

  it('tells a run to ask before it designs around a limit, which is the one thing a refusal cannot teach it', () => {
    const closed = systemFor(asked(), '/work/content', '/work/content/x.dsl');
    const open = systemFor({ ...asked(), open: true }, '/work/content', '/work/content/x.dsl');

    expect(closed).toContain('ask before you design around it');
    expect(open, 'a run that never reaches for the source never trips the refusal, so the standing line has to stand on its own').toContain('ask before you design around it');
  });

  it('says a route may not assert a number, which is the one thing balance being the run\'s does not license', () => {
    const said = systemFor(asked(), '/work/content', '/work/content/x.dsl');

    expect(said).toContain('may assert a number a balance pass would move');
  });

  it('hands over every debug switch the kind offers, so a route the engine grows one for is not written past it', () => {
    const said = systemFor(asked(), '/work/content', '/work/content/x.dsl');

    for (const name of DEBUG_SWITCH_NAMES) expect(said).toContain(name);
  });

  it('tells the run its reach is a question somebody may answer, and that the brief is not to be trusted about what exists', () => {
    const said = systemFor(asked(), '/work/content', '/work/content/x.dsl');

    expect(said).toContain('put to the engine worker');
    expect(said).toContain('Nothing in the brief is authoritative about what already exists');
  });

  it('says the same thing about the engine in the prompt and in the refusal, out of one home', () => {
    const both = 'A reach for the engine is put to the engine worker';
    expect(systemFor(asked(), '/c', '/d')).toContain(both);
    expect(refusalFor('engine', '/w/content/x.dsl')).toContain(both);
    expect(refusalFor('engine', '/w/content/x.dsl')).toBe(ENGINE_IS_OFF_LIMITS);
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

describe('a run that writes a floor rather than a module', () => {
  it('takes the flag and defaults to off, since a floor is the exception rather than the shape', () => {
    expect(parseArgs(['b.md']).floors).toBe(false);
    expect(parseArgs(['b.md', '--floors']).floors).toBe(true);
  });

  it('is told to measure by walking, which is the opposite of what every other run is told', () => {
    const floors = systemFor({ ...asked(), floors: true }, '/work/content', '/work/floors/x.dsl');
    const module = systemFor(asked(), '/work/content', '/work/content/x.dsl');

    expect(floors).toContain('balance is measured here rather than declared');
    expect(floors, 'the one lane that still iterates has to be told simulate-activity is the work').toContain('npm run simulate-activity');
    expect(floors).not.toContain('Balance is declared, not measured');

    expect(module).toContain('Balance is declared, not measured');
    expect(module).not.toContain('balance is measured here rather than declared');
  });

  it('is handed the floors gate and the folder to copy the shape from, neither of which a module run has', () => {
    const floors = systemFor({ ...asked(), floors: true }, '/work/content', '/work/floors/x.dsl');

    expect(floors).toContain('npm run floors -- --world /work');
    expect(floors).toContain('/work/floors');
    expect(systemFor(asked(), '/work/content', '/work/content/x.dsl')).not.toContain('npm run floors');
  });

  it('keeps the rules a floor does not get to bend, since it is still a route in a world', () => {
    const floors = systemFor({ ...asked(), floors: true }, '/work/content', '/work/floors/x.dsl');

    expect(floors, 'the minutes are read off the sheet and never pinned').toContain('may assert a number a balance pass would move');
    expect(floors, 'what a real player survives is the measurement').toContain('may not say `unkillable`');
  });

  it('walks the shipped floors through the same seam a run would walk its own', () => {
    const shipped = foldersOf([]);
    expect(foldersOf(['--world', '/work'])).toEqual({ corpus: path.join('/work', shipped.corpus), floors: path.join('/work', shipped.floors) });
    expect(() => foldersOf(['--world'])).toThrow(/wants a directory/);
    expect(() => foldersOf(['--world', '--help'])).toThrow(/wants a directory/);
  });
});
