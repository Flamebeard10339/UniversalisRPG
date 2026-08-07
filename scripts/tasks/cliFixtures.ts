import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tsxCli } from '../lib/tsxCli';
import { run as runTasks } from '../tasks';
import { installPrompter, linePrompter } from './prompt';

export const repoRoot = path.join(import.meta.dirname, '../..');
export const today = new Date().toISOString().slice(0, 10);
export const script = path.join(repoRoot, 'scripts/tasks.ts');

export interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

interface CapturedConsole {
  stdout: string[];
  stderr: string[];
  restore: () => void;
}

function captureConsole(): CapturedConsole {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  console.log = (...values: unknown[]) => {
    stdout.push(`${values.map(String).join(' ')}\n`);
  };
  console.warn = (...values: unknown[]) => {
    stderr.push(`${values.map(String).join(' ')}\n`);
  };
  console.error = (...values: unknown[]) => {
    stderr.push(`${values.map(String).join(' ')}\n`);
  };
  return {
    stdout,
    stderr,
    restore: () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      process.exitCode = previousExitCode;
    },
  };
}

const statusNow = (): number => (process.exitCode === undefined ? 0 : Number(process.exitCode));

export function runInProcess(args: string[]): Run {
  const captured = captureConsole();
  try {
    const result = runTasks(args);
    if (result instanceof Promise) throw new Error(`async command must run through runInProcessAsync: ${args[0] ?? '(none)'}`);
    return { status: statusNow(), stdout: captured.stdout.join(''), stderr: captured.stderr.join('') };
  } finally {
    captured.restore();
  }
}

// A final newline terminates the last line rather than opening an empty one,
// which is how readline reads a pipe; an inner blank line is a real answer.
const inputLines = (input: string): string[] => (input === '' ? [] : input.replace(/\n$/, '').split('\n'));

// The interactive commands, run in-process: their stdin arrives as data
// through the prompter seam, and their prompts land in the captured stdout
// the way a pipe's would.
export async function runInProcessAsync(args: string[], input = ''): Promise<Run> {
  const captured = captureConsole();
  installPrompter(() => linePrompter(inputLines(input), (prompt) => captured.stdout.push(prompt)));
  try {
    const result = runTasks(args);
    if (result instanceof Promise) await result;
    return { status: statusNow(), stdout: captured.stdout.join(''), stderr: captured.stderr.join('') };
  } finally {
    installPrompter(null);
    captured.restore();
  }
}

// In-process, from inside the fixture's own directory: the commands that ask
// git about their surroundings read cwd, which spawning used to set. Tests
// in a file run one at a time, so the swap cannot interleave.
function runInProcessAt(dir: string, args: string[]): Run {
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    return runInProcess(args);
  } finally {
    process.chdir(cwd);
  }
}

// Backdates a claim in the store so coldness can be exercised without
// waiting COLD_CLAIM_DAYS for it — the record is otherwise the one `start`
// really wrote.
export function ageClaim(dir: string, id: string, days: number): void {
  const file = path.join(dir, 'tasks.jsonl');
  const lines = readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const record = JSON.parse(line) as { id: string; claimed: string | null };
      if (record.id === id) record.claimed = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      return JSON.stringify(record);
    });
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

// A store write no fixture command can make: `fixture` pins `--branch`, and
// what the provenance line reads off the log is the branch an event was
// written from, which is a different branch from the one reading it exactly
// when the line is worth having.
export function appendEvent(dir: string, event: { branch: string; spec: string; id?: string }): void {
  const line = { t: new Date().toISOString(), by: null, branch: event.branch, head: null, op: 'edit', id: event.id ?? null, system: null, spec: event.spec, note: 'edited' };
  appendFileSync(path.join(dir, 'events.jsonl'), `${JSON.stringify(line)}\n`, 'utf8');
}

export interface FixtureContext {
  dir: string;
  args: (extra?: string[]) => string[];
  tasks: (...args: string[]) => Run;
  audit: (...args: string[]) => Promise<Run>;
  auditWith: (input: string, ...args: string[]) => Promise<Run>;
  triage: (input: string, extra?: string[]) => Promise<Run>;
}

