import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { run as runTasks } from './tasks';

const repoRoot = path.join(import.meta.dirname, '..');
const tsx = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const script = path.join(repoRoot, 'scripts/tasks.ts');

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function runInProcess(args: string[]): Run {
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

function fixture(run: (context: { dir: string; args: (extra?: string[]) => string[]; tasks: (...args: string[]) => Run; triage: (input: string, extra?: string[]) => Run }) => void): void {
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

    run({
      dir,
      args: (extra = []) => [...globals, ...extra],
      tasks: (...args: string[]) => {
        if (args[0] !== 'audit') return runInProcess([...args, ...globals]);
        const result = spawnSync(process.execPath, [tsx, script, ...args, ...globals], { cwd: repoRoot, encoding: 'utf8' });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
      },
      triage: (input: string, extra: string[] = []) => {
        const result = spawnSync(process.execPath, [tsx, script, 'triage', ...extra, ...globals], { cwd: repoRoot, encoding: 'utf8', input });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A dedicated git repo per test, distinct from `fixture`'s (which spawns
// against this repo's own real checkout) — handoff's walk-back and
// multi-line capture need commits with exact, controlled messages.
function gitFixture(run: (context: { dir: string; commit: (message: string) => string; tasks: (...args: string[]) => Run; tasksAs: (branch: string, ...args: string[]) => Run }) => void): void {
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
    const commonArgs = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir];
    const globals = [...commonArgs, '--branch', 'demo-spec'];
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
        const result = spawnSync(process.execPath, [tsx, script, ...args, ...globals], { cwd: dir, encoding: 'utf8' });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
      },
      // Same fixture, but with an explicit --branch instead of the fixed
      // "demo-spec" — for proving the merge gate's spec resolution against
      // a branch name that does or doesn't match a spec file on disk.
      tasksAs: (branch: string, ...args: string[]) => {
        const result = spawnSync(process.execPath, [tsx, script, ...args, ...commonArgs, '--branch', branch], { cwd: dir, encoding: 'utf8' });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function defaultStoreGitFixture(run: (context: { dir: string; tasks: (...args: string[]) => Run }) => void): void {
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
        const result = spawnSync(process.execPath, [tsx, script, ...args, '--branch', 'demo-spec'], { cwd: dir, encoding: 'utf8' });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// runProofTarget's vitest branch spawns real vitest against a file path, and
// vitest only resolves test files inside the project root — so the fixture
// file has to live under the repo, not os.tmpdir(). It lives in its own
// fixture-only directory rather than alongside scripts/lib's production
// modules; vite.config.ts sweeps anything an interrupted run left behind
// there before the next vitest start collects test files. Written and
// removed around each test as well, for the common case.
function vitestFixtureFile(run: (relPath: string) => void): void {
  const fixturesDir = path.join(repoRoot, 'scripts/proof-fixtures');
  mkdirSync(fixturesDir, { recursive: true });
  const relPath = `scripts/proof-fixtures/__proof_fixture_${Date.now()}_${Math.random().toString(36).slice(2)}.test.ts`;
  const absPath = path.join(repoRoot, relPath);
  writeFileSync(
    absPath,
    [
      "import { describe, it, expect } from 'vitest';",
      "describe('proof fixture', () => {",
      "  it('unrelated passing test', () => { expect(1).toBe(1); });",
      "  it('proof fixture passes', () => { expect(1).toBe(1); });",
      "  it('proof fixture fails', () => { expect(1).toBe(2); });",
      "  it.skip('proof fixture is skipped', () => { expect(1).toBe(2); });",
      "});",
      "describe('proof fixture, second describe', () => {",
      "  it('shared title', () => { expect(1).toBe(1); });",
      "});",
      "describe('proof fixture, third describe', () => {",
      "  it('shared title', () => { expect(1).toBe(1); });",
      "});",
      '',
    ].join('\n'),
    'utf8',
  );
  try {
    run(relPath);
  } finally {
    rmSync(absPath, { force: true });
  }
}

describe('tasks CLI', () => {
  it('prints help without treating --help or help as unknown commands', () => {
    fixture(({ tasks }) => {
      const flag = tasks('--help');
      expect(flag.status).toBe(0);
      expect(flag.stdout).toContain('usage: npm run tasks --');
      expect(flag.stderr).toBe('');

      const verb = tasks('help');
      expect(verb.status).toBe(0);
      expect(verb.stdout).toContain('usage: npm run tasks --');
      expect(verb.stderr).toBe('');
    });
  });

  it('adds a task and shows it back', () => {
    fixture(({ tasks }) => {
      const added = tasks('add', 'Fix the thing', '--severity', 'high', '--system', 'Runtime', '--deliverable', 'the thing is fixed');
      expect(added.status).toBe(0);
      expect(added.stdout).toContain('added fix-the-thing [task/open]');

      const shown = tasks('show', 'fix-the-thing');
      expect(shown.status).toBe(0);
      expect(shown.stdout).toContain('Fix the thing');
      expect(shown.stdout).toContain('system: Runtime');
      expect(shown.stdout).toContain('deliverable: the thing is fixed');
    });
  });

  it('a finding starts unreviewed and outside any spec, even with --spec passed', () => {
    fixture(({ tasks }) => {
      tasks('add', 'checkSave crashes', '--kind', 'finding', '--severity', 'high', '--spec', 'demo-spec', '--deliverable', 'loadSave refuses the malformed body instead of throwing');
      const shown = tasks('show', 'checksave-crashes');
      expect(shown.stdout).toContain('[finding/unreviewed/high]');
      expect(shown.stdout).toContain('spec: (deferred)');
    });
  });

  it('refuses to add an undelivered task by hand', () => {
    fixture(({ tasks }) => {
      const result = tasks('add', 'sneaky', '--kind', 'undelivered');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('only created by `audit`');
    });
  });

  it('refuses --kind finding without --deliverable, and the store is left unchanged', () => {
    fixture(({ tasks }) => {
      const result = tasks('add', 'a bug with no proposed fix', '--kind', 'finding', '--severity', 'high');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--deliverable is required for --kind finding');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('--kind task (the default) does not require --deliverable', () => {
    fixture(({ tasks }) => {
      const result = tasks('add', 'a plain task', '--id', 'plain-task');
      expect(result.status).toBe(0);
      expect(tasks('show', 'plain-task').stdout).not.toContain('deliverable:');
    });
  });

  it('edit changes only the fields given, leaving the rest untouched', () => {
    fixture(({ tasks }) => {
      tasks('add', 'Original title', '--id', 'editable', '--severity', 'low', '--system', 'Runtime', '--deliverable', 'old fix', '--evidence', 'old evidence');
      const edited = tasks('edit', 'editable', '--deliverable', 'new fix');
      expect(edited.status).toBe(0);
      expect(edited.stdout).toContain('edited editable: deliverable');

      const shown = tasks('show', 'editable').stdout;
      expect(shown).toContain('deliverable: new fix');
      expect(shown).toContain('evidence: old evidence');
      expect(shown).toContain('Original title');
      expect(shown).toContain('system: Runtime');
      expect(shown).toContain('[task/open/low]');
    });
  });

  it('edit accepts a new title positionally or via --title', () => {
    fixture(({ tasks }) => {
      tasks('add', 'Original title', '--id', 'editable');
      const edited = tasks('edit', 'editable', 'Replacement title');
      expect(edited.status).toBe(0);
      expect(tasks('show', 'editable').stdout).toContain('Replacement title');
    });
  });

  it('edit reports nothing to change when no content flags are given', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'editable');
      const result = tasks('edit', 'editable');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('nothing to change');
    });
  });

  it('edit refuses an unknown id', () => {
    fixture(({ tasks }) => {
      const result = tasks('edit', 'no-such-task', '--deliverable', 'x');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no such task: no-such-task');
    });
  });

  it('edit refuses an invalid severity, and the store is left unchanged', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'editable', '--severity', 'low');
      const result = tasks('edit', 'editable', '--severity', 'extreme');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--severity must be high, medium or low');
      expect(tasks('show', 'editable').stdout).toContain('[task/open/low]');
    });
  });

  it('edit refuses a system not in systems.json', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'editable');
      const result = tasks('edit', 'editable', '--system', 'Nonexistent');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('not in systems.json');
      expect(tasks('show', 'editable').stdout).not.toContain('system: Nonexistent');
    });
  });

  it('edit refuses a --requires id that does not resolve', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'editable');
      const result = tasks('edit', 'editable', '--requires', 'ghost');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown id(s): ghost');
    });
  });

  it('edit never changes id, kind, state, spec, reason or closed — only the other verbs do', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      tasks('edit', 'a-member', '--deliverable', 'a fix');
      const shown = tasks('show', 'a-member').stdout;
      expect(shown).toContain('a-member  [task/open]');
      expect(shown).toContain('spec: demo-spec');
    });
  });

  it('next returns the highest-severity unblocked task in the active spec', () => {
    fixture(({ tasks }) => {
      tasks('add', 'low one', '--severity', 'low', '--spec', 'demo-spec');
      tasks('add', 'high one', '--severity', 'high', '--spec', 'demo-spec');
      tasks('add', 'deferred one', '--severity', 'high');
      const next = tasks('next');
      expect(next.stdout).toContain('high one');
      expect(next.stdout).not.toContain('deferred one');
    });
  });

  it('next is concise by default and prints full task detail only with --full', () => {
    fixture(({ tasks }) => {
      const longEvidence = 'first line of evidence\nsecond line of evidence\nthird line of evidence';
      tasks('add', 'verbose task', '--id', 'verbose-task', '--severity', 'high', '--system', 'Runtime', '--spec', 'demo-spec', '--files', 'src/runtime/save.ts:1', '--deliverable', 'the fix exists', '--evidence', longEvidence);

      const concise = tasks('next');
      expect(concise.stdout).toContain('verbose-task  [task/open/high]');
      expect(concise.stdout).toContain('files: src/runtime/save.ts:1');
      expect(concise.stdout).toContain('evidence: first line of evidence');
      expect(concise.stdout).not.toContain('second line of evidence');

      const full = tasks('next', '--full');
      expect(full.stdout).toContain('second line of evidence');
      expect(full.stdout).toContain('deliverable: the fix exists');
    });
  });

  it('next reports no active spec rather than surfacing deferred tasks when the branch matches no spec', () => {
    fixture(({ dir }) => {
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      writeFileSync(storePath, `${JSON.stringify({ id: 'deferred-task', title: 'deferred', kind: 'task', state: 'open', severity: 'high', system: null, spec: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: null })}\n`, 'utf8');
      const result = spawnSync(process.execPath, [tsx, script, 'next', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'no-such-spec'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.stdout).toContain('no active spec for this branch');
      expect(result.stdout).not.toContain('deferred');
    });
  });

  it('next skips a blocked task', () => {
    fixture(({ tasks }) => {
      tasks('add', 'blocker', '--id', 'blocker', '--severity', 'low', '--spec', 'demo-spec');
      tasks('add', 'blocked', '--id', 'blocked', '--severity', 'high', '--spec', 'demo-spec', '--requires', 'blocker');
      const next = tasks('next');
      expect(next.stdout).toContain('blocker');
    });
  });

  it('start claims an open unblocked task, next skips it, and stop returns it to open', () => {
    fixture(({ tasks }) => {
      tasks('add', 'claimed task', '--id', 'claimed', '--severity', 'high', '--spec', 'demo-spec');
      tasks('add', 'next task', '--id', 'next-task', '--severity', 'low', '--spec', 'demo-spec');

      const started = tasks('start', 'claimed');
      expect(started.status).toBe(0);
      expect(tasks('show', 'claimed').stdout).toContain('[task/in-progress/high]');
      expect(tasks('next').stdout).toContain('next-task');

      const stopped = tasks('stop', 'claimed');
      expect(stopped.status).toBe(0);
      expect(tasks('show', 'claimed').stdout).toContain('[task/open/high]');
    });
  });

  it('start refuses blocked tasks', () => {
    fixture(({ tasks }) => {
      tasks('add', 'blocker', '--id', 'blocker', '--spec', 'demo-spec');
      tasks('add', 'blocked', '--id', 'blocked', '--spec', 'demo-spec', '--requires', 'blocker');
      const result = tasks('start', 'blocked');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('blocked by: blocker');
      expect(tasks('show', 'blocked').stdout).toContain('[task/open]');
    });
  });

  it('list defaults to not-closed (unreviewed + open + in-progress), highest severity first, with a state summary', () => {
    fixture(({ tasks }) => {
      tasks('add', 'low task', '--id', 'low-task', '--severity', 'low');
      tasks('add', 'high finding', '--id', 'high-finding', '--kind', 'finding', '--severity', 'high', '--deliverable', 'fix it');
      tasks('add', 'claimed task', '--id', 'claimed-task', '--severity', 'medium');
      tasks('start', 'claimed-task');
      tasks('add', 'closed task', '--id', 'closed-task');
      tasks('done', 'closed-task');

      const result = tasks('list');
      expect(result.status).toBe(0);
      const highIndex = result.stdout.indexOf('high-finding');
      const claimedIndex = result.stdout.indexOf('claimed-task');
      const lowIndex = result.stdout.indexOf('low-task');
      expect(highIndex).toBeGreaterThan(-1);
      expect(claimedIndex).toBeGreaterThan(highIndex);
      expect(lowIndex).toBeGreaterThan(claimedIndex);
      expect(result.stdout).not.toContain('closed-task');
      expect(result.stdout).toContain('3 task(s) — unreviewed: 1, open: 1, in-progress: 1, done: 0, declined: 0');
    });
  });

  it('list --state filters to a single state and overrides the not-closed default', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task');
      tasks('done', 'a-task');
      const result = tasks('list', '--state', 'done');
      expect(result.stdout).toContain('a-task');
      expect(result.stdout).toContain('1 task(s) — unreviewed: 0, open: 0, in-progress: 0, done: 1, declined: 0');
    });
  });

  it('search matches across a task and accepts the list filters', () => {
    fixture(({ tasks }) => {
      tasks('add', 'Close the remaining combat gaps', '--id', 'combat-gaps', '--severity', 'high');
      tasks('add', 'Layered droptables', '--id', 'droptables', '--severity', 'low', '--deliverable', 'give: is sugar for a single-entry COMBAT table');
      tasks('add', 'Rebuild the GUI', '--id', 'gui-rebuild', '--severity', 'low');

      const hits = tasks('search', 'combat');
      expect(hits.status).toBe(0);
      expect(hits.stdout).toContain('combat-gaps  [task/open/high]  (no system)  Close the remaining combat gaps  (matches: id, title)');
      expect(hits.stdout).toContain('droptables  [task/open/low]  (no system)  Layered droptables  (matches: deliverable)');
      expect(hits.stdout).not.toContain('gui-rebuild');

      expect(tasks('search', 'combat', '--severity', 'high').stdout).not.toContain('droptables');
    });
  });

  it('search refuses without a term', () => {
    fixture(({ tasks }) => {
      const result = tasks('search');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('usage: tasks search <term>');
    });
  });

  it('list filters by severity, system, spec and kind', () => {
    fixture(({ tasks }) => {
      tasks('add', 'runtime high', '--id', 'runtime-high', '--severity', 'high', '--system', 'Runtime', '--spec', 'demo-spec');
      tasks('add', 'ui low', '--id', 'ui-low', '--severity', 'low', '--system', 'UI', '--kind', 'finding', '--deliverable', 'fix it');

      expect(tasks('list', '--severity', 'high').stdout).toContain('runtime-high');
      expect(tasks('list', '--severity', 'high').stdout).not.toContain('ui-low');

      expect(tasks('list', '--system', 'UI').stdout).toContain('ui-low');
      expect(tasks('list', '--system', 'UI').stdout).not.toContain('runtime-high');

      expect(tasks('list', '--spec', 'demo-spec').stdout).toContain('runtime-high');
      expect(tasks('list', '--spec', 'demo-spec').stdout).not.toContain('ui-low');

      expect(tasks('list', '--kind', 'finding').stdout).toContain('ui-low');
      expect(tasks('list', '--kind', 'finding').stdout).not.toContain('runtime-high');
    });
  });

  it('list --deferred shows only open tasks with no spec, unreachable by any other verb', () => {
    fixture(({ tasks }) => {
      tasks('add', 'deferred task', '--id', 'deferred-task');
      tasks('add', 'fix now task', '--id', 'fix-now-task', '--spec', 'demo-spec');
      const result = tasks('list', '--deferred');
      expect(result.stdout).toContain('deferred-task');
      expect(result.stdout).not.toContain('fix-now-task');
    });
  });

  it('list refuses an invalid --state, --severity or --kind', () => {
    fixture(({ tasks }) => {
      expect(tasks('list', '--state', 'bogus').status).toBe(1);
      expect(tasks('list', '--severity', 'extreme').status).toBe(1);
      expect(tasks('list', '--kind', 'bogus').status).toBe(1);
    });
  });

  it('done closes an open, unblocked task and refuses a blocked one', () => {
    fixture(({ tasks }) => {
      tasks('add', 'blocker', '--id', 'blocker', '--spec', 'demo-spec');
      tasks('add', 'blocked', '--id', 'blocked', '--spec', 'demo-spec', '--requires', 'blocker');

      const refused = tasks('done', 'blocked');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('blocked by: blocker');

      const closed = tasks('done', 'blocker');
      expect(closed.status).toBe(0);
      expect(tasks('show', 'blocker').stdout).toContain('closed: ');

      const nowUnblocked = tasks('done', 'blocked');
      expect(nowUnblocked.status).toBe(0);
    });
  });

  // HEAD at `done`-time is, by definition, not the commit that closes the
  // task — that commit does not exist yet. A wrong SHA reads as an answer;
  // null reads as the gap it is.
  it('done stores no closing commit by default, since the closing commit does not exist at done-time', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'anchored task', '--id', 'anchored');
      const closed = tasks('done', 'anchored');
      expect(closed.status).toBe(0);
      const record = JSON.parse(readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8').trim());
      expect(record.closedCommit).toBeNull();
    });
  });

  it('done resolves a --commit revspec to a full SHA reachable from HEAD before storing it', () => {
    fixture(({ tasks, dir }) => {
      const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();
      tasks('add', 'anchored task', '--id', 'anchored');
      const closed = tasks('done', 'anchored', '--commit', head.slice(0, 12));
      expect(closed.status).toBe(0);
      const record = JSON.parse(readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8').trim());
      expect(record.closedCommit).toBe(head);
    });
  });

  it('done refuses a --commit that does not resolve to a real commit, leaving the task open', () => {
    fixture(({ tasks }) => {
      tasks('add', 'anchored task', '--id', 'anchored');
      const result = tasks('done', 'anchored', '--commit', '0123456789abcdef0123456789abcdef01234567');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('does not resolve to a commit');
      expect(tasks('show', 'anchored').stdout).toContain('[task/open]');
    });
  });

  it('done refuses a --commit that resolves but is not reachable from HEAD', () => {
    gitFixture(({ dir, commit, tasks }) => {
      tasks('add', 'anchored task', '--id', 'anchored');
      commit('add anchored task');
      spawnSync('git', ['checkout', '-q', '-b', 'stray'], { cwd: dir });
      const strayCommit = commit('stray work, never merged into demo-spec');
      spawnSync('git', ['checkout', '-q', 'demo-spec'], { cwd: dir });

      const result = tasks('done', 'anchored', '--commit', strayCommit);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('not reachable from HEAD');
      expect(tasks('show', 'anchored').stdout).toContain('[task/open]');
    });
  });

  // closedCommit answers "what commit closed this", but `done` cannot know
  // that at the time it runs (H6). `show` fills the gap after the fact by
  // walking git history over the store for the commit that flipped this
  // record to done — distinct from a recorded value, since it is a guess
  // about the past rather than a fact written at close-time.
  it('show derives the closing commit from git history when closedCommit was never recorded', () => {
    gitFixture(({ commit, tasks }) => {
      tasks('add', 'anchored task', '--id', 'anchored');
      commit('add anchored task');
      tasks('done', 'anchored');
      const closingCommit = commit('close anchored task');

      const result = tasks('show', 'anchored');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`closedCommit (derived): ${closingCommit}`);
    });
  });

  it('show falls back to unanchored when no closing commit is recorded and none can be derived', () => {
    fixture(({ tasks }) => {
      tasks('add', 'anchored task', '--id', 'anchored');
      tasks('done', 'anchored');
      const result = tasks('show', 'anchored');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('closedCommit: (none recorded, and none could be derived from git history)');
    });
  });

  it('show does not attempt derivation, and prints the recorded value, when closedCommit is set', () => {
    gitFixture(({ commit, tasks }) => {
      tasks('add', 'anchored task', '--id', 'anchored');
      const sha = commit('add anchored task');
      tasks('done', 'anchored', '--commit', sha);
      commit('unrelated later commit');

      const result = tasks('show', 'anchored');
      expect(result.stdout).toContain(`closedCommit: ${sha}`);
      expect(result.stdout).not.toContain('derived');
    });
  });

  it('decline requires a reason and is refused for undelivered tasks', () => {
    fixture(({ tasks }) => {
      tasks('add', 'stale finding', '--id', 'stale', '--kind', 'finding', '--deliverable', 'fix it');
      const missingReason = tasks('decline', 'stale');
      expect(missingReason.status).toBe(1);

      const declined = tasks('decline', 'stale', '--reason', 'already fixed elsewhere');
      expect(declined.status).toBe(0);
      expect(tasks('show', 'stale').stdout).toContain('reason: already fixed elsewhere');
    });
  });

  it('check reports zero errors on a clean store and a nonzero exit on a broken one', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'fine', '--system', 'Runtime');
      const clean = tasks('check');
      expect(clean.status).toBe(0);
      expect(clean.stdout).toContain('0 error(s)');

      writeFileSync(path.join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', title: 'a', kind: 'task', state: 'open', severity: null, system: 'Nonexistent', spec: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: null })}\n`, 'utf8');
      const broken = tasks('check');
      expect(broken.status).toBe(1);
      expect(broken.stderr).toContain('system not in systems.json');
    });
  });

  it('state-changing default-store writes warn when task state is only in the working tree', () => {
    defaultStoreGitFixture(({ tasks }) => {
      const result = tasks('add', 'Dirty tracked task', '--id', 'dirty-tracked');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('added dirty-tracked [task/open]');
      expect(result.stderr).toContain('warning: docs/tasks.jsonl has uncommitted task-state changes');
    });
  });

  it('check warns when the default store has uncommitted working-tree-only task state', () => {
    defaultStoreGitFixture(({ tasks }) => {
      expect(tasks('check').stderr).not.toContain('docs/tasks.jsonl has uncommitted task-state changes');

      tasks('add', 'Dirty tracked task', '--id', 'dirty-tracked');
      const result = tasks('check');
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('warning: docs/tasks.jsonl has uncommitted task-state changes');
      expect(result.stdout).toContain('1 warning(s)');
    });
  });

  // The failure this branch exists to prevent: a `done` mark that only ever
  // existed in the working tree is invisible to `git show HEAD:...`, so a
  // `closedCommit` field (which lives in the same file) can never detect it.
  // Only comparing the committed store against the working tree can.
  it('check reports a working-tree-only done mark as an error naming the task and its committed state', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      tasks('add', 'closable task', '--id', 'closable');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'add closable task'], { cwd: dir, encoding: 'utf8' });

      tasks('done', 'closable');
      const result = tasks('check');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('error: closable is done only in the working tree (committed state: open)');
    });
  });

  it('check reports a working-tree-only declined mark as an error', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      tasks('add', 'stale finding', '--id', 'stale', '--kind', 'finding', '--deliverable', 'fix it');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'add stale finding'], { cwd: dir, encoding: 'utf8' });

      tasks('decline', 'stale', '--reason', 'already fixed elsewhere');
      const result = tasks('check');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('error: stale is declined only in the working tree (committed state: unreviewed)');
    });
  });

  it('check reports a working-tree-only in-progress transition as a warning, not an error', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      tasks('add', 'startable task', '--id', 'startable');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'add startable task'], { cwd: dir, encoding: 'utf8' });

      tasks('start', 'startable');
      const result = tasks('check');
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('warning: startable is in-progress only in the working tree (committed state: open)');
    });
  });

  it('check does not flag a working-tree-only mark for a task that was never committed at all', () => {
    defaultStoreGitFixture(({ tasks }) => {
      tasks('add', 'never committed', '--id', 'uncommitted-only');
      const result = tasks('check');
      expect(result.stderr).not.toContain('only in the working tree');
    });
  });

  it('check degrades to no working-tree-comparison issue when there is no committed store (unborn HEAD)', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-no-commit-'));
    try {
      spawnSync('git', ['init', '-q'], { cwd: dir });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
      spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
      mkdirSync(path.join(dir, 'docs', 'specs'), { recursive: true });
      mkdirSync(path.join(dir, 'docs', 'audits'), { recursive: true });
      writeFileSync(path.join(dir, 'docs', 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nX.\n\nProof:\n\n- clause.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
      writeFileSync(path.join(dir, 'docs', 'audits', 'systems.json'), JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [] }), 'utf8');
      writeFileSync(path.join(dir, 'docs', 'tasks.jsonl'), `${JSON.stringify({ id: 'a', title: 'a', kind: 'task', state: 'done', severity: null, system: null, spec: null, clause: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: '2026-08-01', closedCommit: null })}\n`, 'utf8');
      // No commit at all — HEAD does not exist yet on this branch.
      const result = spawnSync(process.execPath, [tsx, script, 'check', '--branch', 'demo-spec'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain('only in the working tree');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('check warns when a done task names a closing commit not reachable from HEAD', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'anchored', title: 'anchored', kind: 'task', state: 'done', severity: null, system: null, spec: null, clause: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: '2026-08-01', closedCommit: '0123456789abcdef0123456789abcdef01234567' })}\n`, 'utf8');
      const result = tasks('check');
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('warning: anchored closed by a commit not reachable from HEAD');
    });
  });

  it('check reports a malformed store as a check error instead of a stack trace', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'tasks.jsonl'), '<<<<<<< HEAD\n', 'utf8');
      const result = tasks('check');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('malformed JSONL task record');
      expect(result.stderr).toContain('tasks.jsonl:1');
      expect(result.stderr).not.toContain('SyntaxError');
    });
  });

  it('check reports a malformed task shape as a check error instead of a stack trace', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'broken', title: 'missing fields' })}\n`, 'utf8');
      const result = tasks('check');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('task "broken" requires kind');
      expect(result.stderr).toContain('tasks.jsonl:1');
    });
  });

  it('every store-reading command reports a conflicted store as a diagnostic, not a stack trace', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'tasks.jsonl'), '<<<<<<< HEAD\n', 'utf8');

      const commands: Array<{ name: string; args: string[] }> = [
        { name: 'check', args: ['check'] },
        { name: 'next', args: ['next'] },
        { name: 'list', args: ['list'] },
        { name: 'show', args: ['show', 'ok'] },
        { name: 'start', args: ['start', 'ok'] },
        { name: 'done', args: ['done', 'ok'] },
        { name: 'handoff', args: ['handoff'] },
        { name: 'spec show', args: ['spec', 'show', 'demo-spec'] },
        { name: 'audit-prompt', args: ['audit-prompt', 'demo-spec'] },
      ];

      for (const { name, args } of commands) {
        const result = tasks(...args);
        expect(result.status, `${name} exit status`).toBe(1);
        expect(result.stderr, `${name} stderr`).toContain('malformed JSONL task record');
        expect(result.stderr, `${name} stderr`).toContain('tasks.jsonl:1');
        expect(result.stderr, `${name} stderr`).not.toContain('    at ');
        expect(result.stderr, `${name} stderr`).not.toContain('SyntaxError');
      }
    });
  });

  it('check ignores a directory named like a markdown spec file', () => {
    fixture(({ tasks, dir }) => {
      mkdirSync(path.join(dir, 'specs', 'not-a-file.md'));
      const result = tasks('check');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 error(s)');
    });
  });

  it('import parses H/M/L findings out of an audit doc into unreviewed tasks, and is idempotent on re-run', () => {
    fixture(({ tasks, dir }) => {
      const docPath = path.join(dir, 'runtime-2026-08-01.md');
      writeFileSync(docPath, ['## H1 — a real bug', 'src/runtime/save.ts:88 is where it lives.', '', '## L1 — a minor thing', 'body.'].join('\n'), 'utf8');

      const first = tasks('import', docPath);
      expect(first.status).toBe(0);
      expect(first.stdout).toContain('imported 2 finding(s)');

      const shown = tasks('show', 'runtime-2026-08-01-h1');
      expect(shown.stdout).toContain('[finding/unreviewed/high]');
      expect(shown.stdout).toContain('system: Runtime');
      expect(shown.stdout).toContain(`files: ${docPath}#H1`);

      const second = tasks('import', docPath);
      expect(second.stdout).toContain('imported 0 finding(s)');
      expect(second.stdout).toContain('2 already present, skipped');
    });
  });

  it('triage promotes, defers and declines findings, saving after every decision', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'promote me', '--id', 'promote-me', '--kind', 'finding', '--severity', 'high', '--system', 'Runtime', '--evidence', 'evidence text', '--deliverable', 'fix it');
      tasks('add', 'defer me', '--id', 'defer-me', '--kind', 'finding', '--severity', 'medium', '--deliverable', 'fix it');
      tasks('add', 'decline me', '--id', 'decline-me', '--kind', 'finding', '--severity', 'low', '--deliverable', 'fix it');

      const result = triage('1\n2\n3\nstale, superseded by later work\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 unreviewed finding(s) left');

      expect(tasks('show', 'promote-me').stdout).toContain('spec: demo-spec');
      expect(tasks('show', 'defer-me').stdout).toContain('spec: (deferred)');
      const declined = tasks('show', 'decline-me').stdout;
      expect(declined).toContain('reason: stale, superseded by later work');
    });
  });

  it('triage displays evidence and deliverable labelled, saying so explicitly when there is no proposed fix', () => {
    fixture(({ dir, triage }) => {
      // A finding with no deliverable can no longer be created via `add`
      // (the store predates that rule — 58 open tasks do exactly this, and
      // triage still has to display them), so this one is written directly.
      const storePath = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        storePath,
        `${JSON.stringify({ id: 'no-fix-yet', title: 'no fix yet', kind: 'finding', state: 'unreviewed', severity: 'high', system: null, spec: null, requires: [], files: [], deliverable: null, evidence: 'it breaks like this', source: null, reason: null, closed: null })}\n`,
        'utf8',
      );
      const result = triage('s\n');
      expect(result.stdout).toContain('evidence — what is broken:');
      expect(result.stdout).toContain('it breaks like this');
      expect(result.stdout).toContain('deliverable — the proposed fix:');
      expect(result.stdout).toContain('no proposed fix recorded');
    });
  });

  it('triage shows a recorded deliverable next to its evidence', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'has a fix', '--id', 'has-a-fix', '--kind', 'finding', '--severity', 'high', '--evidence', 'broken thing', '--deliverable', 'the proposed repair');
      const result = triage('s\n');
      expect(result.stdout).toContain('the proposed repair');
      expect(result.stdout).not.toContain('no proposed fix recorded');
    });
  });

  it('printEvidence wraps long text onto multiple indented lines, instead of one unbroken line, for both evidence and deliverable', () => {
    fixture(({ tasks, triage }) => {
      const longText = "loadSave gives activeAction, player and activeBuffs no check past isObject, so a body whose ids are all real but whose cadences is absent crashes the validator that exists to prevent it.";
      tasks('add', 'checkSave crashes', '--id', 'checksave-crashes', '--kind', 'finding', '--severity', 'high', '--evidence', longText, '--deliverable', longText);
      const result = triage('s\n');
      expect(result.stdout).not.toContain(longText);

      const indented = result.stdout.split('\n').filter((line) => line.startsWith('          ') && line.trim().length > 0);
      expect(indented.length).toBeGreaterThan(2); // multiple wrapped lines each for evidence and deliverable
      for (const line of indented) expect(line.length).toBeLessThanOrEqual(78);
    });
  });

  it('triage redirect replaces the deliverable, saves it, then re-asks for a decision on the same task', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'wrong fix', '--id', 'wrong-fix', '--kind', 'finding', '--severity', 'high', '--deliverable', 'the wrong fix');
      const result = triage('4\nthe right fix\n1\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 unreviewed finding(s) left');
      const shown = tasks('show', 'wrong-fix').stdout;
      expect(shown).toContain('deliverable: the right fix');
      expect(shown).toContain('spec: demo-spec');
    });
  });

  it('triage redirect is cancelled by an empty response, leaving the deliverable and the queue unchanged', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'wrong fix', '--id', 'wrong-fix', '--kind', 'finding', '--severity', 'high', '--deliverable', 'original fix');
      const result = triage('4\n\ns\n');
      expect(result.stdout).toContain('empty — redirect cancelled');
      expect(result.stdout).toContain('1 unreviewed finding(s) left');
      expect(tasks('show', 'wrong-fix').stdout).toContain('deliverable: original fix');
    });
  });

  it('triage quits early and leaves the rest unreviewed', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'first', '--id', 'first', '--kind', 'finding', '--severity', 'high', '--deliverable', 'fix it');
      tasks('add', 'second', '--id', 'second', '--kind', 'finding', '--severity', 'low', '--deliverable', 'fix it');

      const result = triage('q\n');
      expect(result.stdout).toContain('2 unreviewed finding(s) left');
      expect(tasks('show', 'first').stdout).toContain('unreviewed');
    });
  });

  it('spec new scaffolds a spec file and refuses to overwrite an existing one', () => {
    fixture(({ tasks, dir }) => {
      const created = tasks('spec', 'new', 'fresh-spec');
      expect(created.status).toBe(0);
      expect(readFileSync(path.join(dir, 'specs', 'fresh-spec.md'), 'utf8')).toContain('## Deliverable');

      const again = tasks('spec', 'new', 'fresh-spec');
      expect(again.status).toBe(1);
      expect(again.stderr).toContain('already exists');
    });
  });

  it('spec add joins named tasks to a spec regardless of their state, as long as they are not a pass 2+ finding', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task');
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--severity', 'low', '--deliverable', 'fix it');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--finding', 'pass one finding', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'seen in pass one');
      const added = tasks('spec', 'add', 'demo-spec', 'a-task', 'a-finding', 'demo-spec-pass1-pass-one-finding');
      expect(added.status).toBe(0);
      expect(tasks('show', 'a-task').stdout).toContain('spec: demo-spec');
      expect(tasks('show', 'a-finding').stdout).toContain('spec: demo-spec');
      expect(tasks('show', 'demo-spec-pass1-pass-one-finding').stdout).toContain('spec: demo-spec');
    });
  });

  it('spec add refuses an unknown spec or an unknown task', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task');
      expect(tasks('spec', 'add', 'no-such-spec', 'a-task').status).toBe(1);
      expect(tasks('spec', 'add', 'demo-spec', 'no-such-task').status).toBe(1);
    });
  });

  it('spec add refuses a pass 2+ finding, naming it and leaving it out of the spec', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--finding', 'late finding', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'seen late');
      const result = tasks('spec', 'add', 'demo-spec', 'a-task', 'demo-spec-pass2-late-finding');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('cannot be promoted');
      expect(result.stderr).toContain('demo-spec-pass2-late-finding');
      expect(tasks('show', 'a-task').stdout).toContain('spec: (deferred)');
      expect(tasks('show', 'demo-spec-pass2-late-finding').stdout).toContain('spec: (deferred)');
    });
  });

  it('spec remove sets spec back to null for the named ids', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task', '--spec', 'demo-spec');
      tasks('add', 'b task', '--id', 'b-task', '--spec', 'demo-spec');
      const removed = tasks('spec', 'remove', 'demo-spec', 'a-task', 'b-task');
      expect(removed.status).toBe(0);
      expect(removed.stdout).toContain('removed 2 task(s) from demo-spec');
      expect(tasks('show', 'a-task').stdout).toContain('spec: (deferred)');
      expect(tasks('show', 'b-task').stdout).toContain('spec: (deferred)');
    });
  });

  it('spec remove refuses an unknown spec', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task', '--spec', 'demo-spec');
      const result = tasks('spec', 'remove', 'no-such-spec', 'a-task');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no such spec');
      expect(tasks('show', 'a-task').stdout).toContain('spec: demo-spec');
    });
  });

  it('spec remove refuses an id that does not exist', () => {
    fixture(({ tasks }) => {
      const result = tasks('spec', 'remove', 'demo-spec', 'no-such-task');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no such task(s): no-such-task');
    });
  });

  it('spec remove refuses an id that is not a member of that spec', () => {
    fixture(({ tasks }) => {
      tasks('add', 'unrelated', '--id', 'unrelated');
      const result = tasks('spec', 'remove', 'demo-spec', 'unrelated');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('not member(s) of demo-spec: unrelated');
    });
  });

  it('spec remove refuses on an undelivered task, the same rule spec done --defer-open enforces', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met');
      const result = tasks('spec', 'remove', 'demo-spec', 'demo-spec-clause-1');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('undelivered task(s) cannot be removed');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('spec: demo-spec');
    });
  });

  it('spec show lists the deliverable and every member with its state', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const shown = tasks('spec', 'show', 'demo-spec');
      expect(shown.stdout).toContain('The first clause holds.');
      expect(shown.stdout).toContain('a-member');
      expect(shown.stdout).toContain('0 audit pass(es) recorded');
    });
  });

  it('spec <slug> is an alias for spec show <slug>', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      expect(tasks('spec', 'demo-spec').stdout).toBe(tasks('spec', 'show', 'demo-spec').stdout);
    });
  });

  it('spec freeze records the current deliverable as the baseline and refuses a second freeze', () => {
    fixture(({ tasks, dir }) => {
      const frozen = tasks('spec', 'freeze', 'demo-spec');
      expect(frozen.status).toBe(0);
      expect(frozen.stdout).toContain('froze demo-spec');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('## Baseline');
      expect(specText.match(/^## Deliverable$/gm)).toHaveLength(1);

      const again = tasks('spec', 'freeze', 'demo-spec');
      expect(again.status).toBe(1);
      expect(again.stderr).toContain('already has a frozen baseline');
    });
  });

  it('recording an audit pass establishes a baseline when none exists, and check --merge uses it to catch a later deliverable edit', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      expect(readFileSync(specPath, 'utf8')).not.toContain('## Baseline');

      const audited = tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      expect(audited.status).toBe(0);
      expect(audited.stdout).toContain("froze demo-spec's current ## Deliverable as its opening baseline");
      expect(readFileSync(specPath, 'utf8')).toContain('## Baseline');
      expect(tasks('check', '--merge').status).toBe(0);

      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('Something this branch promises.', 'Something entirely different, never audited.'), 'utf8');
      const drifted = tasks('check', '--merge');
      expect(drifted.status).toBe(1);
      expect(drifted.stderr).toContain("demo-spec's ## Deliverable text differs from its most recent amendment");
    });
  });

  it('a second audit pass does not re-freeze an existing baseline', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      const afterFirst = readFileSync(specPath, 'utf8').match(/^## Baseline$/gm);
      expect(afterFirst).toHaveLength(1);

      const second = tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      expect(second.stdout).not.toContain('froze demo-spec');
      expect(readFileSync(specPath, 'utf8').match(/^## Baseline$/gm)).toHaveLength(1);
    });
  });

  it('check warns when a spec has member task(s) but no recorded baseline, naming the fix', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('check');
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('demo-spec has member task(s) but no recorded baseline; run `tasks spec freeze demo-spec`');

      expect(tasks('spec', 'freeze', 'demo-spec').status).toBe(0);
      const after = tasks('check');
      expect(after.stderr).not.toContain('no recorded baseline');
    });
  });

  it('check does not warn about a baseline-less spec that has no members', () => {
    fixture(({ tasks }) => {
      const result = tasks('check');
      expect(result.stderr).not.toContain('no recorded baseline');
    });
  });

  it('tasks spec help lists freeze as a subcommand', () => {
    fixture(({ tasks }) => {
      const result = tasks('spec');
      expect(result.stderr).toContain('freeze');
    });
  });

  it('spec show --order lists dependencies before tasks that require them', () => {
    fixture(({ tasks }) => {
      tasks('add', 'dependent task', '--id', 'dependent', '--spec', 'demo-spec');
      tasks('add', 'blocker task', '--id', 'blocker', '--spec', 'demo-spec');
      tasks('edit', 'dependent', '--requires', 'blocker');

      const unordered = tasks('spec', 'show', 'demo-spec');
      expect(unordered.stdout.indexOf('dependent')).toBeLessThan(unordered.stdout.indexOf('blocker'));

      const ordered = tasks('spec', 'show', 'demo-spec', '--order');
      expect(ordered.stdout.indexOf('blocker')).toBeLessThan(ordered.stdout.indexOf('dependent'));
    });
  });

  it('spec done refuses while a member is neither done nor declined, and names it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('spec', 'done', 'demo-spec');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('a-member');
    });
  });

  it('spec done succeeds once every member is done or declined', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      tasks('done', 'a-member');
      const result = tasks('spec', 'done', 'demo-spec');
      expect(result.status).toBe(0);
    });
  });

  it('spec done --defer-open removes a straggler task from the spec instead of refusing', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('spec', 'done', 'demo-spec', '--defer-open');
      expect(result.status).toBe(0);
      expect(tasks('show', 'a-member').stdout).toContain('spec: (deferred)');
    });
  });

  it('spec amend refuses without --reason', () => {
    fixture(({ tasks }) => {
      const result = tasks('spec', 'amend', 'demo-spec');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('usage: tasks spec amend');
    });
  });

  it('spec amend refuses an unknown spec', () => {
    fixture(({ tasks }) => {
      const result = tasks('spec', 'amend', 'no-such-spec', '--reason', 'x');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no such spec');
    });
  });

  it('spec amend records the adopted deliverable under ## Amendments and leaves the live section intact', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('spec', 'amend', 'demo-spec', '--reason', 'understood the requirement better after implementing it');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('amended demo-spec');
      expect(result.stdout).toContain('recorded the current ## Deliverable as adopted');

      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('## Amendments');
      expect(specText).toContain('understood the requirement better after implementing it');
      expect(specText).toContain('#### Deliverable');
      // The live section is untouched: still exactly one real heading.
      expect((specText.match(/^## Deliverable$/gm) ?? []).length).toBe(1);
    });
  });

  it('spec amend refuses when the deliverable is unchanged since the last amendment', () => {
    fixture(({ tasks }) => {
      expect(tasks('spec', 'amend', 'demo-spec', '--reason', 'first').status).toBe(0);

      const second = tasks('spec', 'amend', 'demo-spec', '--reason', 'nothing actually changed');
      expect(second.status).toBe(1);
      expect(second.stderr).toContain('unchanged since the amendment of');
      expect(second.stderr).toContain('edit it first');
    });
  });

  it('check --merge compares the live deliverable against the most recent amendment once one exists, refusing on a later unrecorded edit', () => {
    fixture(({ tasks, dir }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      tasks('spec', 'amend', 'demo-spec', '--reason', 'clarified after implementation');

      const clean = tasks('check', '--merge');
      expect(clean.status).toBe(0);

      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      const original = readFileSync(specPath, 'utf8');
      writeFileSync(specPath, original.replace('Something this branch promises.', 'Something this branch promises, revised.'), 'utf8');

      const drifted = tasks('check', '--merge');
      expect(drifted.status).toBe(1);
      expect(drifted.stderr).toContain("differs from its most recent amendment");
    });
  });

  it('done on an undelivered task closes once the spec\'s latest audit pass grades its clause met', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('[undelivered/open/high]');

      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      const result = tasks('done', 'demo-spec-clause-1');
      expect(result.status).toBe(0);
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('closed: ');
    });
  });

  it('done on an undelivered task refuses while the latest audit pass still grades its clause unmet', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met');
      const result = tasks('done', 'demo-spec-clause-1');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('not met');
    });
  });

  it('done on an undelivered task refuses when no audit pass is recorded at all', () => {
    fixture(({ tasks, dir }) => {
      const storePath = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        storePath,
        `${JSON.stringify({ id: 'demo-spec-clause-1', title: 'Unmet deliverable clause 1', kind: 'undelivered', state: 'open', severity: 'high', system: null, spec: 'demo-spec', clause: 1, requires: [], files: [], deliverable: 'The first clause holds.', evidence: null, source: { spec: 'demo-spec', pass: 1 }, reason: null, closed: null })}\n`,
        'utf8',
      );
      const result = tasks('done', 'demo-spec-clause-1');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no recorded audit pass');
    });
  });

  it('done on an undelivered task refuses when its clause has been deleted from the spec outright', () => {
    fixture(({ tasks, dir }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      const storePath = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        storePath,
        `${JSON.stringify({ id: 'stale-clause', title: 'Unmet deliverable clause 9', kind: 'undelivered', state: 'open', severity: 'high', system: null, spec: 'demo-spec', clause: 9, requires: [], files: [], deliverable: 'a clause that used to exist', evidence: null, source: { spec: 'demo-spec', pass: 1 }, reason: null, closed: null })}\n`,
        'utf8',
      );
      const result = tasks('done', 'stale-clause');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('proof clause 9 is no longer in');
    });
  });

  it('an undelivered task survives its clause being reworded by an amendment, and closes on the next met verdict', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('[undelivered/open/high]');

      // The first audit stamped the clause, so the tag is already sitting in
      // the line a human rewords when they amend around it.
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('[c1] The first clause holds.', '[c1] The first clause holds, under a narrower reading.'), 'utf8');
      expect(tasks('spec', 'amend', 'demo-spec', '--reason', 'narrowed after implementing it').status).toBe(0);

      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      const result = tasks('done', 'demo-spec-clause-1');
      expect(result.status).toBe(0);
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('closed: ');
    });
  });

  it('a clause keeps its id when the Proof: list is reordered and a new clause is inserted above it', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met');

      writeFileSync(
        specPath,
        readFileSync(specPath, 'utf8').replace(
          '- [c1] The first clause holds.\n- [c2] The second clause holds.',
          '- A newly inserted clause.\n- [c2] The second clause holds.\n- [c1] The first clause holds.',
        ),
        'utf8',
      );

      const audited = tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--proof', '3=met');
      expect(audited.status).toBe(0);
      expect(audited.stdout).toContain("keep it when you reword or reorder");
      // The insertion took a fresh id instead of displacing clause 1's.
      expect(readFileSync(specPath, 'utf8')).toContain('- [c3] A newly inserted clause.');
      expect(tasks('done', 'demo-spec-clause-1').status).toBe(0);
    });
  });

  it('replacing an audited clause with an untagged new clause requires a fresh audit verdict', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');

      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- [c1] The first clause holds.', '- A replacement clause needs its own verdict.'), 'utf8');

      const result = tasks('check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('proof clause 3 has no verdict in the latest audit pass');
      expect(result.stderr).toContain('pass 1 graded proof clause 1, which is no longer in the deliverable');
    });
  });

  it('stamping a clause id is not deliverable drift — the gate compares the promise, not its bookkeeping', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      // Amend before any audit, so the archived baseline predates every tag.
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('Something this branch promises.', 'Something this branch promises, restated.'), 'utf8');
      expect(tasks('spec', 'amend', 'demo-spec', '--reason', 'restated before the first audit').status).toBe(0);

      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      expect(readFileSync(specPath, 'utf8')).toContain('- [c1] The first clause holds.');
      expect(tasks('check', '--merge').status).toBe(0);
    });
  });

  it('check refuses a spec whose clauses claim the same id, on every push and not only at the gate', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- The first clause holds.\n- The second clause holds.', '- [c1] The first clause holds.\n- [c1] The second clause holds.'), 'utf8');
      const result = tasks('check');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('demo-spec tags more than one proof clause [c1]');
    });
  });

  it('renumbering an unmet clause\'s tag cannot hide its verdict from the gate', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met');
      expect(tasks('check', '--merge').stderr).toContain('proof clause 1 is unmet as of pass 1');

      // Prose untouched — only the tag the unmet verdict resolves through.
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- [c1] The first clause holds.', '- [c2] The first clause holds.'), 'utf8');
      const after = tasks('check', '--merge');
      expect(after.status).toBe(1);
      expect(after.stderr).toContain('tags more than one proof clause [c2]');
      expect(after.stderr).toContain('pass 1 graded proof clause 1, which is no longer in the deliverable');
    });
  });

  it('a hand-edited tag reads as deliverable drift once an amendment gives the gate a baseline', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      tasks('spec', 'amend', 'demo-spec', '--reason', 'adopted after the first audit');
      expect(tasks('check', '--merge').status).toBe(0);

      // String.replace takes the first occurrence, which is the live
      // section — the archived copy under ## Amendments sits below it.
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- [c1] The first clause holds.', '- [c3] The first clause holds.'), 'utf8');
      const after = tasks('check', '--merge');
      expect(after.status).toBe(1);
      expect(after.stderr).toContain('## Deliverable text differs');
    });
  });

  it('spec amend refuses when the only change since the last amendment is the ids audit stamped on', () => {
    fixture(({ tasks }) => {
      expect(tasks('spec', 'amend', 'demo-spec', '--reason', 'adopted before any audit').status).toBe(0);
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');

      const second = tasks('spec', 'amend', 'demo-spec', '--reason', 'nothing but tags changed');
      expect(second.status).toBe(1);
      expect(second.stderr).toContain('unchanged since the amendment of');
    });
  });

  it('audit refuses a spec whose clauses carry the same tag twice', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- The first clause holds.\n- The second clause holds.', '- [c1] The first clause holds.\n- [c1] The second clause holds.'), 'utf8');
      const result = tasks('audit', 'demo-spec', '--proof', '1=met');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('demo-spec tags more than one proof clause [c1]');
    });
  });

  // The one call site the audit found unguarded: cmdAudit resolved
  // --base-branch's merge-base with a bare git call and no catch, so a
  // typo'd base name threw a raw Node stack instead of a diagnostic — the
  // exact defect Slice 1 fixed for `check` one command over.
  it('audit reports an unresolvable --base-branch as a diagnostic, not a stack trace', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--base-branch', 'no-such-base-branch-xyz');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('could not resolve a merge-base');
      expect(result.stderr).not.toContain('    at ');
      expect(result.stderr).not.toContain('Command failed');
    });
  });

  it('done is unaffected for a normal kind:task, met/unmet verdicts do not apply to it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'plain', '--id', 'plain');
      const result = tasks('done', 'plain');
      expect(result.status).toBe(0);
      expect(tasks('show', 'plain').stdout).toContain('closed: ');
    });
  });

  it('audit\'s interactive clause walk asks for evidence on a met verdict, not only unmet, and it survives to the spec file', () => {
    fixture(({ dir }) => {
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const globals = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'demo-spec'];
      const result = spawnSync(process.execPath, [tsx, script, 'audit', 'demo-spec', ...globals], {
        cwd: repoRoot,
        encoding: 'utf8',
        input: 'met\nmeasured 70ms\nmet\n\n',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('evidence (optional)');
      const specText = readFileSync(path.join(specsDir, 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: met — measured 70ms');
      expect(specText).toContain('- proof 2: met\n');
    });
  });

  it('audit refuses a --finding with no --deliverable, recording nothing', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--finding', 'undeliverable bug', '--severity', 'high');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('needs --deliverable');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit refuses a --finding with no --evidence, recording nothing', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--finding', 'unevidenced bug', '--severity', 'high', '--deliverable', 'fix it somehow');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('needs --evidence');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit carries a --finding\'s --evidence onto the finding task, where triage reads it', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--finding', 'a real bug', '--severity', 'high', '--deliverable', 'guard the null case', '--evidence', 'save.ts:88 dereferences before the null check');
      const shown = tasks('list', '--kind', 'finding', '--state', 'unreviewed');
      const id = shown.stdout.split('\n')[0].split(' ')[0];
      expect(tasks('show', id).stdout).toContain('evidence: save.ts:88 dereferences before the null check');
    });
  });

  it('--evidence stays clause-scoped before any --finding and finding-scoped after one, the way --file does', () => {
    fixture(({ tasks }) => {
      tasks(
        'audit',
        'demo-spec',
        '--proof',
        '1=unmet',
        '--evidence',
        '1=the clause did not hold',
        '--proof',
        '2=met',
        '--finding',
        'a separate bug',
        '--severity',
        'low',
        '--deliverable',
        'fix the separate bug',
        '--evidence',
        'the finding has its own evidence',
      );
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('evidence: the clause did not hold');
      const id = tasks('list', '--kind', 'finding', '--state', 'unreviewed').stdout.split('\n')[0].split(' ')[0];
      expect(tasks('show', id).stdout).toContain('evidence: the finding has its own evidence');
    });
  });

  it('clause-shaped evidence after a finding still goes to the clause rather than overwriting the finding', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=unmet', '--finding', 'some bug', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'broken here', '--evidence', '2=the clause did not hold');
      expect(result.status).toBe(0);
      expect(tasks('show', 'demo-spec-clause-2').stdout).toContain('evidence: the clause did not hold');
      const id = tasks('list', '--kind', 'finding', '--state', 'unreviewed').stdout.split('\n')[0].split(' ')[0];
      expect(tasks('show', id).stdout).toContain('evidence: broken here');
    });
  });

  it('audit refuses a second bare finding evidence instead of silently replacing the first', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--finding', 'some bug', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'first evidence', '--evidence', 'replacement evidence');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('already has evidence');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit carries a --finding\'s --deliverable onto the finding task it creates', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--finding', 'a real bug', '--severity', 'high', '--deliverable', 'guard the null case', '--evidence', 'null deref on an empty save');
      const shown = tasks('list', '--kind', 'finding', '--state', 'unreviewed');
      const id = shown.stdout.split('\n')[0].split(' ')[0];
      expect(tasks('show', id).stdout).toContain('deliverable: guard the null case');
    });
  });

  it('audit refuses when a proof clause is missing a verdict', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('missing');
      expect(result.stderr).toContain('2');
    });
  });

  it('audit-prompt prints a ready-to-use auditor prompt for a spec', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- [c1] The first clause holds.\n  proof: command node --version\n- [c2] The second clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
      tasks('add', 'prove the runtime behavior', '--id', 'runtime-proof', '--spec', 'demo-spec', '--severity', 'high', '--system', 'Runtime', '--files', 'src/runtime/runtime.ts:1', '--deliverable', 'runtime behavior is proven');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=measured directly', '--proof', '2=met');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You are auditing demo-spec on branch demo-spec.');

      expect(result.stdout).toContain('Required commands (all must pass):');
      expect(result.stdout).toContain('- npm test');
      expect(result.stdout).toContain('- npx tsc --noEmit');
      expect(result.stdout).toContain('- npm run layer-check');
      expect(result.stdout).toContain('- npm run tasks -- check');
      expect(result.stdout).toContain('- npm run tasks -- check --merge --spec demo-spec');

      expect(result.stdout).toContain('Relevant files:');
      expect(result.stdout).toContain('src/runtime/runtime.ts:1');

      expect(result.stdout).toContain('Proof clauses:');
      expect(result.stdout).toContain('[c1] The first clause holds.');
      expect(result.stdout).toContain('proof: command node --version');
      // Clause 1 carries a proof target — mechanically checkable, so it
      // gets the pure-logic/API mutation-testing line.
      expect(result.stdout).toContain('pure logic/API');
      // Clause 2 carries none — Slice 3's human-verification callout, and
      // Slice 6's guidance that actually distinguishes the UI case from
      // the logic case rather than repeating one blanket sentence.
      expect(result.stdout).toContain('[c2] The second clause holds.');
      expect(result.stdout).toContain('no proof target — requires human verification');
      expect(result.stdout).toContain('UI work');
      expect(result.stdout).toContain('1 of 2 clause(s) have no proof target');

      expect(result.stdout).toContain('Latest audit pass: pass 1');
      expect(result.stdout).toContain('runtime-proof [high] Runtime');
      expect(result.stdout).toContain('src/runtime/runtime.ts:1');
      expect(result.stdout).toContain('prefer mutation testing');
      expect(result.stdout).toContain('Do not promote pass-2+ findings.');
    });
  });

  // c5/M9: the diff range must be real, resolved SHAs — not a label — and
  // base and head must actually differ. `fixture`'s audit-prompt call runs
  // in-process, so its git resolution lands on whatever repository the test
  // suite itself happens to be checked out in; proving a real, non-degenerate
  // range needs its own dedicated repo instead, where the divergence is
  // ours to control.
  it('audit-prompt prints a real, resolved diff range from its own dedicated repo', () => {
    gitFixture(({ commit, tasks }) => {
      commit('A commit on demo-spec, after branching from main.');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      const diffRange = /Diff range: ([0-9a-f]{40})\.\.([0-9a-f]{40})/.exec(result.stdout);
      expect(diffRange).not.toBeNull();
      expect(diffRange![1]).not.toBe(diffRange![2]);
    });
  });

  it('audit-prompt refuses with a non-zero exit instead of printing an unresolved diff range', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec', '--base-branch', 'no-such-base-xyz');
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain('(unknown base)');
      expect(result.stdout).not.toContain('(unknown head)');
      expect(result.stdout).not.toContain('Diff range:');
      expect(result.stderr).toContain('no-such-base-xyz');
    });
  });

  it('audit-prompt falls back to the diff\'s changed files so relevant files survives a spec with no members', () => {
    gitFixture(({ commit, tasks }) => {
      commit('A commit on demo-spec, after branching from main.');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Member tasks:\n- none');
      expect(result.stdout).not.toContain('Relevant files:\n- none');
    });
  });

  it('audit records a pass, creates an undelivered task for an unmet clause, and records findings unreviewed', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks(
        'audit',
        'demo-spec',
        '--proof',
        '1=met',
        '--proof',
        '2=unmet',
        '--evidence',
        '2=it does not actually hold',
        '--file',
        '2=src/runtime/save.ts:88',
        '--finding',
        'a fresh bug',
        '--severity',
        'medium',
        '--system',
        'Runtime',
        '--deliverable',
        'add a guard before dereferencing',
        '--evidence',
        'save.ts:88 dereferences before the null check',
        '--file',
        'src/runtime/save.ts:1',
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recorded pass 1');
      expect(result.stdout).toContain('1 undelivered task(s)');
      expect(result.stdout).toContain('1 finding(s) recorded, unreviewed');

      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('## Audit passes');
      expect(specText).toContain('- proof 2: unmet — it does not actually hold');

      const undelivered = tasks('show', 'demo-spec-clause-2');
      expect(undelivered.stdout).toContain('[undelivered/open/high]');
      expect(undelivered.stdout).toContain('spec: demo-spec');
      expect(undelivered.stdout).toContain('files: src/runtime/save.ts:88');

      const finding = tasks('spec', 'show', 'demo-spec');
      expect(finding.stdout).not.toContain('a fresh bug'); // findings are not spec members until promoted
    });
  });

  it('--file on a proof clause carries multiple paths onto its undelivered task, and stays separate from a finding\'s own --file', () => {
    fixture(({ tasks }) => {
      tasks(
        'audit',
        'demo-spec',
        '--proof',
        '1=unmet',
        '--evidence',
        '1=nope',
        '--file',
        '1=src/runtime/save.ts:88',
        '--file',
        '1=src/runtime/save.test.ts',
        '--proof',
        '2=met',
        '--finding',
        'unrelated finding',
        '--severity',
        'low',
        '--deliverable',
        'unrelated fix',
        '--evidence',
        'unrelated breakage',
        '--file',
        'src/ui/foo.ts:1',
      );
      const undelivered = tasks('show', 'demo-spec-clause-1');
      expect(undelivered.stdout).toContain('files: src/runtime/save.ts:88, src/runtime/save.test.ts');
      expect(undelivered.stdout).not.toContain('src/ui/foo.ts:1');
    });
  });

  it('an unmet clause with no --file leaves the undelivered task with no files, unchanged', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met');
      const undelivered = tasks('show', 'demo-spec-clause-1');
      expect(undelivered.stdout).not.toContain('files:');
    });
  });

  it("audit's undelivered task cannot be declined, matching every other undelivered task", () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met');
      const result = tasks('decline', 'demo-spec-clause-1', '--reason', 'trying anyway');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('undelivered');
    });
  });

  it('a second unmet pass for the same clause reuses the open undelivered task rather than duplicating it', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=first', '--proof', '2=met');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=still not', '--proof', '2=met');
      const spec = tasks('spec', 'show', 'demo-spec');
      const occurrences = (spec.stdout.match(/demo-spec-clause-1/g) ?? []).length;
      expect(occurrences).toBe(1);
    });
  });

  it('check --merge passes once every proof clause is met in the latest pass and no member is open', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      const result = tasks('check', '--merge');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 issue(s)');
    });
  });

  it('check --merge runs proof command targets and reports a failing target by clause id', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The proof target passes.\n  proof: command node --version\n- [c2] The proof target fails.\n  proof: command node --definitely-not-a-real-node-flag\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');

      const result = tasks('check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('proof clause 2 target failed');
      expect(result.stderr).toContain('command node --definitely-not-a-real-node-flag');
      expect(result.stderr).not.toContain('proof clause 1 target failed');
    });
  });

  it('check --merge refuses when commits landed after the latest audit pass', () => {
    gitFixture(({ commit, tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met');
      commit('Later implementation\n\nA body after the audit.');

      const result = tasks('check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('latest audit pass');
      expect(result.stderr).toContain('1 commit(s) after that audit');
    });
  });

  it('check --merge names a changed path outside the audit record as the reason a pass is stale', () => {
    gitFixture(({ dir, tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met');
      writeFileSync(path.join(dir, 'src-change.txt'), 'not an audit record\n', 'utf8');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'Unrelated code change\n\nA body.'], { cwd: dir });

      const result = tasks('check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('src-change.txt');
    });
  });

  it('check --merge goes green when the only commit after an audit pass records the pass itself (spec + store)', () => {
    gitFixture(({ dir, tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met');
      spawnSync('git', ['add', 'specs/demo-spec.md', 'tasks.jsonl'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'Record audit pass\n\nA body.'], { cwd: dir });

      const result = tasks('check', '--merge');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 issue(s)');
    });
  });

  it('check --merge goes green when a post-audit commit also touches docs/audits', () => {
    gitFixture(({ dir, tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met');
      mkdirSync(path.join(dir, 'docs', 'audits'), { recursive: true });
      writeFileSync(path.join(dir, 'docs', 'audits', 'note.md'), 'An audit note.\n', 'utf8');
      spawnSync('git', ['add', 'specs/demo-spec.md', 'tasks.jsonl', 'docs/audits/note.md'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'Record audit pass and note\n\nA body.'], { cwd: dir });

      const result = tasks('check', '--merge');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 issue(s)');
    });
  });

  it('check --merge reports an unsupported proof target shape by clause id', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The proof target is unsupported.\n  proof: custom magic\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
      tasks('audit', 'demo-spec', '--proof', '1=met');

      const result = tasks('check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('proof clause 1 target has unsupported shape: custom magic');
    });
  });

  it('check --merge passes a vitest proof target that names one passing test in a file with other tests', () => {
    vitestFixtureFile((relPath) => {
      fixture(({ tasks, dir }) => {
        writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), `# Demo spec\n\n## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The proof target passes.\n  proof: vitest ${relPath} "proof fixture passes"\n\n## Decisions\n\n## Open questions\n\nNone.\n`, 'utf8');
        tasks('audit', 'demo-spec', '--proof', '1=met');

        const result = tasks('check', '--merge');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('0 issue(s)');
      });
    });
  });

  it("check --merge fails a vitest proof target whose file does not exist", () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The proof target has no file.\n  proof: vitest scripts/lib/does-not-exist-proof-fixture.test.ts "whatever"\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
      tasks('audit', 'demo-spec', '--proof', '1=met');

      const result = tasks('check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('proof clause 1');
      expect(result.stderr).toContain('test file does not exist');
      expect(result.stderr).toContain('scripts/lib/does-not-exist-proof-fixture.test.ts');
    });
  });

  it('check --merge fails a vitest proof target whose name matches no test in an existing file', () => {
    vitestFixtureFile((relPath) => {
      fixture(({ tasks, dir }) => {
        writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), `# Demo spec\n\n## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The proof target names no real test.\n  proof: vitest ${relPath} "there is no test with this name"\n\n## Decisions\n\n## Open questions\n\nNone.\n`, 'utf8');
        tasks('audit', 'demo-spec', '--proof', '1=met');

        const result = tasks('check', '--merge');
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('proof clause 1');
        expect(result.stderr).toContain('matched no test');
        expect(result.stderr).toContain('there is no test with this name');
      });
    });
  });

  it('check --merge fails a vitest proof target that names a skipped test, distinctly from a missing one', () => {
    vitestFixtureFile((relPath) => {
      fixture(({ tasks, dir }) => {
        writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), `# Demo spec\n\n## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The proof target names a skipped test.\n  proof: vitest ${relPath} "proof fixture is skipped"\n\n## Decisions\n\n## Open questions\n\nNone.\n`, 'utf8');
        tasks('audit', 'demo-spec', '--proof', '1=met');

        const result = tasks('check', '--merge');
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('proof clause 1');
        expect(result.stderr).toContain('skipped');
        expect(result.stderr).not.toContain('matched no test');
      });
    });
  });

  it('check --merge fails a vitest proof target whose named test fails, and reports the match count', () => {
    vitestFixtureFile((relPath) => {
      fixture(({ tasks, dir }) => {
        writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), `# Demo spec\n\n## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The proof target fails.\n  proof: vitest ${relPath} "proof fixture fails"\n\n## Decisions\n\n## Open questions\n\nNone.\n`, 'utf8');
        tasks('audit', 'demo-spec', '--proof', '1=met');

        const result = tasks('check', '--merge');
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('proof clause 1 target failed');
        expect(result.stderr).toContain('1/1');
      });
    });
  });

  it('check --merge passes a vitest proof target that matches more than one test, only if every match passes, and reports the count', () => {
    vitestFixtureFile((relPath) => {
      fixture(({ tasks, dir }) => {
        writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), `# Demo spec\n\n## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The proof target is over-broad but every match passes.\n  proof: vitest ${relPath} "shared title"\n\n## Decisions\n\n## Open questions\n\nNone.\n`, 'utf8');
        tasks('audit', 'demo-spec', '--proof', '1=met');

        const result = tasks('check', '--merge');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('0 issue(s)');
        expect(result.stderr).toContain('matched 2 test');
      });
    });
  });

  it('check --merge refuses when there is no recorded audit pass', () => {
    fixture(({ tasks }) => {
      const result = tasks('check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no recorded audit pass');
    });
  });

  it('check --merge passes when the branch has no active spec at all — the gate is opt-in, not universal', () => {
    fixture(({ dir }) => {
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const result = spawnSync(process.execPath, [tsx, script, 'check', '--merge', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'no-such-spec-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('not applicable');
    });
  });

  // A branch's CI run must not redden over a spec it has nothing to do
  // with — the gate is scoped to the branch's own spec (mergeGate.ts's
  // vacuous-pass comment), never to every open spec in the store.
  it('check --merge passes vacuously when the branch has no active spec, even though other specs have open members', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'open task', '--id', 'open-task', '--spec', 'demo-spec', '--severity', 'high');
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const result = spawnSync(process.execPath, [tsx, script, 'check', '--merge', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'renamed-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('not applicable');
      expect(result.stderr).not.toContain('open spec member(s) exist');
    });
  });

  // c4's regression: a branch renamed away from its spec's filename must
  // not make the merge gate not-applicable while that spec's members are
  // still open. Content, not name: the branch's own diff still touched
  // demo-spec.md (recording the audit pass), so the gate applies
  // regardless of what --branch says.
  it('check --merge applies to a branch renamed away from its spec\'s filename, as long as the branch\'s diff touched that spec file', () => {
    gitFixture(({ dir, tasks, tasksAs }) => {
      tasks('add', 'still open', '--id', 'still-open', '--spec', 'demo-spec', '--severity', 'high');
      tasks('audit', 'demo-spec', '--proof', '1=met');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'Record audit pass\n\nA body.'], { cwd: dir });

      const result = tasksAs('totally-different-branch-name', 'check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('member(s) of demo-spec neither done nor declined');
      expect(result.stderr).toContain('still-open');
    });
  });

  // M14, preserved under diff-based binding: a branch whose diff touches no
  // spec file at all must stay vacuous even though a spec living in the
  // same specs dir has an open member — the open member here is never
  // reachable by the diff (only an unrelated file changed), so the branch
  // name is the only other signal, and 'some-other-branch-name' matches
  // nothing on disk either.
  it("check --merge stays not applicable when the branch's diff touches no spec file, even though a spec in the same specs dir has open members", () => {
    gitFixture(({ commit, tasks, tasksAs }) => {
      tasks('add', 'still open', '--id', 'still-open', '--spec', 'demo-spec', '--severity', 'high');
      commit('Unrelated work\n\nA body.');

      const result = tasksAs('some-other-branch-name', 'check', '--merge');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('not applicable');
    });
  });

  // A branch that touches two spec files in one diff is ambiguous, not
  // vacuous and not resolved by guessing — checkMergeGate reports it and
  // names both candidates.
  it("check --merge reports ambiguity, naming both, when the branch's diff touches two spec files", () => {
    gitFixture(({ dir, tasks, tasksAs }) => {
      writeFileSync(path.join(dir, 'specs', 'other-spec.md'), '# Other spec\n\n## Deliverable\n\nOther promise.\n\nProof:\n\n- The only clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
      tasks('audit', 'demo-spec', '--proof', '1=met');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'Touch two specs\n\nA body.'], { cwd: dir });

      const result = tasksAs('feature-branch', 'check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('touches more than one spec file');
      expect(result.stderr).toContain('demo-spec');
      expect(result.stderr).toContain('other-spec');
    });
  });

  it('check --merge refuses when a promoted finding is still unreviewed', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--severity', 'low', '--deliverable', 'fix it');
      tasks('spec', 'add', 'demo-spec', 'a-finding');
      const result = tasks('check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('still unreviewed');
    });
  });

  it('handoff prints the last commit\'s Next: line, the spec deliverable, and open fix-now tasks', () => {
    fixture(({ tasks }) => {
      tasks('add', 'open task', '--id', 'open-task', '--spec', 'demo-spec', '--severity', 'high');
      tasks('add', 'claimed task', '--id', 'claimed-task', '--spec', 'demo-spec', '--severity', 'medium');
      tasks('start', 'claimed-task');
      const result = tasks('handoff');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('branch: demo-spec');
      expect(result.stdout).toContain('spec: demo-spec');
      expect(result.stdout).toContain('1. The first clause holds.');
      expect(result.stdout).toContain('2. The second clause holds.');
      expect(result.stdout).toContain('1 in-progress task(s):');
      expect(result.stdout).toContain('claimed-task');
      expect(result.stdout).toContain('open-task');
    });
  });

  it('handoff prints proof clauses numbered and truncated, not the whole ## Deliverable prose', () => {
    fixture(({ tasks, dir }) => {
      const longClause = 'x'.repeat(150);
      writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), `# Demo spec\n\n## Deliverable\n\nProse that should not appear in handoff's output at all.\n\nProof:\n\n- ${longClause}\n\n## Decisions\n\n## Open questions\n\nNone.\n`, 'utf8');
      const result = tasks('handoff');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('Prose that should not appear');
      expect(result.stdout).toContain('1. ' + 'x'.repeat(99) + '…');
      expect(result.stdout).not.toContain(longClause);
    });
  });

  it('handoff stays well under the 40-line cap proof clause 6 sets', () => {
    fixture(({ tasks }) => {
      tasks('add', 'open task', '--id', 'open-task', '--spec', 'demo-spec', '--severity', 'high');
      const result = tasks('handoff');
      const lineCount = result.stdout.split('\n').filter((line) => line.length > 0).length;
      expect(lineCount).toBeLessThan(40);
    });
  });

  it(
    'handoff stays under 40 lines with a queue well past the cap, each member naming files',
    () => {
      fixture(({ tasks }) => {
        for (let i = 0; i < 25; i++) {
          tasks('add', `open task ${i}`, '--id', `open-task-${i}`, '--spec', 'demo-spec', '--severity', 'high', '--files', `src/runtime/file-${i}.ts`);
        }
        const result = tasks('handoff');
        expect(result.status).toBe(0);
        const lineCount = result.stdout.split('\n').filter((line) => line.length > 0).length;
        expect(lineCount).toBeLessThan(40);
      });
    },
    20000,
  );

  it(
    'handoff truncates the queue at the cap and names how many were omitted and where to see them',
    () => {
      fixture(({ tasks }) => {
        for (let i = 0; i < 25; i++) {
          tasks('add', `open task ${i}`, '--id', `open-task-${i}`, '--spec', 'demo-spec', '--severity', 'high', '--files', `src/runtime/file-${i}.ts`);
        }
        const result = tasks('handoff');
        expect(result.stdout).toContain('25 open fix-now task(s):');
        expect(result.stdout).toContain('… 17 more, see `tasks list --spec demo-spec`');
      });
    },
    20000,
  );

  it('handoff names the branch and explains why there is no active spec when none matches it', () => {
    fixture(({ dir }) => {
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const result = spawnSync(process.execPath, [tsx, script, 'handoff', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'no-such-spec-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.stdout).toContain('branch: no-such-spec-branch');
      expect(result.stdout).toContain('no docs/specs/no-such-spec-branch.md');
    });
  });

  it('handoff captures the whole multi-line Next: trailer of the last commit, not just its first line', () => {
    gitFixture(({ commit, tasks }) => {
      commit('Subject line\n\nA body explaining the change.\n\nNext: first line of the trailer\nsecond line of the trailer\nthird line of the trailer.');
      const result = tasks('handoff');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('first line of the trailer');
      expect(result.stdout).toContain('second line of the trailer');
      expect(result.stdout).toContain('third line of the trailer.');
    });
  });

  it('handoff walks back past a commit with no Next: trailer and says how far back it found one', () => {
    gitFixture(({ commit, tasks }) => {
      const withTrailer = commit('First subject\n\nA body.\n\nNext: pick up the real work here.');
      commit('Second subject\n\nA mechanical commit with no trailer at all.');
      const result = tasks('handoff');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('pick up the real work here');
      expect(result.stdout).toContain(withTrailer.slice(0, 7));
      expect(result.stdout).toContain('1 commit back');
    });
  });

  it('handoff reports no Next: trailer found when none exists in recent history', () => {
    gitFixture(({ commit, tasks }) => {
      commit('Only subject, no body or trailer.');
      const result = tasks('handoff');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no Next: trailer found');
    });
  });

  it('handoff says the scan cap was reached instead of claiming the branch has no plan', () => {
    gitFixture(({ dir, commit, tasks }) => {
      commit('Previous branch landed\n\nA body.');
      spawnSync('git', ['branch', '-M', 'main'], { cwd: dir });
      spawnSync('git', ['checkout', '-q', '-b', 'demo-spec'], { cwd: dir });
      commit('Branch plan\n\nA body.\n\nNext: the older branch-local plan.');
      for (let i = 0; i < 4; i++) commit(`Fixup ${i}\n\nA mechanical commit with no trailer.`);

      const result = tasks('handoff', '--scan-cap', '3');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('the older branch-local plan');
      expect(result.stdout).toContain('no Next: trailer found in the last 3 branch commits');
      expect(result.stdout).not.toContain('nothing recorded since it left main');
    });
  });

  it('handoff skips the Next scan when the base branch cannot be resolved', () => {
    gitFixture(({ commit, tasks }) => {
      commit('Previous branch landed\n\nA body.\n\nNext: other branch plan.');

      const result = tasks('handoff', '--base-branch', 'missing-base');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('other branch plan');
      expect(result.stdout).toContain('could not find the branch point for missing-base');
    });
  });

  it('handoff does not reach past the branch point for a trailer that belongs to other work', () => {
    gitFixture(({ dir, commit, tasks }) => {
      commit('Previous branch landed\n\nA body.\n\nNext: start the combat continuation, a different branch entirely.');
      spawnSync('git', ['branch', '-M', 'main'], { cwd: dir });
      spawnSync('git', ['checkout', '-q', '-b', 'demo-spec'], { cwd: dir });
      commit('Created new task\n\nA body, but no trailer of its own yet.');

      const result = tasks('handoff');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('combat continuation');
      expect(result.stdout).toContain('no Next: trailer yet on this branch');
    });
  });

  it('handoff still walks back within the branch, so a trailerless commit does not hide the branch\'s own plan', () => {
    gitFixture(({ dir, commit, tasks }) => {
      commit('Previous branch landed\n\nA body.\n\nNext: start the combat continuation, a different branch entirely.');
      spawnSync('git', ['branch', '-M', 'main'], { cwd: dir });
      spawnSync('git', ['checkout', '-q', '-b', 'demo-spec'], { cwd: dir });
      const withTrailer = commit('Real work\n\nA body.\n\nNext: finish the thing this branch is for.');
      commit('Fixup\n\nA mechanical commit with no trailer.');

      const result = tasks('handoff');
      expect(result.stdout).toContain('finish the thing this branch is for');
      expect(result.stdout).toContain(withTrailer.slice(0, 7));
      expect(result.stdout).toContain('1 commit back');
      expect(result.stdout).not.toContain('combat continuation');
    });
  });

  it('next resolves the sole spec with open members when the branch matches no spec file, and says it was inferred', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'open task', '--id', 'open-task', '--spec', 'demo-spec', '--severity', 'high');
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const result = spawnSync(process.execPath, [tsx, script, 'next', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.stdout).toContain('spec inferred: demo-spec');
      expect(result.stdout).toContain('open task');
    });
  });

  it('next does not infer when two specs both have open members — as ambiguous as none', () => {
    fixture(({ tasks, dir }) => {
      const specsDir = path.join(dir, 'specs');
      writeFileSync(path.join(specsDir, 'other-spec.md'), '# Other spec\n\n## Deliverable\n\nAnother promise.\n\nProof:\n\n- a clause.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
      tasks('add', 'a', '--id', 'a-task', '--spec', 'demo-spec');
      tasks('add', 'b', '--id', 'b-task', '--spec', 'other-spec');
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const result = spawnSync(process.execPath, [tsx, script, 'next', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.stdout).toContain('no active spec for this branch');
    });
  });

  it('handoff infers the active spec the same way, printing why', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'open task', '--id', 'open-task', '--spec', 'demo-spec', '--severity', 'high');
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const result = spawnSync(process.execPath, [tsx, script, 'handoff', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.stdout).toContain('spec inferred: demo-spec');
      expect(result.stdout).toContain('spec: demo-spec');
    });
  });

  it('list infers the active spec and announces it, without narrowing which tasks it lists', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a task', '--id', 'a-task', '--spec', 'demo-spec');
      tasks('add', 'deferred task', '--id', 'deferred-task');
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const result = spawnSync(process.execPath, [tsx, script, 'list', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.stdout).toContain('spec inferred: demo-spec');
      expect(result.stdout).toContain('a-task');
      expect(result.stdout).toContain('deferred-task');
    });
  });

  it("triage promotes into the inferred spec when the branch matches no spec file", () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'fix-now anchor', '--id', 'anchor', '--spec', 'demo-spec');
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--severity', 'high', '--deliverable', 'fix it');
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const globals = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'];
      const result = spawnSync(process.execPath, [tsx, script, 'triage', ...globals], { cwd: repoRoot, encoding: 'utf8', input: '1\n' });
      expect(result.stdout).toContain('spec inferred: demo-spec');
      const shown = spawnSync(process.execPath, [tsx, script, 'show', 'a-finding', ...globals], { cwd: repoRoot, encoding: 'utf8' });
      expect(shown.stdout).toContain('spec: demo-spec');
    });
  });

  // Contrast with the sibling test above ("triage promotes into the
  // inferred spec"): read commands infer an active spec when exactly one
  // candidate has open members, but the merge gate never does, even in
  // that same unambiguous case — it stays "not applicable".
  it('check --merge never infers a spec — it stays "not applicable" even when exactly one spec has open members', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'open task', '--id', 'open-task', '--spec', 'demo-spec', '--severity', 'high');
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const result = spawnSync(process.execPath, [tsx, script, 'check', '--merge', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('not applicable');
    });
  });

  it('triage refuses to promote a finding sourced from an audit pass 2 or later', () => {
    fixture(({ tasks, triage }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--finding', 'late finding', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'seen late');
      const result = triage('1\n');
      expect(result.stdout).toContain('cannot be promoted');
      const shown = tasks('show', 'demo-spec-pass2-late-finding');
      expect(shown.stdout).toContain('spec: (deferred)');
    });
  });

  it('check-commit-msg passes a subject and body, with Next: optional', () => {
    fixture(({ tasks, dir }) => {
      const msgFile = path.join(dir, 'msg.txt');
      writeFileSync(msgFile, 'Subject\n\nA body explaining the change.\n', 'utf8');
      expect(tasks('check-commit-msg', msgFile).status).toBe(0);

      writeFileSync(msgFile, 'Subject\n\nA body explaining the change.\n\nNext: pick up X.\n', 'utf8');
      expect(tasks('check-commit-msg', msgFile).status).toBe(0);
    });
  });

  it('check-commit-msg refuses a subject-only message', () => {
    fixture(({ tasks, dir }) => {
      const msgFile = path.join(dir, 'msg.txt');
      writeFileSync(msgFile, 'Just a subject\n', 'utf8');
      const result = tasks('check-commit-msg', msgFile);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no body');
    });
  });

  it('check-commit-msg is exempt for a merge or revert regardless of body', () => {
    fixture(({ tasks, dir }) => {
      const msgFile = path.join(dir, 'msg.txt');
      writeFileSync(msgFile, 'Merge branch main\n', 'utf8');
      const result = tasks('check-commit-msg', msgFile, '--merge-or-revert');
      expect(result.status).toBe(0);
    });
  });

  it('check-commit-msg is exempt when every changed file is unowned', () => {
    fixture(({ tasks, dir }) => {
      const msgFile = path.join(dir, 'msg.txt');
      writeFileSync(msgFile, 'Update docs only\n', 'utf8');
      const result = tasks('check-commit-msg', msgFile, '--files', 'docs/specs/demo-spec.md,README.md');
      expect(result.status).toBe(0);
    });
  });

  it('check-commit-msg is not exempt when even one changed file is owned', () => {
    fixture(({ tasks, dir }) => {
      const msgFile = path.join(dir, 'msg.txt');
      writeFileSync(msgFile, 'Update docs and code\n', 'utf8');
      const result = tasks('check-commit-msg', msgFile, '--files', 'docs/specs/demo-spec.md,src/runtime/save.ts');
      expect(result.status).toBe(1);
    });
  });
});
