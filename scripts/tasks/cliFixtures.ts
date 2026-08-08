import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install as installGit, type Commit, type GitFacts } from '../lib/git';
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
export function runInProcessAt(dir: string, args: string[]): Run {
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
export function isolateTmp(dir: string): () => void {
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

// What a command asking git about a directory that is not a repository gets:
// the same nulls the real seam answers with outside a repo. Installed by
// `fixture`, so a test that never declared a repository cannot quietly read
// the one this suite happens to run inside.
const noRepositoryGit: GitFacts = {
  mergeBase: () => null,
  head: () => null,
  branch: () => null,
  resolveCommit: () => null,
  fileAt: () => null,
  isAncestor: () => false,
  commitCount: () => null,
  mergeInProgress: () => false,
  dirtyPaths: () => null,
  changedFiles: () => null,
  diffStat: () => null,
  commitLog: () => null,
  commitsTouching: () => null,
  lsFiles: () => null,
};

interface TreeCommit {
  sha: string;
  subject: string;
  files: string[];
  tree: Map<string, string>;
}

// Reads every file under the fixture directory, as `git add .` + commit
// would have staged it. `tmp` is the fixture's isolated os.tmpdir(), which a
// real repo would have committed too — excluded because nothing reads it
// back through a revision and its churn is noise in every tree diff.
function snapshotTree(root: string, at = root, tree = new Map<string, string>()): Map<string, string> {
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    const full = path.join(at, entry.name);
    if (at === root && entry.name === 'tmp') continue;
    if (entry.isDirectory()) snapshotTree(root, full, tree);
    else tree.set(path.relative(root, full).split(path.sep).join('/'), readFileSync(full, 'utf8'));
  }
  return tree;
}

function treeDiff(before: Map<string, string>, after: Map<string, string>): string[] {
  const changed: string[] = [];
  for (const [file, content] of after) if (before.get(file) !== content) changed.push(file);
  for (const file of before.keys()) if (!after.has(file)) changed.push(file);
  return changed.sort();
}

// Git facts answered from data: a linear history of directory snapshots,
// commit-shaped enough for every read the seam exposes. `branchName`
// advances with each commit(); `main` stays at the first commit until
// fork() pins it where the head is now, the way checkout -b leaves it.
// A null `initialMessage` leaves the history unborn: every revision read
// answers null, as git does before a branch's first commit, while `status`
// still reports the whole tree.
class DataGit {
  private commits: TreeCommit[] = [];

  private mainTip = 0;

  readonly facts: GitFacts;

  constructor(
    private readonly dir: string,
    private readonly branchName: string,
    initialMessage: string | null,
  ) {
    if (initialMessage !== null) this.commit(initialMessage);
    this.facts = {
      mergeBase: (baseBranch) => {
        const base = this.indexOf(baseBranch);
        return base === null ? null : this.commits[Math.min(base, this.commits.length - 1)].sha;
      },
      head: () => this.tip?.sha ?? null,
      // Null on an unborn history: `rev-parse --abbrev-ref HEAD` fails
      // before the first commit, where `ls-files` succeeds and answers
      // empty, so the two disagree about what "nothing yet" looks like.
      branch: () => (this.tip === null ? null : this.branchName),
      resolveCommit: (revspec) => {
        const index = this.indexOf(revspec);
        return index === null ? null : this.commits[index].sha;
      },
      fileAt: (rev, filePath) => {
        const index = this.indexOf(rev);
        if (index === null) return null;
        return this.commits[index].tree.get(this.relative(filePath))?.trim() ?? null;
      },
      isAncestor: (ancestor, descendant) => {
        const from = this.indexOf(ancestor);
        const to = this.indexOf(descendant);
        return from !== null && to !== null && from <= to;
      },
      commitCount: (range) => this.inRange(range)?.length ?? null,
      mergeInProgress: () => false,
      dirtyPaths: (pathspec) => {
        const head = this.tip?.tree ?? new Map<string, string>();
        const spec = pathspec === undefined ? null : this.relative(pathspec);
        return treeDiff(head, snapshotTree(this.dir)).filter((file) => spec === null || file === spec || file.startsWith(`${spec}/`));
      },
      changedFiles: (range) => {
        const commits = this.inRange(range);
        if (commits === null) return null;
        return [...new Set(commits.flatMap((commit) => commit.files))].sort();
      },
      diffStat: (range) => {
        const commits = this.inRange(range);
        if (commits === null) return null;
        const files = [...new Set(commits.flatMap((commit) => commit.files))].sort();
        return files.length === 0 ? '' : [...files.map((file) => ` ${file} | 1 +`), ` ${files.length} file(s) changed`].join('\n');
      },
      commitLog: (range) => {
        const commits = this.inRange(range);
        if (commits === null) return null;
        return commits.map((commit): Commit => ({ sha: commit.sha.slice(0, 7), subject: commit.subject, files: commit.files })).reverse();
      },
      commitsTouching: (filePath) => {
        if (this.tip === null) return null;
        const file = this.relative(filePath);
        return this.commits
          .filter((commit) => commit.files.includes(file))
          .map((commit) => commit.sha)
          .reverse();
      },
      lsFiles: () => [...(this.tip?.tree.keys() ?? [])].sort(),
    };
  }

  private get tip(): TreeCommit | null {
    return this.commits[this.commits.length - 1] ?? null;
  }

  commit(message: string): string {
    const tree = snapshotTree(this.dir);
    const previous = this.commits[this.commits.length - 1]?.tree ?? new Map<string, string>();
    const sha = createHash('sha1').update(`${this.commits.length} ${message}`).digest('hex');
    this.commits.push({ sha, subject: message.split('\n')[0], files: treeDiff(previous, tree), tree });
    return sha;
  }

  fork(): void {
    this.mainTip = this.commits.length - 1;
  }

  private relative(filePath: string): string {
    return path.relative(this.dir, path.resolve(filePath)).split(path.sep).join('/');
  }

  private indexOf(rev: string): number | null {
    if (this.commits.length === 0) return null;
    if (rev === 'HEAD' || rev === this.branchName) return this.commits.length - 1;
    if (rev === 'main') return this.mainTip;
    const index = this.commits.findIndex((commit) => commit.sha === rev || commit.sha.slice(0, 7) === rev);
    return index === -1 ? null : index;
  }

  private inRange(range: string): TreeCommit[] | null {
    const [from, to] = range.split('..');
    const fromIndex = this.indexOf(from);
    const toIndex = to === undefined ? this.commits.length - 1 : this.indexOf(to);
    if (fromIndex === null || toIndex === null) return null;
    return this.commits.slice(fromIndex + 1, toIndex + 1);
  }
}

// For direct-library tests that need a repository's shape — a base, a fork,
// branch commits — without one: the same snapshot-backed facts gitFixture
// installs, handed to a test that builds its history by hand.
export function installDataGit(dir: string, branch = 'feature'): { commit: (message: string) => string; fork: () => void; uninstall: () => void } {
  const data = new DataGit(dir, branch, 'Repo initialised\n\nA base exists.');
  const previous = installGit(data.facts);
  return {
    commit: (message: string) => data.commit(message),
    fork: () => data.fork(),
    uninstall: () => void installGit(previous),
  };
}

export function fixture(run: (context: FixtureContext) => void | Promise<void>): void | Promise<void> {
  return fixtureWith(noRepositoryGit, run);
}

// The declared form of `fixture` for a test that resolves SHAs against the
// repository the suite runs inside on purpose — `done --commit HEAD` against
// a commit that must really exist. Every other test gets `fixture`, where
// that read answers null.
export function enclosingGitFixture(run: (context: FixtureContext) => void | Promise<void>): void | Promise<void> {
  return fixtureWith(null, run);
}

function fixtureWith(gitFacts: GitFacts | null, run: (context: FixtureContext) => void | Promise<void>): void | Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-tasks-'));
  const restoreTmp = isolateTmp(dir);
  const restoreGit = gitFacts === null ? null : installGit(gitFacts);
  const cleanup = (): void => {
    if (restoreGit !== null) installGit(restoreGit);
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
    // A flag given twice is an error, not a last-value win, so a caller
    // naming one of these globals is overriding it and the fixture's own
    // copy has to stand down.
    const yielding = (to: string[]): string[] => {
      const overridden = new Set(to.filter((token) => token.startsWith('--')));
      return globals.filter((token, at) => !overridden.has(token) && !overridden.has(globals[at - 1] ?? ''));
    };

    // A bare `--` ends flag parsing, so the fixture's own flags must land
    // before it, never after.
    const withGlobals = (args: string[]): string[] => {
      const term = args.indexOf('--');
      const mine = yielding(args);
      return term === -1 ? [...args, ...mine] : [...args.slice(0, term), ...mine, ...args.slice(term)];
    };

    const result = run({
      dir,
      args: (extra = []) => [...yielding(extra), ...extra],
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

// A dedicated history per test, distinct from `fixture`'s no-repository
// answers — a controlled diff range and derived-commit walk need commits
// with exact, known content, which DataGit answers from snapshots without
// ever spawning git.
export function gitFixture(run: (context: { dir: string; commit: (message: string, files?: string[]) => string; tasks: (...args: string[]) => Run }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-git-fixture-'));
  const restoreTmp = isolateTmp(dir);
  const specsDir = path.join(dir, 'specs');
  mkdirSync(specsDir);
  writeFileSync(path.join(specsDir, 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
  const systemsPath = path.join(dir, 'systems.json');
  writeFileSync(systemsPath, JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [] }), 'utf8');
  const storePath = path.join(dir, 'tasks.jsonl');
  const globals = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'demo-spec'];
  const data = new DataGit(dir, 'demo-spec', 'Initial fixture\n\nA branch base exists.');
  const restoreGit = installGit(data.facts);
  let fileSeq = 0;
  try {
    run({
      dir,
      commit: (message: string, files: string[] = [`file-${(fileSeq += 1)}.txt`]) => {
        for (const file of files) {
          const target = path.join(dir, file);
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, 'x', 'utf8');
        }
        return data.commit(message);
      },
      tasks: (...args: string[]) => runInProcessAt(dir, [...args, ...globals]),
    });
  } finally {
    installGit(restoreGit);
    restoreTmp();
    rmSync(dir, { recursive: true, force: true });
  }
}

export function defaultStoreGitFixture(run: (context: { dir: string; tasks: (...args: string[]) => Run }) => void): void {
  defaultStoreFixtureWith('Initial fixture\n\nA tracked task store exists.', run);
}

// The same directory with nothing committed yet: what the checks anchored on
// `HEAD` see before a branch's first commit. Declared apart from the fixture
// above because which of the two a test wants is the whole subject of the
// tests that reach for it.
export function unbornDefaultStoreFixture(run: (context: { dir: string; tasks: (...args: string[]) => Run }) => void): void {
  defaultStoreFixtureWith(null, run);
}

function defaultStoreFixtureWith(initialMessage: string | null, run: (context: { dir: string; tasks: (...args: string[]) => Run }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-default-store-'));
  mkdirSync(path.join(dir, 'docs', 'specs'), { recursive: true });
  mkdirSync(path.join(dir, 'docs', 'audits'), { recursive: true });
  writeFileSync(path.join(dir, 'docs', 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
  writeFileSync(path.join(dir, 'docs', 'audits', 'systems.json'), JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [] }), 'utf8');
  writeFileSync(path.join(dir, 'docs', 'tasks.jsonl'), '', 'utf8');
  const data = new DataGit(dir, 'main', initialMessage);
  const restoreGit = installGit(data.facts);
  try {
    run({
      dir,
      tasks: (...args: string[]) => runInProcessAt(dir, [...args, '--branch', 'demo-spec']),
    });
  } finally {
    installGit(restoreGit);
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