// An async run keeps the temp directory alive until it settles; a sync run
// is cleaned up on return, exactly as before. A test handing in an async
// callback must return fixture's promise so the runner waits on it.
// `audit-prompt` writes its manifest and its pass file under `os.tmpdir()`,
// which every test on this machine shares and nothing cleans up. A test that
// read one back was reading whatever an earlier run had left there: the c8
// proof target survived a whole-suite mutation because the file it asserted
// on was written by a previous suite run, so the assertion held with the
// writing code deleted. `os.tmpdir()` answers from the environment on every
// call, so pointing it at the fixture's own directory scopes the artifacts to
// the test that generated them — in-process and spawned alike.
function isolateTmp(dir: string): () => void {
  const names = ['TMPDIR', 'TEMP', 'TMP'] as const;
  const previous = names.map((name) => [name, process.env[name]] as const);
  const inside = path.join(dir, 'tmp');
  mkdirSync(inside, { recursive: true });
  for (const name of names) process.env[name] = inside;
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

export function fixture(run: (context: FixtureContext) => void | Promise<void>): void | Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-tasks-'));
  const restoreTmp = isolateTmp(dir);
  const cleanup = (): void => {
    restoreTmp();
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    const specsDir = path.join(dir, 'specs');
    mkdirSync(specsDir);
    writeFileSync(path.join(specsDir, 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n- The second clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
    const systemsPath = path.join(dir, 'systems.json');
    writeFileSync(
      systemsPath,
      JSON.stringify({
        unowned: { note: '', paths: ['docs', '*.md'] },
        systems: [
          { name: 'Runtime', paths: ['src/runtime'], lastAudit: null, lastAuditDoc: null, note: null },
          { name: 'UI', paths: ['src/ui'], lastAudit: null, lastAuditDoc: null, note: null },
        ],
      }),
      'utf8',
    );
    const storePath = path.join(dir, 'tasks.jsonl');
    const globals = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'demo-spec'];
    // A bare `--` ends flag parsing, so the fixture's own flags must land
    // before it, never after.
    const withGlobals = (args: string[]): string[] => {
      const term = args.indexOf('--');
      return term === -1 ? [...args, ...globals] : [...args.slice(0, term), ...globals, ...args.slice(term)];
    };

    const result = run({
      dir,
      args: (extra = []) => [...globals, ...extra],
      tasks: (...args: string[]) => runInProcess(withGlobals(args)),
      audit: (...args: string[]) => runInProcessAsync(withGlobals(['audit', ...args])),
      auditWith: (input: string, ...args: string[]) => runInProcessAsync(withGlobals(['audit', ...args]), input),
      triage: (input: string, extra: string[] = []) => runInProcessAsync(['triage', ...extra, ...globals], input),
    });
    if (result instanceof Promise) return result.finally(cleanup);
  } catch (error) {
    cleanup();
    throw error;
  }
  cleanup();
}

// A dedicated git repo per test, distinct from `fixture`'s (which runs
// non-audit commands in-process and spawns audit
// against this repo's own real checkout) — a real diff range and
// commit-message trailers need commits with exact, controlled content.
export function gitFixture(run: (context: { dir: string; commit: (message: string, files?: string[]) => string; tasks: (...args: string[]) => Run }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-git-fixture-'));
  const restoreTmp = isolateTmp(dir);
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });

    const specsDir = path.join(dir, 'specs');
    mkdirSync(specsDir);
    writeFileSync(path.join(specsDir, 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
    const systemsPath = path.join(dir, 'systems.json');
    writeFileSync(systemsPath, JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [] }), 'utf8');
    const storePath = path.join(dir, 'tasks.jsonl');
    const globals = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'demo-spec'];
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'Initial fixture\n\nA branch base exists.'], { cwd: dir, encoding: 'utf8' });
    spawnSync('git', ['branch', '-M', 'main'], { cwd: dir });
    spawnSync('git', ['checkout', '-q', '-b', 'demo-spec'], { cwd: dir });

    run({
      dir,
      commit: (message: string, files: string[] = [`file-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`]) => {
        for (const file of files) {
          const target = path.join(dir, file);
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, 'x', 'utf8');
        }
        spawnSync('git', ['add', '.'], { cwd: dir });
        spawnSync('git', ['commit', '--no-verify', '-m', message], { cwd: dir, encoding: 'utf8' });
        return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
      },
      tasks: (...args: string[]) => runInProcessAt(dir, [...args, ...globals]),
    });
  } finally {
    restoreTmp();
    rmSync(dir, { recursive: true, force: true });
  }
}

export function defaultStoreGitFixture(run: (context: { dir: string; tasks: (...args: string[]) => Run }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-default-store-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });

    mkdirSync(path.join(dir, 'docs', 'specs'), { recursive: true });
    mkdirSync(path.join(dir, 'docs', 'audits'), { recursive: true });
    writeFileSync(path.join(dir, 'docs', 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
    writeFileSync(path.join(dir, 'docs', 'audits', 'systems.json'), JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [] }), 'utf8');
    writeFileSync(path.join(dir, 'docs', 'tasks.jsonl'), '', 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'Initial fixture\n\nA tracked task store exists.'], { cwd: dir, encoding: 'utf8' });

    run({
      dir,
      tasks: (...args: string[]) => runInProcessAt(dir, [...args, '--branch', 'demo-spec']),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The real CLI entry, for the handful of tests that must observe a whole
// process: per-process state like the warn-once flag, and the stdin pipe
// itself. Everything else runs in-process and never pays for a spawn.
export function spawnTasks(cwd: string, args: string[], input?: string): Run {
  const result = spawnSync(process.execPath, [tsxCli, script, ...args], { cwd, encoding: 'utf8', input });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

// Only the lines under `Relevant files:`. The same paths print again under
// `Member tasks:`, so an assertion made against the whole output cannot
// tell the relevant-files computation from its absence.
export function relevantFilesBlock(stdout: string): string {
  const block = /Relevant files:\n((?:- .*\n)+)/.exec(stdout);
  if (block === null) throw new Error(`no relevant-files block in audit-prompt output:\n${stdout}`);
  return block[1];
}

// Only the numbered procedure, so a step asserted here is a step in the
// ordered list rather than the same words loose somewhere in 231 lines of
// brief — which is where three recorded passes had to find them.
export function stepsBlock(stdout: string): string {
  const block = /Steps, in order\.[^\n]*\n\n((?:.*\n)+?)\nLook specifically for:/.exec(stdout);
  if (block === null) throw new Error(`no steps block in audit-prompt output:\n${stdout}`);
  return block[1];
}

// `list` prefixes its rows with whatever it had to infer to answer, so the
// id of the first row is the first row that looks like one, not line zero.
export function firstListedId(stdout: string): string {
  const row = stdout.split('\n').find((line) => /^\S+ {2}\[/.test(line));
  if (row === undefined) throw new Error(`no task row in list output:\n${stdout}`);
  return row.split(' ')[0];
}
