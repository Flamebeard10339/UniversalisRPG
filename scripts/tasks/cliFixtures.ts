import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tsxCli } from '../lib/tsxCli';
import { run as runTasks } from '../tasks';

export const repoRoot = path.join(import.meta.dirname, '../..');
export const today = new Date().toISOString().slice(0, 10);
export const script = path.join(repoRoot, 'scripts/tasks.ts');

export interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

export function runInProcess(args: string[]): Run {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    console.log = (...values: unknown[]) => {
      stdout.push(`${values.map(String).join(' ')}\n`);
    };
    console.warn = (...values: unknown[]) => {
      stderr.push(`${values.map(String).join(' ')}\n`);
    };
    console.error = (...values: unknown[]) => {
      stderr.push(`${values.map(String).join(' ')}\n`);
    };
    const result = runTasks(args);
    if (result instanceof Promise) throw new Error(`async command must run through the subprocess fixture: ${args[0] ?? '(none)'}`);
    const status = process.exitCode === undefined ? 0 : Number(process.exitCode);
    return { status, stdout: stdout.join(''), stderr: stderr.join('') };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    process.exitCode = previousExitCode;
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

export function fixture(run: (context: { dir: string; args: (extra?: string[]) => string[]; tasks: (...args: string[]) => Run; triage: (input: string, extra?: string[]) => Run }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-tasks-'));
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

    run({
      dir,
      args: (extra = []) => [...globals, ...extra],
      tasks: (...args: string[]) => {
        if (args[0] !== 'audit') return runInProcess(withGlobals(args));
        const result = spawnSync(process.execPath, [tsxCli, script, ...withGlobals(args)], { cwd: repoRoot, encoding: 'utf8' });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
      },
      triage: (input: string, extra: string[] = []) => {
        const result = spawnSync(process.execPath, [tsxCli, script, 'triage', ...extra, ...globals], { cwd: repoRoot, encoding: 'utf8', input });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A dedicated git repo per test, distinct from `fixture`'s (which runs
// non-audit commands in-process and spawns audit
// against this repo's own real checkout) — handoff's walk-back and
// multi-line capture need commits with exact, controlled messages.
export function gitFixture(run: (context: { dir: string; commit: (message: string) => string; tasks: (...args: string[]) => Run }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-handoff-'));
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
      commit: (message: string) => {
        writeFileSync(path.join(dir, `file-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`), 'x', 'utf8');
        spawnSync('git', ['add', '.'], { cwd: dir });
        spawnSync('git', ['commit', '--no-verify', '-m', message], { cwd: dir, encoding: 'utf8' });
        return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
      },
      tasks: (...args: string[]) => {
        const result = spawnSync(process.execPath, [tsxCli, script, ...args, ...globals], { cwd: dir, encoding: 'utf8' });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
      },
    });
  } finally {
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
      tasks: (...args: string[]) => {
        const result = spawnSync(process.execPath, [tsxCli, script, ...args, '--branch', 'demo-spec'], { cwd: dir, encoding: 'utf8' });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Only the lines under `Relevant files:`. The same paths print again under
// `Member tasks:`, so an assertion made against the whole output cannot
// tell the relevant-files computation from its absence.
export function relevantFilesBlock(stdout: string): string {
  const block = /Relevant files:\n((?:- .*\n)+)/.exec(stdout);
  if (block === null) throw new Error(`no relevant-files block in audit-prompt output:\n${stdout}`);
  return block[1];
}

// `list` prefixes its rows with whatever it had to infer to answer, so the
// id of the first row is the first row that looks like one, not line zero.
export function firstListedId(stdout: string): string {
  const row = stdout.split('\n').find((line) => /^\S+ {2}\[/.test(line));
  if (row === undefined) throw new Error(`no task row in list output:\n${stdout}`);
  return row.split(' ')[0];
}
