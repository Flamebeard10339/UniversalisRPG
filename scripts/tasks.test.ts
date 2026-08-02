import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { run as runTasks } from './tasks';

const repoRoot = path.join(import.meta.dirname, '..');
const today = new Date().toISOString().slice(0, 10);
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

// Backdates a claim in the store so coldness can be exercised without
// waiting COLD_CLAIM_DAYS for it — the record is otherwise the one `start`
// really wrote.
function ageClaim(dir: string, id: string, days: number): void {
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
function gitFixture(run: (context: { dir: string; commit: (message: string) => string; tasks: (...args: string[]) => Run }) => void): void {
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
        const result = spawnSync(process.execPath, [tsx, script, ...args, ...globals], { cwd: dir, encoding: 'utf8' });
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

// `list` prefixes its rows with whatever it had to infer to answer, so the
// id of the first row is the first row that looks like one, not line zero.
function firstListedId(stdout: string): string {
  const row = stdout.split('\n').find((line) => /^\S+ {2}\[/.test(line));
  if (row === undefined) throw new Error(`no task row in list output:\n${stdout}`);
  return row.split(' ')[0];
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

  // c9. `list --blocked` was the founding case: a planner asking what is
  // blocked got the whole unfiltered list and a zero exit, which reads as a
  // confident answer to a question the command never understood.
  it('refuses an unrecognised flag by name instead of answering the command without it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      for (const flag of ['--blocked', '--totallyfakeflag', '--merge']) {
        const result = tasks('list', flag);
        expect(result.status, flag).toBe(1);
        expect(result.stderr, flag).toContain(`unknown flag: ${flag}`);
        expect(result.stderr, flag).toContain('usage: tasks list');
        expect(result.stdout, flag).not.toContain('a-member');
      }
    });
  });

  // A flag a command never reads is the same defect wherever it appears:
  // `edit --state open` used to drop the flag and then report `nothing to
  // change`, which is a confident no-op.
  it('refuses a flag another verb owns rather than dropping it and reporting no change', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('edit', 'a-member', '--state', 'done');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown flag: --state');
      expect(result.stdout).not.toContain('nothing to change');
      expect(tasks('show', 'a-member').stdout).toContain('[task/open]');
    });
  });

  // A flag with no value used to become the string 'true', so `start x
  // --actor` recorded a holder named "true" — a fabricated fact, not a
  // missing one. Fixed where the flag is parsed, so the actor genuinely
  // named "true" is still recordable.
  it('refuses a value-taking flag given no value, rather than inventing one', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');

      const bare = tasks('start', 'a-member', '--actor');
      expect(bare.status).toBe(1);
      expect(bare.stderr).toContain('--actor needs a value');
      expect(tasks('show', 'a-member').stdout).toContain('[task/open]');

      tasks('start', 'a-member', '--actor', 'true');
      expect(tasks('show', 'a-member').stdout).toContain('claimed by true since');
    });
  });

  it('does not let a valueless flag swallow the positional that follows it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'blocker task', '--id', 'blocker', '--spec', 'demo-spec');
      tasks('add', 'held-up task', '--id', 'held-up', '--spec', 'demo-spec', '--requires', 'blocker');
      const result = tasks('spec', 'show', '--order', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout.indexOf('blocker')).toBeLessThan(result.stdout.indexOf('held-up'));
    });
  });

  it('answers --help on every command and subcommand, and names the flags it will accept', () => {
    fixture(({ tasks }) => {
      const commands = [['doctor'], ['add'], ['edit'], ['show'], ['list'], ['search'], ['next'], ['start'], ['stop'], ['done'], ['decline'], ['import'], ['triage'], ['audit-prompt'], ['handoff'], ['check-commit-msg'], ['spec'], ['spec', 'new'], ['spec', 'add'], ['spec', 'remove'], ['spec', 'show'], ['spec', 'done'], ['spec', 'amend']];
      for (const command of commands) {
        const result = tasks(...command, '--help');
        expect(result.status, command.join(' ')).toBe(0);
        expect(result.stdout, command.join(' ')).toContain(`usage: tasks ${command.join(' ')}`);
        expect(result.stderr, command.join(' ')).toBe('');
      }
      expect(tasks('spec', 'help').status).toBe(0);
      expect(tasks('spec', 'help').stdout).toContain('usage: tasks spec');
    });
  });

  it('validates the handoff scan cap rather than passing a NaN or a negative straight to git log', () => {
    fixture(({ tasks }) => {
      for (const value of ['abc', '-5', '0', '2.5']) {
        const result = tasks('handoff', '--scan-cap', value);
        expect(result.status, value).toBe(1);
        expect(result.stderr, value).toContain('--scan-cap must be a whole number of commits');
      }
      expect(tasks('handoff', '--scan-cap', '3').status).toBe(0);
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

  it('a question is a kind, reachable through the same add, list and show as every other record', () => {
    fixture(({ tasks }) => {
      const added = tasks('add', 'Does spec amend survive?', '--id', 'spec-amend-survives', '--kind', 'question', '--spec', 'demo-spec', '--system', 'Runtime', '--evidence', 'it writes a dated copy of the deliverable that nothing reads');
      expect(added.status).toBe(0);
      expect(added.stdout).toContain('added spec-amend-survives [question/open]');

      const shown = tasks('show', 'spec-amend-survives');
      expect(shown.stdout).toContain('[question/open]');
      expect(shown.stdout).toContain('spec: demo-spec');
      expect(shown.stdout).toContain('evidence: it writes a dated copy of the deliverable that nothing reads');

      const listed = tasks('list', '--kind', 'question');
      expect(listed.stdout).toContain('spec-amend-survives');
      expect(listed.stdout).toContain('1 task(s)');
      expect(tasks('list', '--kind', 'task').stdout).not.toContain('spec-amend-survives');
    });
  });

  it('a question closes on the answer the same way every other record does', () => {
    fixture(({ tasks }) => {
      tasks('add', 'Does spec amend survive?', '--id', 'spec-amend-survives', '--kind', 'question');
      const declined = tasks('decline', 'spec-amend-survives', '--reason', 'no: git log -p on the spec file already gives the archive');
      expect(declined.status).toBe(0);
      expect(tasks('show', 'spec-amend-survives').stdout).toContain('reason: no: git log -p on the spec file already gives the archive');
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

  it('edit refuses an unknown id, naming the nearest ids it could have meant', () => {
    fixture(({ tasks }) => {
      tasks('add', 'check the merge shell', '--id', 'pass1-check-merge-shell');
      const result = tasks('edit', 'pass1-check-merge', '--deliverable', 'x');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no such task: pass1-check-merge');
      expect(result.stderr).toContain('did you mean:');
      expect(result.stderr).toContain('pass1-check-merge-shell');
    });
  });

  it('show answers an unknown id with near matches and a zero exit, rather than refusing a read', () => {
    fixture(({ tasks }) => {
      tasks('add', 'check the merge shell', '--id', 'pass1-check-merge-shell');
      tasks('add', 'something else entirely', '--id', 'unrelated-record');

      const guessed = tasks('show', 'pass1-check-merge-shel');
      expect(guessed.status).toBe(0);
      expect(guessed.stderr).toBe('');
      expect(guessed.stdout).toContain('no such task: pass1-check-merge-shel');
      expect(guessed.stdout).toContain('pass1-check-merge-shell');
      expect(guessed.stdout).not.toContain('unrelated-record');
    });
  });

  it('show says there is no near match rather than printing an empty suggestion list', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'alpha');
      const result = tasks('show', 'zzzzz');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no near match among 1 record(s)');
    });
  });

  it('spec show names the specs that do exist when the slug does not', () => {
    fixture(({ tasks }) => {
      const result = tasks('spec', 'show', 'demo-spek');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no such spec: demo-spek');
      expect(result.stderr).toContain('demo-spec');
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

  it('edit records a --requires id that does not resolve, reports it, and does not let it block', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'editable', '--spec', 'demo-spec');
      const result = tasks('edit', 'editable', '--requires', 'ghost');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recorded 1 requirement(s) no record answers to: ghost');

      const shown = tasks('show', 'editable').stdout;
      expect(shown).toContain('requires: ghost (missing)');
      expect(shown).not.toContain('BLOCKED');
      expect(tasks('next').stdout).toContain('editable');
      expect(tasks('doctor').stdout).toContain('[error] editable requires unresolved id: ghost');
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

  // The evidence here is one unbroken line, which is the only shape `add`
  // can write: a concise form that shortened by line rather than by
  // character shortened nothing on a real record, and passed only against a
  // fixture that injected newlines.
  it('next summarizes prose by character and prints it whole only with --full', () => {
    fixture(({ tasks }) => {
      const tail = 'and this tail is what a form that shortens by line would still print in full';
      const longEvidence = `evidence that runs well past any single line a queue entry should occupy, ${tail}`;
      tasks('add', 'verbose task', '--id', 'verbose-task', '--severity', 'high', '--system', 'Runtime', '--spec', 'demo-spec', '--files', 'src/runtime/save.ts:1', '--deliverable', 'the fix exists', '--evidence', longEvidence);

      const concise = tasks('next');
      expect(concise.stdout).toContain('verbose-task  [task/open/high]');
      expect(concise.stdout).toContain('files: src/runtime/save.ts:1');
      expect(concise.stdout).toContain('evidence: evidence that runs well past');
      expect(concise.stdout).toContain('…');
      expect(concise.stdout).not.toContain(tail);

      const full = tasks('next', '--full');
      expect(full.stdout).toContain(longEvidence);
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

  it('a declined requirement stops blocking its dependents instead of stranding them forever', () => {
    fixture(({ tasks }) => {
      tasks('add', 'blocker', '--id', 'blocker', '--spec', 'demo-spec');
      tasks('add', 'dependent', '--id', 'dependent', '--spec', 'demo-spec', '--requires', 'blocker');
      tasks('decline', 'blocker', '--reason', 'the approach was wrong');

      expect(tasks('next').stdout).toContain('dependent');
      expect(tasks('show', 'dependent').stdout).toContain('requires: blocker (declined)');
      expect(tasks('show', 'dependent').stdout).not.toContain('BLOCKED');
    });
  });

  it('next says which requirement each blocked member is waiting on instead of going silent', () => {
    fixture(({ tasks }) => {
      tasks('add', 'blocker', '--id', 'blocker', '--spec', 'demo-spec');
      tasks('add', 'dependent', '--id', 'dependent', '--spec', 'demo-spec', '--requires', 'blocker');
      tasks('start', 'blocker');

      const next = tasks('next');
      expect(next.status).toBe(0);
      expect(next.stdout).toContain('no open, unblocked tasks in spec demo-spec');
      expect(next.stdout).toContain('1 open member(s) are waiting on a requirement');
      expect(next.stdout).toContain('- dependent waits on blocker');
    });
  });

  it('next returns a dependency cycle as the answer, naming the ring someone has to break', () => {
    fixture(({ tasks }) => {
      tasks('add', 'first', '--id', 'first', '--spec', 'demo-spec');
      tasks('add', 'second', '--id', 'second', '--spec', 'demo-spec', '--requires', 'first');
      tasks('edit', 'first', '--requires', 'second');

      const next = tasks('next');
      expect(next.status).toBe(0);
      expect(next.stdout).toContain('these block each other and someone must break the cycle:');
      expect(next.stdout).toMatch(/first -> second -> first|second -> first -> second/);
    });
  });

  it('next separates a filter that matched nothing from a queue that is genuinely empty', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a runtime task', '--id', 'runtime-task', '--spec', 'demo-spec', '--system', 'Runtime');
      const filtered = tasks('next', '--system', 'UI');
      expect(filtered.status).toBe(0);
      expect(filtered.stdout).toContain('1 open, unblocked member(s) exist but none match --system UI');
    });
  });

  it('next says a spec is fully accounted for rather than reporting the same emptiness as a spec with no members', () => {
    fixture(({ tasks }) => {
      const empty = tasks('next');
      expect(empty.stdout).toContain('demo-spec has no member tasks');

      tasks('add', 'only member', '--id', 'only-member', '--spec', 'demo-spec');
      tasks('done', 'only-member');
      expect(tasks('next').stdout).toContain('all 1 member(s) are accounted for — done: 1');
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

  it('start claims a blocked task and records that the requirement still stands', () => {
    fixture(({ tasks }) => {
      tasks('add', 'blocker', '--id', 'blocker', '--spec', 'demo-spec');
      tasks('add', 'blocked', '--id', 'blocked', '--spec', 'demo-spec', '--requires', 'blocker');

      const result = tasks('start', 'blocked');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('started while still waiting on blocker');
      expect(tasks('show', 'blocked').stdout).toContain('[task/in-progress]');
      expect(tasks('show', 'blocked').stdout).toContain('requires: blocker (waiting)');
    });
  });

  it('start reopens a declined record, clears its close and keeps the reason it was declined for', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a prediction', '--id', 'predicted', '--spec', 'demo-spec');
      tasks('decline', 'predicted', '--reason', 'the merge gate will make this moot');
      expect(tasks('show', 'predicted').stdout).toContain('closed: ');

      const reopened = tasks('start', 'predicted');
      expect(reopened.status).toBe(0);
      expect(reopened.stdout).toContain('reopened a declined record');
      expect(reopened.stdout).toContain('keeping its declined reason: the merge gate will make this moot');

      const shown = tasks('show', 'predicted').stdout;
      expect(shown).toContain('[task/in-progress]');
      expect(shown).toContain('reason: the merge gate will make this moot');
      expect(shown).not.toContain('closed: ');
    });
  });

  it('start records who holds the task and the day they claimed it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'claimed task', '--id', 'claimed', '--spec', 'demo-spec');

      const started = tasks('start', 'claimed', '--actor', 'worker-u5');
      expect(started.status).toBe(0);
      expect(started.stdout).toContain(`claimed by worker-u5 since ${today} (0 days)`);
      expect(tasks('show', 'claimed').stdout).toContain(`claimed by worker-u5 since ${today} (0 days)`);
    });
  });

  // c2: a missing actor is not a refusal. The claim is recorded either way,
  // and what could not be determined is said out loud.
  it('start with no --actor still records the claim, and says the holder went unnamed', () => {
    fixture(({ tasks }) => {
      tasks('add', 'claimed task', '--id', 'claimed', '--spec', 'demo-spec');

      const started = tasks('start', 'claimed');
      expect(started.status).toBe(0);
      expect(started.stdout).toContain('no --actor given: the claim is recorded with no holder named');
      expect(started.stdout).toContain('claimed by (unnamed) since');
      expect(tasks('show', 'claimed').stdout).toContain(`claimed by (unnamed) since ${today}`);
    });
  });

  it('start on a task someone already holds records the takeover instead of refusing or merging it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'contested task', '--id', 'contested', '--spec', 'demo-spec');
      tasks('start', 'contested', '--actor', 'worker-a');

      const takeover = tasks('start', 'contested', '--actor', 'worker-b');
      expect(takeover.status).toBe(0);
      expect(takeover.stdout).toContain('took over a claim: claimed by worker-a since');
      expect(takeover.stdout).toContain('the previous claim is replaced, not merged');

      const shown = tasks('show', 'contested').stdout;
      expect(shown).toContain('claimed by worker-b since');
      expect(shown).not.toContain('worker-a');
    });
  });

  // A closed record that kept its holder would be reported cold forever, on
  // work that is finished.
  it.each([
    ['stop', ['stop', 'held']],
    ['done', ['done', 'held']],
    ['decline', ['decline', 'held', '--reason', 'not worth it']],
  ])('%s releases the claim and says whose it was', (_name, argv) => {
    fixture(({ tasks }) => {
      tasks('add', 'held task', '--id', 'held', '--spec', 'demo-spec');
      tasks('start', 'held', '--actor', 'worker-a');

      const result = tasks(...argv);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('released the claim: claimed by worker-a since');

      const shown = tasks('show', 'held').stdout;
      expect(shown).not.toContain('claimed by');
      expect(tasks('doctor').stdout).not.toContain('still carries a claim');
    });
  });

  // A claim is only ever reported cold. Auto-releasing it would put two
  // agents on one task; saying who held it and for how long lets the next
  // agent decide in one read.
  it('next offers the coldest claim rather than reporting the spec as fully accounted for', () => {
    fixture(({ dir, tasks }) => {
      tasks('add', 'stalled task', '--id', 'stalled', '--spec', 'demo-spec');
      tasks('add', 'older stall', '--id', 'older', '--spec', 'demo-spec');
      tasks('start', 'stalled', '--actor', 'worker-a');
      tasks('start', 'older', '--actor', 'worker-b');
      ageClaim(dir, 'stalled', 4);
      ageClaim(dir, 'older', 9);

      const next = tasks('next');
      expect(next.status).toBe(0);
      expect(next.stdout).toContain('2 claim(s) there have gone cold');
      expect(next.stdout).toContain('older');
      expect(next.stdout).toContain('claimed by worker-b since');
      expect(next.stdout).toContain('(9 days, COLD');
      expect(next.stdout).toContain('nothing was released');
      expect(next.stdout).toContain('tasks start older --actor <you>');
      expect(next.stdout).not.toContain('all 2 member(s) are accounted for');
    });
  });

  it('next still recommends open work first, and reports a cold claim beside it rather than instead of it', () => {
    fixture(({ dir, tasks }) => {
      tasks('add', 'stalled task', '--id', 'stalled', '--spec', 'demo-spec');
      tasks('start', 'stalled', '--actor', 'worker-a');
      ageClaim(dir, 'stalled', 6);
      tasks('add', 'free task', '--id', 'free', '--spec', 'demo-spec');

      const next = tasks('next');
      expect(next.status).toBe(0);
      expect(next.stdout).toContain('free');
      expect(next.stdout).toContain('1 cold claim(s) in demo-spec, not offered ahead of open work');
      expect(next.stdout).toContain('- stalled  [task/in-progress]');
      expect(next.stdout).toContain('claimed by worker-a since');
    });
  });

  it('next answers a narrowed question with narrowed cold claims', () => {
    fixture(({ dir, tasks }) => {
      tasks('add', 'ui stall', '--id', 'ui-stall', '--spec', 'demo-spec', '--system', 'UI');
      tasks('start', 'ui-stall', '--actor', 'worker-a');
      ageClaim(dir, 'ui-stall', 6);

      expect(tasks('next', '--system', 'Runtime').stdout).not.toContain('ui-stall');
      expect(tasks('next', '--system', 'UI').stdout).toContain('ui-stall');
    });
  });

  it('list marks a cold claim on the row so a browse does not read it as ordinary work in flight', () => {
    fixture(({ dir, tasks }) => {
      tasks('add', 'stalled task', '--id', 'stalled', '--spec', 'demo-spec');
      tasks('add', 'fresh task', '--id', 'fresh', '--spec', 'demo-spec');
      tasks('start', 'stalled', '--actor', 'worker-a');
      tasks('start', 'fresh', '--actor', 'worker-b');
      ageClaim(dir, 'stalled', 6);

      const listed = tasks('list').stdout;
      expect(listed).toMatch(/stalled .*claimed by worker-a since .*COLD/);
      expect(listed).toMatch(/fresh .*claimed by worker-b since/);
      expect(listed.split('\n').filter((line) => line.includes('COLD'))).toHaveLength(1);
    });
  });

  it('show marks a cold claim, and doctor reports it as a warning without repairing it', () => {
    fixture(({ dir, tasks }) => {
      tasks('add', 'stalled task', '--id', 'stalled', '--spec', 'demo-spec');
      tasks('start', 'stalled', '--actor', 'worker-a');
      ageClaim(dir, 'stalled', 6);

      expect(tasks('show', 'stalled').stdout).toContain('(6 days, COLD — past the 3-day threshold, never auto-released)');

      const doctor = tasks('doctor', '--fix');
      expect(doctor.status).toBe(0);
      expect(doctor.stdout).toContain('[warning] stalled claimed by worker-a since');
      expect(doctor.stdout).toContain('COLD');
      expect(doctor.stdout).toContain('tasks start stalled --actor <you>');

      const after = tasks('show', 'stalled').stdout;
      expect(after).toContain('[task/in-progress]');
      expect(after).toContain('claimed by worker-a since');
    });
  });

  it('handoff names who holds each in-progress task, which is what a cold session came for', () => {
    fixture(({ dir, tasks }) => {
      tasks('add', 'stalled task', '--id', 'stalled', '--spec', 'demo-spec');
      tasks('start', 'stalled', '--actor', 'worker-a');
      ageClaim(dir, 'stalled', 6);

      const result = tasks('handoff');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('- stalled');
      expect(result.stdout).toContain('claimed by worker-a since');
      expect(result.stdout).toContain('COLD');
    });
  });

  it('a record walks start to done and back out again, each move naming the state it displaced', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the whole lifecycle', '--id', 'lifecycle', '--spec', 'demo-spec');

      expect(tasks('start', 'lifecycle').stdout).toContain('was open');
      expect(tasks('show', 'lifecycle').stdout).toContain('[task/in-progress]');

      const done = tasks('done', 'lifecycle');
      expect(done.status).toBe(0);
      expect(done.stdout).toContain('was in-progress');
      expect(tasks('show', 'lifecycle').stdout).toContain('closed: ');

      const reclosed = tasks('done', 'lifecycle');
      expect(reclosed.status).toBe(0);
      expect(reclosed.stdout).toContain('it was already done');
      expect(reclosed.stdout).toContain('the recorded close date stands:');

      const restarted = tasks('start', 'lifecycle');
      expect(restarted.stdout).toContain('reopened a done record');
      const shown = tasks('show', 'lifecycle').stdout;
      expect(shown).toContain('[task/in-progress]');
      expect(shown).not.toContain('closed: ');

      expect(tasks('stop', 'lifecycle').stdout).toContain('was in-progress');
      expect(tasks('show', 'lifecycle').stdout).toContain('[task/open]');
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

  it('done closes a blocked task and records which requirements were still open when it closed', () => {
    fixture(({ tasks }) => {
      tasks('add', 'blocker', '--id', 'blocker', '--spec', 'demo-spec');
      tasks('add', 'blocked', '--id', 'blocked', '--spec', 'demo-spec', '--requires', 'blocker');

      const closed = tasks('done', 'blocked');
      expect(closed.status).toBe(0);
      expect(closed.stdout).toContain('closed with 1 requirement(s) still open: blocker');
      expect(tasks('show', 'blocked').stdout).toContain('closed: ');

      const unblocked = tasks('done', 'blocker');
      expect(unblocked.status).toBe(0);
      expect(unblocked.stdout).not.toContain('still open');
      expect(tasks('show', 'blocker').stdout).toContain('closed: ');
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

  it('decline requires a reason, and closes a record from any state it was in', () => {
    fixture(({ tasks }) => {
      tasks('add', 'stale finding', '--id', 'stale', '--kind', 'finding', '--deliverable', 'fix it');
      const missingReason = tasks('decline', 'stale');
      expect(missingReason.status).toBe(1);

      const declined = tasks('decline', 'stale', '--reason', 'already fixed elsewhere');
      expect(declined.status).toBe(0);
      expect(tasks('show', 'stale').stdout).toContain('reason: already fixed elsewhere');

      tasks('add', 'in flight', '--id', 'in-flight', '--spec', 'demo-spec');
      tasks('start', 'in-flight');
      const late = tasks('decline', 'in-flight', '--reason', 'overtaken by events');
      expect(late.status).toBe(0);
      expect(late.stdout).toContain('was in-progress');
      expect(tasks('show', 'in-flight').stdout).toContain('[task/declined]');
    });
  });

  it('doctor reports an inconsistent store and still exits zero, because no disagreement may fail a build', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'fine', '--system', 'Runtime');
      const clean = tasks('doctor');
      expect(clean.status).toBe(0);
      expect(clean.stdout).toContain('0 error(s)');

      writeFileSync(path.join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', title: 'a', kind: 'task', state: 'open', severity: null, system: 'Nonexistent', spec: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: null })}\n`, 'utf8');
      const inconsistent = tasks('doctor');
      expect(inconsistent.status).toBe(0);
      expect(inconsistent.stdout).toContain('reported, not enforced');
      expect(inconsistent.stdout).toContain('[error] a has a system not in systems.json: Nonexistent');
    });
  });

  it('doctor exits non-zero on exactly one condition: a store that will not parse', () => {
    fixture(({ tasks, dir }) => {
      const store = path.join(dir, 'tasks.jsonl');
      tasks('add', 'fine');
      writeFileSync(store, `${readFileSync(store, 'utf8')}<<<<<<< HEAD\n`, 'utf8');

      const result = tasks('doctor');
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('1 unparseable line(s)');
      expect(result.stderr).toContain('the only condition doctor fails on');
    });
  });

  it('check names its replacement rather than reading as an unknown command', () => {
    fixture(({ tasks }) => {
      const result = tasks('check');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('`check` is now `doctor`');
    });
  });

  it('doctor repairs a close date left on a record that is not closed, and repairs nothing else', () => {
    fixture(({ tasks, dir }) => {
      const store = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        store,
        `${JSON.stringify({ id: 'reopened', title: 'reopened', kind: 'task', state: 'open', severity: null, system: null, spec: null, clause: null, requires: ['ghost'], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: '2026-08-01', closedCommit: null })}\n`,
        'utf8',
      );

      const reported = tasks('doctor');
      expect(reported.stdout).toContain('[warning] reopened is open but still carries a closed date: 2026-08-01');
      expect(reported.stdout).toContain('none of these has exactly one correct repair');
      expect(readFileSync(store, 'utf8')).toContain('2026-08-01');

      const fixed = tasks('doctor', '--fix');
      expect(fixed.status).toBe(0);
      expect(fixed.stdout).toContain('repaired 1:');
      expect(fixed.stdout).toContain('reopened is open: cleared its close date (2026-08-01)');
      expect(readFileSync(store, 'utf8')).not.toContain('2026-08-01');
      // The unresolved requirement is reported by both runs and repaired by
      // neither: dropping the edge and creating the task are both defensible.
      expect(fixed.stdout).toContain('[error] reopened requires unresolved id: ghost');
    });
  });

  it('doctor --fix declines to write when a line did not parse, because saving would delete it', () => {
    fixture(({ tasks, dir }) => {
      const store = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        store,
        `${JSON.stringify({ id: 'reopened', title: 'reopened', kind: 'task', state: 'open', severity: null, system: null, spec: null, clause: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: '2026-08-01', closedCommit: null })}\n<<<<<<< HEAD\n`,
        'utf8',
      );

      const result = tasks('doctor', '--fix');
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('--fix declined to write');
      expect(readFileSync(store, 'utf8')).toContain('<<<<<<< HEAD');
      expect(readFileSync(store, 'utf8')).toContain('2026-08-01');
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

  it('doctor reports that the default store has uncommitted working-tree-only task state', () => {
    defaultStoreGitFixture(({ tasks }) => {
      expect(tasks('doctor').stdout).not.toContain('docs/tasks.jsonl has uncommitted task-state changes');

      tasks('add', 'Dirty tracked task', '--id', 'dirty-tracked');
      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[warning] docs/tasks.jsonl has uncommitted task-state changes');
      expect(result.stdout).toContain('1 warning(s)');
    });
  });

  // The failure this branch exists to prevent: a `done` mark that only ever
  // existed in the working tree is invisible to `git show HEAD:...`, so a
  // `closedCommit` field (which lives in the same file) can never detect it.
  // Only comparing the committed store against the working tree can.
  it('doctor reports a working-tree-only done mark as an error naming the task and its committed state', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      tasks('add', 'closable task', '--id', 'closable');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'add closable task'], { cwd: dir, encoding: 'utf8' });

      tasks('done', 'closable');
      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[error] closable is done only in the working tree (committed state: open)');
    });
  });

  it('doctor reports a working-tree-only declined mark as an error', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      tasks('add', 'stale finding', '--id', 'stale', '--kind', 'finding', '--deliverable', 'fix it');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'add stale finding'], { cwd: dir, encoding: 'utf8' });

      tasks('decline', 'stale', '--reason', 'already fixed elsewhere');
      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[error] stale is declined only in the working tree (committed state: unreviewed)');
    });
  });

  it('doctor reports a working-tree-only in-progress transition as a warning, not an error', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      tasks('add', 'startable task', '--id', 'startable');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'add startable task'], { cwd: dir, encoding: 'utf8' });

      tasks('start', 'startable');
      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[warning] startable is in-progress only in the working tree (committed state: open)');
    });
  });

  it('doctor does not flag a working-tree-only mark for a task that was never committed at all', () => {
    defaultStoreGitFixture(({ tasks }) => {
      tasks('add', 'never committed', '--id', 'uncommitted-only');
      const result = tasks('doctor');
      expect(result.stdout).not.toContain('only in the working tree');
    });
  });

  it('doctor degrades to no working-tree-comparison issue when there is no committed store (unborn HEAD)', () => {
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
      const result = spawnSync(process.execPath, [tsx, script, 'doctor', '--branch', 'demo-spec'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('only in the working tree');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('doctor warns when a done task names a closing commit not reachable from HEAD', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'anchored', title: 'anchored', kind: 'task', state: 'done', severity: null, system: null, spec: null, clause: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: '2026-08-01', closedCommit: '0123456789abcdef0123456789abcdef01234567' })}\n`, 'utf8');
      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[warning] anchored closed by a commit not reachable from HEAD');
    });
  });

  it('doctor reports a malformed store as a diagnostic instead of a stack trace', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'tasks.jsonl'), '<<<<<<< HEAD\n', 'utf8');
      const result = tasks('doctor');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('malformed JSONL task record');
      expect(result.stderr).toContain('tasks.jsonl:1');
      expect(result.stderr).not.toContain('SyntaxError');
    });
  });

  it('doctor reports a malformed task shape as a diagnostic instead of a stack trace', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'broken', title: 'missing fields' })}\n`, 'utf8');
      const result = tasks('doctor');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('task "broken" requires kind');
      expect(result.stderr).toContain('tasks.jsonl:1');
    });
  });

  it('every store-writing command reports a conflicted store as a diagnostic, not a stack trace', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'tasks.jsonl'), '<<<<<<< HEAD\n', 'utf8');

      const commands: Array<{ name: string; args: string[] }> = [
        { name: 'add', args: ['add', 'a task'] },
        { name: 'edit', args: ['edit', 'ok', '--title', 'x'] },
        { name: 'start', args: ['start', 'ok'] },
        { name: 'stop', args: ['stop', 'ok'] },
        { name: 'done', args: ['done', 'ok'] },
        { name: 'decline', args: ['decline', 'ok', '--reason', 'x'] },
        { name: 'spec add', args: ['spec', 'add', 'demo-spec', 'ok'] },
        { name: 'spec remove', args: ['spec', 'remove', 'demo-spec', 'ok'] },
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

  it('every store-reading command answers over an unparseable line, skipping it and noting the skip in a footer', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a readable task', '--id', 'readable', '--spec', 'demo-spec');
      const store = path.join(dir, 'tasks.jsonl');
      writeFileSync(store, `<<<<<<< HEAD\n${readFileSync(store, 'utf8')}`, 'utf8');

      const commands: Array<{ name: string; args: string[] }> = [
        { name: 'next', args: ['next'] },
        { name: 'list', args: ['list'] },
        { name: 'show', args: ['show', 'readable'] },
        { name: 'search', args: ['search', 'readable'] },
        { name: 'handoff', args: ['handoff'] },
        { name: 'spec show', args: ['spec', 'show', 'demo-spec'] },
      ];

      for (const { name, args } of commands) {
        const result = tasks(...args);
        expect(result.status, `${name} exit status`).toBe(0);
        expect(result.stdout, `${name} stdout`).toContain('readable');
        expect(result.stdout, `${name} stdout`).toContain('skipped 1 unparseable store line(s)');
        expect(result.stdout, `${name} stdout`).toContain('tasks.jsonl:1');
        expect(result.stderr, `${name} stderr`).not.toContain('    at ');
      }
    });
  });

  it('the skip footer follows the answer rather than replacing it, and names the write consequence', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a readable task', '--id', 'readable', '--spec', 'demo-spec');
      const store = path.join(dir, 'tasks.jsonl');
      writeFileSync(store, `${readFileSync(store, 'utf8')}{"id":"half-written"\n`, 'utf8');

      const listed = tasks('list');
      expect(listed.stdout.indexOf('readable')).toBeLessThan(listed.stdout.indexOf('skipped 1 unparseable'));
      expect(listed.stdout).toContain('write commands refuse until these parse');

      const write = tasks('edit', 'readable', '--title', 'renamed');
      expect(write.status).toBe(1);
      expect(readFileSync(store, 'utf8')).toContain('half-written');
    });
  });

  it('doctor ignores a directory named like a markdown spec file', () => {
    fixture(({ tasks, dir }) => {
      mkdirSync(path.join(dir, 'specs', 'not-a-file.md'));
      const result = tasks('doctor');
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

  it('spec add joins named tasks to a spec regardless of their state', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task');
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--severity', 'low', '--deliverable', 'fix it');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'pass one finding', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'seen in pass one');
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

  it('spec add promotes a pass 2+ finding and records that it extends what the spec owes', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'late finding', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'seen late');
      const result = tasks('spec', 'add', 'demo-spec', 'a-task', 'demo-spec-pass2-late-finding');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('came from a pass 2 or later audit, which extends what demo-spec owes');
      expect(result.stdout).toContain('demo-spec-pass2-late-finding (pass 2)');
      expect(tasks('show', 'a-task').stdout).toContain('spec: demo-spec');
      expect(tasks('show', 'demo-spec-pass2-late-finding').stdout).toContain('spec: demo-spec');
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
      expect(result.stderr).toContain('no such task: no-such-task');
    });
  });

  it('spec remove reports an id that was not a member rather than refusing the whole call', () => {
    fixture(({ tasks }) => {
      tasks('add', 'unrelated', '--id', 'unrelated');
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('spec', 'remove', 'demo-spec', 'unrelated', 'a-member');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('named a different spec, or none, and now name none: unrelated');
      expect(tasks('show', 'a-member').stdout).toContain('spec: (deferred)');
    });
  });

  it('spec remove drops an undelivered task out of its spec and records that the clause is now tracked by none', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const result = tasks('spec', 'remove', 'demo-spec', 'demo-spec-clause-1');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("were demo-spec's outstanding promises");
      expect(result.stdout).toContain('tracked by no spec: demo-spec-clause-1');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('spec: (deferred)');
    });
  });

  it('spec show lists the deliverable and every member with its state', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const shown = tasks('spec', 'show', 'demo-spec');
      expect(shown.stdout).toContain('The first clause holds.');
      expect(shown.stdout).toContain('a-member  [task/open]');
      expect(shown.stdout).toContain('0 audit pass(es) recorded');
    });
  });

  // c9: one printer renders a task everywhere it appears. The tag is the
  // part that had to travel — `handoff` printed severity alone, so a
  // question awaiting a human sat in the fix-now queue reading exactly like
  // work to implement.
  it('renders the same kind, state and severity tag in every view a task appears in', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a question for a human', '--id', 'a-question', '--kind', 'question', '--spec', 'demo-spec', '--severity', 'high');
      const views = [['list'], ['search', 'question'], ['next'], ['show', 'a-question'], ['spec', 'show', 'demo-spec'], ['handoff']];
      for (const view of views) {
        const result = tasks(...view);
        expect(result.status, view.join(' ')).toBe(0);
        expect(result.stdout, view.join(' ')).toContain('a-question  [question/open/high]');
      }
    });
  });

  it('shows a held member as in-progress in every view, rather than as open work', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec', '--severity', 'medium');
      tasks('start', 'a-member', '--actor', 'worker-a');
      for (const view of [['list'], ['spec', 'show', 'demo-spec'], ['show', 'a-member'], ['handoff']]) {
        const result = tasks(...view);
        expect(result.status, view.join(' ')).toBe(0);
        expect(result.stdout, view.join(' ')).toContain('a-member  [task/in-progress/medium]');
      }
    });
  });

  it('marks a member BLOCKED in every view, not only in next', () => {
    fixture(({ tasks }) => {
      tasks('add', 'blocker task', '--id', 'blocker', '--spec', 'demo-spec');
      tasks('add', 'held-up task', '--id', 'held-up', '--spec', 'demo-spec', '--requires', 'blocker');
      for (const view of [['list'], ['spec', 'show', 'demo-spec'], ['show', 'held-up']]) {
        const result = tasks(...view);
        expect(result.stdout, view.join(' ')).toContain('held-up  [task/open]  BLOCKED');
      }
    });
  });

  it('spec show names each outstanding clause and its status rather than scoring the spec', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=measured directly', '--proof', '2=unmet', '--evidence', '2=it fails');
      const shown = tasks('spec', 'show', 'demo-spec');
      expect(shown.stdout).toContain('pass 1 (');
      expect(shown.stdout).toContain('outstanding: c2 (unmet)');
      expect(shown.stdout).not.toContain('clauses met');
      expect(shown.stdout).not.toMatch(/\d+\/\d+/);
    });
  });

  it('spec show reports a clause the latest pass never graded as outstanding and unknown', () => {
    fixture(({ tasks, dir }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=measured directly', '--proof', '2=met', '--evidence', '2=read the diff');
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- [c2] The second clause holds.', '- [c2] The second clause holds.\n- A clause added after the pass.'), 'utf8');
      const shown = tasks('spec', 'show', 'demo-spec');
      expect(shown.stdout).toContain('clause standing (latest pass 1): outstanding: c3 (unknown)');
    });
  });

  it('spec show with no audit pass calls every clause unknown rather than saying nothing about them', () => {
    fixture(({ tasks }) => {
      expect(tasks('spec', 'show', 'demo-spec').stdout).toContain('clause standing (no audit pass recorded): outstanding: c1 (unknown), c2 (unknown)');
    });
  });

  it('spec <slug> is an alias for spec show <slug>', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      expect(tasks('spec', 'demo-spec').stdout).toBe(tasks('spec', 'show', 'demo-spec').stdout);
    });
  });

  it('recording an audit pass leaves the spec with exactly one Deliverable section and no baseline', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      const audited = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(audited.status).toBe(0);
      const specText = readFileSync(specPath, 'utf8');
      expect(specText).not.toContain('## Baseline');
      expect(specText.match(/^## Deliverable$/gm)).toHaveLength(1);
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

  it('spec done reports that a spec is not done, naming every member that is not, and does not fail a build over it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('spec', 'done', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('demo-spec is not done');
      expect(result.stdout).toContain('- a-member  [task/open]  (no system)  a member');
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

  it('done on an undelivered task closes once the spec\'s latest audit pass grades its clause met', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('[undelivered/open/high]');

      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const result = tasks('done', 'demo-spec-clause-1');
      expect(result.status).toBe(0);
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('closed: ');
    });
  });

  it('done on an undelivered task closes against an unmet verdict, recording the verdict it closed against', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const result = tasks('done', 'demo-spec-clause-1');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('clause standing at close: proof clause 1 is unmet in the latest audit pass (pass 1)');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('closed: ');
    });
  });

  it('done on an undelivered task reports a clause the latest pass never graded as unknown, not as unmet', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      tasks('audit', 'demo-spec', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const result = tasks('done', 'demo-spec-clause-1');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('clause standing at close: proof clause 1 is unknown in the latest audit pass (pass 2) — nobody graded it');
      expect(result.stdout).not.toContain('is unmet in the latest audit pass (pass 2)');
    });
  });

  it('done on an undelivered task closes when no audit pass is recorded at all, and says so', () => {
    fixture(({ tasks, dir }) => {
      const storePath = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        storePath,
        `${JSON.stringify({ id: 'demo-spec-clause-1', title: 'Unmet deliverable clause 1', kind: 'undelivered', state: 'open', severity: 'high', system: null, spec: 'demo-spec', clause: 1, requires: [], files: [], deliverable: 'The first clause holds.', evidence: null, source: { spec: 'demo-spec', pass: 1 }, reason: null, closed: null })}\n`,
        'utf8',
      );
      const result = tasks('done', 'demo-spec-clause-1');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('clause standing at close: demo-spec has no recorded audit pass');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('closed: ');
    });
  });

  it('done on an undelivered task closes when its clause has been deleted from the spec outright, and says which clause is gone', () => {
    fixture(({ tasks, dir }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const storePath = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        storePath,
        `${JSON.stringify({ id: 'stale-clause', title: 'Unmet deliverable clause 9', kind: 'undelivered', state: 'open', severity: 'high', system: null, spec: 'demo-spec', clause: 9, requires: [], files: [], deliverable: 'a clause that used to exist', evidence: null, source: { spec: 'demo-spec', pass: 1 }, reason: null, closed: null })}\n`,
        'utf8',
      );
      const result = tasks('done', 'stale-clause');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('clause standing at close: proof clause 9 is no longer in');
      expect(tasks('show', 'stale-clause').stdout).toContain('closed: ');
    });
  });

  it('an undelivered task survives its clause being reworded by an amendment, and closes on the next met verdict', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('[undelivered/open/high]');

      // The first audit stamped the clause, so the tag is already sitting in
      // the line a human rewords when they amend around it.
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('[c1] The first clause holds.', '[c1] The first clause holds, under a narrower reading.'), 'utf8');
      expect(tasks('spec', 'amend', 'demo-spec', '--reason', 'narrowed after implementing it').status).toBe(0);

      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const result = tasks('done', 'demo-spec-clause-1');
      expect(result.status).toBe(0);
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('closed: ');
    });
  });

  it('a clause keeps its id when the Proof: list is reordered and a new clause is inserted above it', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met', '--evidence', '2=clause 2 checked');

      writeFileSync(
        specPath,
        readFileSync(specPath, 'utf8').replace(
          '- [c1] The first clause holds.\n- [c2] The second clause holds.',
          '- A newly inserted clause.\n- [c2] The second clause holds.\n- [c1] The first clause holds.',
        ),
        'utf8',
      );

      const audited = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--proof', '3=met', '--evidence', '3=clause 3 checked');
      expect(audited.status).toBe(0);
      expect(audited.stdout).toContain("keep it when you reword or reorder");
      // The insertion took a fresh id instead of displacing clause 1's.
      expect(readFileSync(specPath, 'utf8')).toContain('- [c3] A newly inserted clause.');
      expect(tasks('done', 'demo-spec-clause-1').status).toBe(0);
    });
  });

  it('doctor reports a spec whose clauses claim the same id', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- The first clause holds.\n- The second clause holds.', '- [c1] The first clause holds.\n- [c1] The second clause holds.'), 'utf8');
      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[error] demo-spec tags more than one proof clause [c1]');
    });
  });

  it('spec amend refuses when the only change since the last amendment is the ids audit stamped on', () => {
    fixture(({ tasks }) => {
      expect(tasks('spec', 'amend', 'demo-spec', '--reason', 'adopted before any audit').status).toBe(0);
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');

      const second = tasks('spec', 'amend', 'demo-spec', '--reason', 'nothing but tags changed');
      expect(second.status).toBe(1);
      expect(second.stderr).toContain('unchanged since the amendment of');
    });
  });

  it('audit refuses a spec whose clauses carry the same tag twice', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- The first clause holds.\n- The second clause holds.', '- [c1] The first clause holds.\n- [c1] The second clause holds.'), 'utf8');
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked');
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
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--base-branch', 'no-such-base-branch-xyz');
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

  function walkClauses(dir: string, input: string): Run {
    const globals = ['--store', path.join(dir, 'tasks.jsonl'), '--systems', path.join(dir, 'systems.json'), '--specs-dir', path.join(dir, 'specs'), '--branch', 'demo-spec'];
    const result = spawnSync(process.execPath, [tsx, script, 'audit', 'demo-spec', ...globals], { cwd: repoRoot, encoding: 'utf8', input });
    return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
  }

  it('audit\'s interactive clause walk holds a met verdict until evidence is typed, and it survives to the spec file', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'met\n\nmeasured 70ms\nmet\nread the diff\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('evidence (required for met)');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: met — measured 70ms');
      expect(specText).toContain('- proof 2: met — read the diff');
    });
  });

  it('audit\'s interactive clause walk offers unknown as a third answer and leaves its evidence optional', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'unknown\n\nunmet\n\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('met/unmet/unknown?');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: unknown\n');
      expect(specText).toContain('- proof 2: unmet\n');
    });
  });

  it('audit\'s interactive clause walk re-asks rather than accepting an answer outside the three verdicts', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'probably\nunknown\n\nunknown\n\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('type "met", "unmet" or "unknown"');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).toContain('- proof 1: unknown');
    });
  });

  it('audit\'s interactive clause walk ends on exhausted input and grades what it never reached unknown', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'unmet\n');
      expect(result.status).toBe(0);
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: unmet');
      expect(specText).toContain('- proof 2: unknown');
    });
  });

  it('audit refuses a --finding with no --deliverable, recording nothing', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'undeliverable bug', '--severity', 'high');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('needs --deliverable');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit refuses a --finding with no --evidence, recording nothing', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'unevidenced bug', '--severity', 'high', '--deliverable', 'fix it somehow');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('needs --evidence');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit carries a --finding\'s --evidence onto the finding task, where triage reads it', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'a real bug', '--severity', 'high', '--deliverable', 'guard the null case', '--evidence', 'save.ts:88 dereferences before the null check');
      const shown = tasks('list', '--kind', 'finding', '--state', 'unreviewed');
      const id = firstListedId(shown.stdout);
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
        '--evidence',
        '2=clause 2 checked',
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
      const id = firstListedId(tasks('list', '--kind', 'finding', '--state', 'unreviewed').stdout);
      expect(tasks('show', id).stdout).toContain('evidence: the finding has its own evidence');
    });
  });

  it('clause-shaped evidence after a finding still goes to the clause rather than overwriting the finding', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=unmet', '--finding', 'some bug', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'broken here', '--evidence', '2=the clause did not hold');
      expect(result.status).toBe(0);
      expect(tasks('show', 'demo-spec-clause-2').stdout).toContain('evidence: the clause did not hold');
      const id = firstListedId(tasks('list', '--kind', 'finding', '--state', 'unreviewed').stdout);
      expect(tasks('show', id).stdout).toContain('evidence: broken here');
    });
  });

  it('audit refuses a second bare finding evidence instead of silently replacing the first', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'some bug', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'first evidence', '--evidence', 'replacement evidence');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('already has evidence');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  // The audit scanner reads flags positionally, so a finding field written
  // before the --finding it belongs to used to fall through every branch
  // and vanish: the pass recorded a finding with no severity, and said so
  // only later, about a value the caller did supply.
  it('audit refuses a finding field written before the --finding it describes, and an unknown flag by name', () => {
    fixture(({ tasks }) => {
      const early = tasks('audit', 'demo-spec', '--severity', 'high', '--finding', 'some bug', '--deliverable', 'fix it', '--evidence', 'it is broken');
      expect(early.status).toBe(1);
      expect(early.stderr).toContain('--severity describes a finding, and no --finding has been opened yet');

      const unknown = tasks('audit', 'demo-spec', '--totallyfakeflag', 'x');
      expect(unknown.status).toBe(1);
      expect(unknown.stderr).toContain('unknown flag: --totallyfakeflag');

      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit carries a --finding\'s --deliverable onto the finding task it creates', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'a real bug', '--severity', 'high', '--deliverable', 'guard the null case', '--evidence', 'null deref on an empty save');
      const shown = tasks('list', '--kind', 'finding', '--state', 'unreviewed');
      const id = firstListedId(shown.stdout);
      expect(tasks('show', id).stdout).toContain('deliverable: guard the null case');
    });
  });

  it('audit records a clause nobody graded as unknown instead of refusing the pass', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recorded pass 1 for demo-spec: outstanding: c2 (unknown)');
      expect(result.stdout).toContain('1 clause(s) recorded unknown — nobody graded them: c2');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).toContain('- proof 2: unknown');
    });
  });

  it('an unknown clause creates no undelivered task, because nobody looked is not a broken promise', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=it fails');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('[undelivered/open/high]');
      const missing = tasks('show', 'demo-spec-clause-2');
      expect(missing.stdout).toContain('no such task: demo-spec-clause-2');
    });
  });

  it('audit takes unknown as an explicit verdict and never renders it as unmet', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=unknown', '--proof', '2=unmet', '--evidence', '2=it fails');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('outstanding: c1 (unknown), c2 (unmet)');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: unknown');
      expect(specText).toContain('- proof 2: unmet — it fails');
    });
  });

  it('audit refuses a met verdict with no evidence, naming the clause, and records nothing', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('clause 1 is met with no evidence');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).not.toContain('## Audit passes');
    });
  });

  it('unmet and unknown need no evidence, because neither is a completion claim', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=unmet', '--proof', '2=unknown');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('outstanding: c1 (unmet), c2 (unknown)');
    });
  });

  it('audit refuses a --proof value that is not one of the three verdicts, naming what it got', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=probably', '--proof', '2=unknown');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--proof 1=probably');
      expect(result.stderr).toContain('met, unmet or unknown');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).not.toContain('## Audit passes');
    });
  });

  it('audit-prompt prints a ready-to-use auditor prompt for a spec', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- [c1] The first clause holds.\n  proof: command node --version\n- [c2] The second clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
      tasks('add', 'prove the runtime behavior', '--id', 'runtime-proof', '--spec', 'demo-spec', '--severity', 'high', '--system', 'Runtime', '--files', 'src/runtime/runtime.ts:1', '--deliverable', 'runtime behavior is proven');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=measured directly', '--proof', '2=met', '--evidence', '2=clause 2 checked');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You are auditing demo-spec on branch demo-spec.');

      expect(result.stdout).toContain('Required commands (all must pass):');
      expect(result.stdout).toContain('- npm test');
      expect(result.stdout).toContain('- npx tsc --noEmit');
      expect(result.stdout).toContain('- npm run layer-check');
      expect(result.stdout).toContain('- npm run tasks -- doctor');
      expect(result.stdout).not.toContain('--merge');

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
      expect(result.stdout).toContain('- runtime-proof  [task/open/high]  Runtime  prove the runtime behavior');
      expect(result.stdout).toContain('src/runtime/runtime.ts:1');
      expect(result.stdout).toContain('prefer mutation testing');
      expect(result.stdout).toContain('Do not promote pass-2+ findings.');
    });
  });

  it('audit-prompt shows each clause its latest verdict, spelling out that unknown means nobody looked', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=measured directly');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('latest verdict: met — measured directly');
      expect(result.stdout).toContain('latest verdict: unknown — nobody has graded this clause');
      expect(result.stdout).toContain('Latest audit pass: pass 1');
      expect(result.stdout).toContain('outstanding: c2 (unknown)');
      expect(result.stdout).toContain('`unknown` means nobody looked');
      expect(result.stdout).not.toMatch(/\d+\/\d+ met/);
    });
  });

  it('audit-prompt calls every clause unknown when no pass has been recorded', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Latest audit pass: none recorded');
      expect(result.stdout).toContain('outstanding: c1 (unknown), c2 (unknown)');
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
        '--evidence',
        '1=clause 1 checked',
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
        '--evidence',
        '2=clause 2 checked',
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
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const undelivered = tasks('show', 'demo-spec-clause-1');
      expect(undelivered.stdout).not.toContain('files:');
    });
  });

  it("audit's undelivered task can be declined, and the decline says the clause is abandoned rather than discharged", () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const result = tasks('decline', 'demo-spec-clause-1', '--reason', 'the spec that promised it is superseded');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('declining it abandons the clause, it does not discharge it');

      const shown = tasks('show', 'demo-spec-clause-1').stdout;
      expect(shown).toContain('[undelivered/declined/high]');
      expect(shown).toContain('reason: the spec that promised it is superseded');
      expect(shown).toContain('closed: ');
    });
  });

  it('a second unmet pass for the same clause reuses the open undelivered task rather than duplicating it', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=first', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=still not', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const spec = tasks('spec', 'show', 'demo-spec');
      const occurrences = (spec.stdout.match(/demo-spec-clause-1/g) ?? []).length;
      expect(occurrences).toBe(1);
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
      expect(result.stdout).toContain('1. [unknown] The first clause holds.');
      expect(result.stdout).toContain('2. [unknown] The second clause holds.');
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
      expect(result.stdout).toContain('1. [unknown] ' + 'x'.repeat(99) + '…');
      expect(result.stdout).not.toContain(longClause);
    });
  });

  it('handoff tells a cold session which clauses nobody has graded', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=measured directly');
      const result = tasks('handoff');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('1. [met] The first clause holds.');
      expect(result.stdout).toContain('2. [unknown] The second clause holds.');
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
      expect(result.stdout).toContain('no-such-spec-branch.md');
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
      expect(result.stdout).toContain('spec inferred from the store: demo-spec');
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
      expect(result.stdout).toContain('spec contested:');
      expect(result.stdout).toContain('demo-spec, other-spec');
      expect(result.stdout).toContain('Pass --spec to pick one');
    });
  });

  it('the branch-name spec binding says it was inferred and what from, the condition c8 permits it on', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task', '--spec', 'demo-spec');
      for (const command of [['next'], ['list'], ['handoff']]) {
        const result = tasks(...command);
        expect(result.stdout, command[0]).toContain('spec inferred from the branch name: demo-spec');
        expect(result.stdout, command[0]).toMatch(/demo-spec\.md exists/);
      }
    });
  });

  it('an explicit --spec is not an inference and carries no note', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task', '--spec', 'demo-spec');
      const result = tasks('next', '--spec', 'demo-spec');
      expect(result.stdout).not.toContain('inferred');
      expect(result.stdout).toContain('a-task');
    });
  });

  it('handoff infers the active spec the same way, printing why', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'open task', '--id', 'open-task', '--spec', 'demo-spec', '--severity', 'high');
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const result = spawnSync(process.execPath, [tsx, script, 'handoff', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.stdout).toContain('spec inferred from the store: demo-spec');
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
      expect(result.stdout).toContain('spec inferred from the store: demo-spec');
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
      expect(result.stdout).toContain('spec inferred from the store: demo-spec');
      const shown = spawnSync(process.execPath, [tsx, script, 'show', 'a-finding', ...globals], { cwd: repoRoot, encoding: 'utf8' });
      expect(shown.stdout).toContain('spec: demo-spec');
    });
  });

  it('triage promotes a finding sourced from an audit pass 2 or later, saying that it extends the spec', () => {
    fixture(({ tasks, triage }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'late finding', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'seen late');
      const result = triage('1\n');
      expect(result.stdout).toContain('promoting a pass 2 finding, which extends what demo-spec owes');
      const shown = tasks('show', 'demo-spec-pass2-late-finding');
      expect(shown.stdout).toContain('spec: demo-spec');
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
