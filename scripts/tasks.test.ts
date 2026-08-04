import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tsxCli } from './lib/tsxCli';
import { run as runTasks } from './tasks';
import { parseAuditArgs } from './tasks/audit';
import { flagArities } from './tasks/cli';
import { allUsages } from './tasks/commands';

const repoRoot = path.join(import.meta.dirname, '..');
const today = new Date().toISOString().slice(0, 10);
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

// A store write no fixture command can make: `fixture` pins `--branch`, and
// what the provenance line reads off the log is the branch an event was
// written from, which is a different branch from the one reading it exactly
// when the line is worth having.
function appendEvent(dir: string, event: { branch: string; spec: string; id?: string }): void {
  const line = { t: new Date().toISOString(), by: null, branch: event.branch, head: null, op: 'edit', id: event.id ?? null, system: null, spec: event.spec, note: 'edited' };
  appendFileSync(path.join(dir, 'events.jsonl'), `${JSON.stringify(line)}\n`, 'utf8');
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
        const result = spawnSync(process.execPath, [tsxCli, script, ...args, ...globals], { cwd: dir, encoding: 'utf8' });
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
function relevantFilesBlock(stdout: string): string {
  const block = /Relevant files:\n((?:- .*\n)+)/.exec(stdout);
  if (block === null) throw new Error(`no relevant-files block in audit-prompt output:\n${stdout}`);
  return block[1];
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

  it('refuses an argument past a command\'s positional arity instead of discarding it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'alpha task', '--id', 'alpha');
      // The natural typo: an unquoted title. `fix` was recorded and `the
      // thing` dropped, so the id was slugified from a truncated title.
      const unquoted = tasks('add', 'fix', 'the', 'thing');
      expect(unquoted.status).toBe(1);
      expect(unquoted.stderr).toContain('unexpected argument: "the"');
      expect(unquoted.stderr).toContain('unexpected argument: "thing"');
      expect(tasks('list').stdout).not.toContain('fix');

      // The event log's own corruption: an id passed positionally landed in
      // the note slot and the note in a slot nothing read.
      const note = tasks('note', 'alpha', 'the real note');
      expect(note.status).toBe(1);
      expect(note.stderr).toContain('unexpected argument: "the real note"');

      expect(tasks('show', 'alpha', 'beta').status).toBe(1);
      expect(tasks('doctor', 'extraneous').status).toBe(1);
      expect(tasks('show', 'alpha').status).toBe(0);
    });
  });

  // The arity is derived by regex from each usage string, so a derivation
  // that reads too high is silent — the command just keeps discarding. This
  // sweeps every surface rather than the ones somebody thought to check:
  // `spec` derived 3 from prose in its own usage line and went unnoticed
  // through two audits.
  it('refuses five junk arguments on every bounded command surface', () => {
    fixture(({ tasks }) => {
      const unbounded = new Set(['spec add', 'spec remove', 'plan', 'done', 'decline', 'promote']);
      const surfaces = [['doctor'], ['add'], ['edit'], ['show'], ['list'], ['search'], ['next'], ['start'], ['stop'], ['done'], ['decline'], ['promote'], ['import'], ['triage'], ['audit'], ['audit-prompt'], ['work-prompt'], ['handoff'], ['check-commit-msg'], ['plan'], ['spec'], ['spec', 'new'], ['spec', 'add'], ['spec', 'remove'], ['spec', 'show'], ['spec', 'done'], ['note'], ['decision'], ['log'], ['merge-ready']];
      for (const surface of surfaces) {
        const name = surface.join(' ');
        const result = tasks(...surface, 'j1', 'j2', 'j3', 'j4', 'j5');
        if (unbounded.has(name)) {
          expect(result.stderr, name).not.toContain('unexpected argument');
          continue;
        }
        expect(result.status, name).toBe(1);
        expect(result.stderr, name).toContain('unexpected argument');
      }
    });
  });

  // The flag-arity twin of the junk-argument sweep: a `[--x]` written
  // self-closed is boolean by construction, and `spec show`'s `[--full]`
  // was silently classified value-taking because a prose parenthetical
  // followed it — dead as documented, a no-op as accepted.
  it('classifies every self-closed [--flag] in every usage as boolean, whatever prose follows it', () => {
    const usages = allUsages();
    expect(usages.length).toBeGreaterThan(20);
    for (const usage of usages) {
      const arities = flagArities(usage);
      for (const [, name] of usage.matchAll(/\[--([a-z][a-z0-9-]*)\]/g)) {
        expect(arities.get(name), `--${name} in: ${usage.split('\n')[0]}`).toBe('boolean');
      }
    }
  });

  it('spec show --full prints the whole Deliverable at exit 0, as its usage documents', () => {
    fixture(({ tasks }) => {
      const full = tasks('spec', 'show', 'demo-spec', '--full');
      expect(full.status).toBe(0);
      expect(full.stderr).toBe('');
      expect(full.stdout).toContain('Something this branch promises.');

      const standings = tasks('spec', 'show', 'demo-spec');
      expect(standings.stdout).not.toContain('Something this branch promises.');
      expect(standings.stdout).toContain('[unknown] The first clause holds.');
    });
  });

  it('leaves a command whose usage ends in ... unbounded', () => {
    fixture(({ tasks }) => {
      tasks('spec', 'new', 'demo-spec');
      tasks('add', 'one', '--id', 'one');
      tasks('add', 'two', '--id', 'two');
      tasks('add', 'three', '--id', 'three');
      const result = tasks('spec', 'add', 'demo-spec', 'one', 'two', 'three');
      expect(result.status).toBe(0);
      expect(tasks('spec', 'show', 'demo-spec').stdout).toContain('three');
    });
  });

  it('answers --help on every command and subcommand, and names the flags it will accept', () => {
    fixture(({ tasks }) => {
      const commands = [['doctor'], ['add'], ['edit'], ['show'], ['list'], ['search'], ['next'], ['start'], ['stop'], ['done'], ['decline'], ['promote'], ['import'], ['triage'], ['audit'], ['audit-prompt'], ['work-prompt'], ['handoff'], ['check-commit-msg'], ['plan'], ['spec'], ['spec', 'new'], ['spec', 'add'], ['spec', 'remove'], ['spec', 'show'], ['spec', 'done'], ['note'], ['decision'], ['log'], ['merge-ready']];
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

  it('edit resolves a unique prefix, names the resolution, and refuses an ambiguous or unknown fragment', () => {
    fixture(({ tasks }) => {
      tasks('add', 'check the merge shell', '--id', 'pass1-check-merge-shell');
      tasks('add', 'check the merge gate', '--id', 'pass1-check-merge-gate');

      // Unique fragment: resolves, says so, and the edit lands.
      const resolvedEdit = tasks('edit', 'pass1-check-merge-shell', '--deliverable', 'x');
      expect(resolvedEdit.status).toBe(0);
      const prefix = tasks('edit', 'pass1-check-merge-g', '--deliverable', 'y');
      expect(prefix.status).toBe(0);
      expect(prefix.stdout).toContain('resolved pass1-check-merge-g -> pass1-check-merge-gate');
      expect(tasks('show', 'pass1-check-merge-gate').stdout).toContain('deliverable: y');

      // Ambiguous: refused with the candidates, nothing edited.
      const ambiguous = tasks('edit', 'pass1-check-merge', '--deliverable', 'z');
      expect(ambiguous.status).toBe(1);
      expect(ambiguous.stderr).toContain('matches 2 ids');
      expect(ambiguous.stderr).toContain('pass1-check-merge-shell');
      expect(ambiguous.stderr).toContain('pass1-check-merge-gate');

      // Unknown: refused with the near matches.
      const unknown = tasks('edit', 'zzz-nothing', '--deliverable', 'z');
      expect(unknown.status).toBe(1);
      expect(unknown.stderr).toContain('no such task: zzz-nothing');
    });
  });

  // uniqueId manufactures strict prefix pairs (`foo`, `foo-2`) on slug
  // collision, so the exact-wins rule is load-bearing by construction.
  it('an exact id wins outright over the prefix pair uniqueId itself manufactures', () => {
    fixture(({ tasks }) => {
      tasks('add', 'first foo', '--id', 'foo');
      tasks('add', 'second foo', '--id', 'foo-2');
      const shown = tasks('show', 'foo');
      expect(shown.status).toBe(0);
      expect(shown.stdout).toContain('first foo');
      expect(shown.stdout).not.toContain('second foo');
      expect(shown.stdout).not.toContain('resolved');
    });
  });

  it('show resolves a unique fragment to the record, and answers a truly unknown id at exit zero', () => {
    fixture(({ tasks }) => {
      tasks('add', 'check the merge shell', '--id', 'pass1-check-merge-shell');
      tasks('add', 'something else entirely', '--id', 'unrelated-record');

      // The exact friction case: a truncated paste of a long id now resolves.
      const guessed = tasks('show', 'pass1-check-merge-shel');
      expect(guessed.status).toBe(0);
      expect(guessed.stderr).toBe('');
      expect(guessed.stdout).toContain('resolved pass1-check-merge-shel -> pass1-check-merge-shell');
      expect(guessed.stdout).toContain('check the merge shell');
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

  it('spec show answers a slug that names nothing, the way show already answers an unknown id', () => {
    fixture(({ tasks }) => {
      const result = tasks('spec', 'show', 'demo-spek');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no such spec: demo-spek');
      expect(result.stdout).toContain('demo-spec');
      expect(result.stderr).toBe('');
    });
  });

  it('spec add still refuses a slug that names nothing, because a write has nothing to write to', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'orphan');
      const result = tasks('spec', 'add', 'demo-spek', 'orphan');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no such spec: demo-spek');
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

  it('grades a named dispatch set and answers at exit 0, refusing nothing', () => {
    fixture(({ tasks }) => {
      tasks('add', 'extract the policy', '--id', 's1', '--writes', 'scripts/tasks.ts', '--produces', 'policy module');
      tasks('add', 'reroute git', '--id', 's2', '--writes', 'scripts/tasks.ts');
      tasks('add', 'regression fixes', '--id', 's5', '--writes', 'scripts/tasks.test.ts');

      const result = tasks('plan', 's1', 's2', 's5');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('s2 writes scripts/tasks.ts, where s1 is producing policy module');
      expect(result.stdout).toContain('does not require s1');
      expect(result.stdout).toContain('Reported, not enforced');
    });
  });

  it('grades the active spec when given no ids, and says where the plan came from', () => {
    fixture(({ tasks }) => {
      tasks('spec', 'new', 'demo-spec');
      tasks('add', 'one', '--id', 'one', '--spec', 'demo-spec', '--writes', 'src/a.ts');
      tasks('add', 'two', '--id', 'two', '--spec', 'demo-spec', '--writes', 'src/b.ts');
      const result = tasks('plan');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('plan taken from spec demo-spec');
      expect(result.stdout).toContain('no overlap, no unstated dependency, no duplicated interface');
    });
  });

  it('answers a plan naming an id that does not exist instead of refusing it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'real', '--id', 'real', '--writes', 'src/a.ts');
      const result = tasks('plan', 'real', 'ghost');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no such task');
      expect(result.stdout).toContain('plan: 1 task(s)');
    });
  });

  it('grades a plan naming one task three times as a plan of one', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the only task', '--id', 'solo', '--writes', 'src/p.ts', '--produces', 'policy module');
      const result = tasks('plan', 'solo', 'solo', 'solo');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('plan: 1 task(s)');
      expect(result.stdout).toContain('no overlap, no unstated dependency, no duplicated interface');
    });
  });

  it('says how much of a clean answer it could not see, when nothing declares a write grant', () => {
    fixture(({ tasks }) => {
      tasks('add', 'ungranted one', '--id', 'u1');
      tasks('add', 'ungranted two', '--id', 'u2');
      const result = tasks('plan', 'u1', 'u2');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 with a write grant');
      expect(result.stdout).toContain('declares no writes');
    });
  });

  it('records a write grant and a produced interface, and shows both back', () => {
    fixture(({ tasks }) => {
      const added = tasks('add', 'extract the policy module', '--id', 'seam', '--writes', 'scripts/lib/policy.ts,scripts/lib/policy.test.ts', '--produces', 'policy module,PolicyDecision type');
      expect(added.status).toBe(0);

      const shown = tasks('show', 'seam').stdout;
      expect(shown).toContain('writes: scripts/lib/policy.ts, scripts/lib/policy.test.ts');
      expect(shown).toContain('produces: policy module, PolicyDecision type');

      const edited = tasks('edit', 'seam', '--writes', 'scripts/lib/policy.ts');
      expect(edited.stdout).toContain('edited seam: writes');
      expect(tasks('show', 'seam').stdout).toContain('writes: scripts/lib/policy.ts\n');
    });
  });

  it('edit records a --requires id that does not resolve, reports it, and lets it hold the task', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'editable', '--spec', 'demo-spec');
      const result = tasks('edit', 'editable', '--requires', 'ghost');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recorded 1 requirement(s) no record answers to: ghost');

      const shown = tasks('show', 'editable').stdout;
      expect(shown).toContain('requires: ghost (missing)');
      expect(shown).toContain('BLOCKED');
      const next = tasks('next').stdout;
      expect(next).toContain('no open, unblocked tasks');
      // `(missing)`, not a bare id: after the fail-closed flip a typo holds
      // a task exactly as hard as a live requirement, and `next` is where
      // the difference has to be visible or nobody will look for it.
      expect(next).toContain('editable waits on ghost (missing)');
      expect(tasks('doctor').stdout).toContain('[error] editable requires unresolved id: ghost');
    });
  });

  it('hands the forward-referenced task over once the record it named exists', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'editable', '--spec', 'demo-spec', '--requires', 'arrives-later');
      expect(tasks('next').stdout).toContain('no open, unblocked tasks');

      tasks('add', 'the prerequisite', '--id', 'arrives-later', '--spec', 'demo-spec');
      tasks('done', 'arrives-later');
      const next = tasks('next').stdout;
      expect(next).not.toContain('no open, unblocked tasks');
      expect(next).toContain('editable');
      expect(tasks('show', 'editable').stdout).not.toContain('BLOCKED');
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
  // can write. `next` used to shorten it by character, on the argument that
  // shortening by line shortens nothing on a real record — both halves of
  // that are now gone: the queue prints the sentence its author wrote, and
  // what `--full` still adds is the line breaks, which only an imported
  // record has.
  it('next prints the evidence a record carries whole, tail included', () => {
    fixture(({ tasks }) => {
      const tail = 'and this tail is the half a reader used to lose to the character budget';
      const longEvidence = `evidence that runs well past any single line a queue entry should occupy, ${tail}`;
      tasks('add', 'verbose task', '--id', 'verbose-task', '--severity', 'high', '--system', 'Runtime', '--spec', 'demo-spec', '--files', 'src/runtime/save.ts:1', '--deliverable', 'the fix exists', '--evidence', longEvidence);

      const concise = tasks('next');
      expect(concise.stdout).toContain('verbose-task  [task/open/high]');
      expect(concise.stdout).toContain('files: src/runtime/save.ts:1');
      expect(concise.stdout).toContain(`evidence: ${longEvidence}`);
      expect(concise.stdout).toContain(tail);

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
      const result = spawnSync(process.execPath, [tsxCli, script, 'next', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'no-such-spec'], { cwd: repoRoot, encoding: 'utf8' });
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

  it('done records a --commit that resolves but is not reachable from HEAD, and warns rather than refusing', () => {
    gitFixture(({ dir, commit, tasks }) => {
      tasks('add', 'anchored task', '--id', 'anchored');
      commit('add anchored task');
      spawnSync('git', ['checkout', '-q', '-b', 'stray'], { cwd: dir });
      const strayCommit = commit('stray work, never merged into demo-spec');
      spawnSync('git', ['checkout', '-q', 'demo-spec'], { cwd: dir });

      const result = tasks('done', 'anchored', '--commit', strayCommit);
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('not reachable from HEAD');
      expect(tasks('show', 'anchored').stdout).toContain('[task/done]');
      // The same fact doctor already reported as a warning. One condition,
      // one polarity — it was a report in one command and a refusal in the
      // other, and the refusal was the one on the write path.
      expect(tasks('doctor').stdout).toContain('closed by a commit not reachable from HEAD');
    });
  });

  it('done still refuses a --commit that names no commit at all, which leaves no sha to record', () => {
    gitFixture(({ commit, tasks }) => {
      tasks('add', 'anchored task', '--id', 'anchored');
      commit('add anchored task');
      const result = tasks('done', 'anchored', '--commit', 'not-a-revspec-at-all');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('does not resolve to a commit');
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

  // The uncommitted-store warning fires for state an *earlier* session left
  // behind, never for the session's own writes: measured six-for-six and
  // eight-for-eight across two recorded sessions, a warning on every write
  // is a warning nobody reads. Freshness is the store's pre-write mtime.
  it('default-store writes stay silent about their own dirtiness, and warn once over stale uncommitted state', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      // A write that itself dirties a clean store is the session acting on
      // purpose — no warning.
      const own = tasks('add', 'Dirty tracked task', '--id', 'dirty-tracked');
      expect(own.status).toBe(0);
      expect(own.stderr).not.toContain('uncommitted task-state changes');

      // A second write while the dirtiness is fresh is the same session
      // still working — still no warning.
      const fresh = tasks('add', 'Second task', '--id', 'second-task');
      expect(fresh.stderr).not.toContain('uncommitted task-state changes');

      // Backdate the store: now the uncommitted state predates the writing
      // session, which is exactly the walked-away shape the warning is for.
      const store = path.join(dir, 'docs', 'tasks.jsonl');
      const old = new Date(Date.now() - 40 * 60 * 1000);
      utimesSync(store, old, old);
      const stale = tasks('add', 'Third task', '--id', 'third-task');
      expect(stale.status).toBe(0);
      expect(stale.stderr).toContain('warning: docs/tasks.jsonl has uncommitted task-state changes from an earlier session');
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

  // A `done` mark that only ever existed in the working tree is invisible
  // to `git show HEAD:...`, so a `closedCommit` field (which lives in the
  // same file) can never detect it. Only comparing the committed store
  // against the working tree can. It reports at [warning]: between `tasks
  // done` and the commit that carries the store change this is the
  // documented order of work, and an error that fires on the correct
  // workflow trains readers to skip errors.
  it('doctor reports a working-tree-only done mark as a warning naming the task, its committed state, and the risk', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      tasks('add', 'closable task', '--id', 'closable');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'add closable task'], { cwd: dir, encoding: 'utf8' });

      tasks('done', 'closable');
      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[warning] closable is done only in the working tree (committed state: open) — commit the store change');
    });
  });

  it('doctor reports a working-tree-only declined mark as a warning', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      tasks('add', 'stale finding', '--id', 'stale', '--kind', 'finding', '--deliverable', 'fix it');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'add stale finding'], { cwd: dir, encoding: 'utf8' });

      tasks('decline', 'stale', '--reason', 'already fixed elsewhere');
      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[warning] stale is declined only in the working tree (committed state: unreviewed) — commit the store change');
    });
  });

  // The once-per-process half of c3, which no spawn-per-call fixture can
  // observe: the second write is made stale again by hand, so only the
  // module-level flag can explain its silence.
  it('the dirty-store warning prints at most once per process, even across two stale writes', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-warn-once-'));
    const cwd = process.cwd();
    try {
      spawnSync('git', ['init', '-q'], { cwd: dir });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
      spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
      mkdirSync(path.join(dir, 'docs'), { recursive: true });
      const store = path.join(dir, 'docs', 'tasks.jsonl');
      const record = (id: string): string =>
        `${JSON.stringify({ id, title: id, kind: 'task', state: 'open', severity: null, system: null, spec: null, clause: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: null, closedCommit: null, claimed: null, claimedBy: null })}\n`;
      writeFileSync(store, record('committed-task'), 'utf8');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'store baseline'], { cwd: dir, encoding: 'utf8' });
      writeFileSync(store, record('committed-task') + record('left-behind'), 'utf8');
      const old = new Date(Date.now() - 40 * 60 * 1000);
      utimesSync(store, old, old);

      process.chdir(dir);
      const first = runInProcess(['add', 'warn one', '--id', 'warn-one']);
      expect(first.stderr).toContain('uncommitted task-state changes from an earlier session');

      // Stale again by hand: without the process-level flag this second
      // write would warn identically.
      utimesSync(store, old, old);
      const second = runInProcess(['add', 'warn two', '--id', 'warn-two']);
      expect(second.status).toBe(0);
      expect(second.stderr).not.toContain('uncommitted task-state changes');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Mid-merge, HEAD is still the pre-merge commit, so both git-anchored
  // checks answer about a tree that does not exist yet — the exact state in
  // which a hand-resolved store most needs the store-only checks readable.
  it('doctor suspends the git-anchored checks during an unresolved merge, and the store-only checks still run', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      // A working-tree-only close, which doctor would otherwise warn about.
      tasks('add', 'closable task', '--id', 'closable', '--requires', 'ghost-requirement');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'add closable'], { cwd: dir, encoding: 'utf8' });
      tasks('done', 'closable');

      // A conflicted merge in an unrelated file leaves MERGE_HEAD behind.
      writeFileSync(path.join(dir, 'conflict.txt'), 'base\n', 'utf8');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'base'], { cwd: dir, encoding: 'utf8' });
      spawnSync('git', ['checkout', '-q', '-b', 'side'], { cwd: dir });
      writeFileSync(path.join(dir, 'conflict.txt'), 'side\n', 'utf8');
      spawnSync('git', ['commit', '--no-verify', '-am', 'side edit'], { cwd: dir, encoding: 'utf8' });
      spawnSync('git', ['checkout', '-q', '-'], { cwd: dir });
      writeFileSync(path.join(dir, 'conflict.txt'), 'ours\n', 'utf8');
      spawnSync('git', ['commit', '--no-verify', '-am', 'our edit'], { cwd: dir, encoding: 'utf8' });
      spawnSync('git', ['merge', 'side'], { cwd: dir, encoding: 'utf8' });

      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('a merge is in progress (MERGE_HEAD exists)');
      expect(result.stdout).not.toContain('only in the working tree');
      // The store-only checks are the ones worth reading mid-merge, and the
      // unresolved requirement proves they still ran.
      expect(result.stdout).toContain('closable requires unresolved id: ghost-requirement');
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
      const result = spawnSync(process.execPath, [tsxCli, script, 'doctor', '--branch', 'demo-spec'], { cwd: dir, encoding: 'utf8' });
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

  it('triage [a] records a question on the finding and leaves it unreviewed', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'needs context', '--id', 'needs-context', '--kind', 'finding', '--severity', 'high', '--evidence', 'the original evidence', '--deliverable', 'fix it');
      const result = triage('a\nwhich universe was this measured against?\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('it stays unreviewed until the question is answered');
      expect(result.stdout).toContain('1 unreviewed finding(s) left');
      const shown = tasks('show', 'needs-context').stdout;
      expect(shown).toContain('the original evidence');
      expect(shown).toContain('triage asked');
      expect(shown).toContain('which universe was this measured against?');
    });
  });

  it('triage [a] with an empty question asks nothing and re-offers the same finding', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'needs context', '--id', 'needs-context', '--kind', 'finding', '--severity', 'high', '--evidence', 'original', '--deliverable', 'fix it');
      const result = triage('a\n\ns\n');
      expect(result.stdout).toContain('empty — nothing asked');
      expect(tasks('show', 'needs-context').stdout).not.toContain('triage asked');
    });
  });

  it('promote moves several findings into the spec in one call, and refuses a closed record', () => {
    fixture(({ tasks }) => {
      tasks('add', 'first finding', '--id', 'first-finding', '--kind', 'finding', '--severity', 'high', '--deliverable', 'fix it');
      tasks('add', 'second finding', '--id', 'second-finding', '--kind', 'finding', '--severity', 'high', '--deliverable', 'fix it');
      const result = tasks('promote', 'first-finding', 'second-finding');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('promoted first-finding into demo-spec');
      expect(result.stdout).toContain('promoted second-finding into demo-spec');
      expect(tasks('show', 'first-finding').stdout).toContain('[finding/open/high]');
      expect(tasks('show', 'first-finding').stdout).toContain('spec: demo-spec');

      tasks('decline', 'first-finding', '--reason', 'not worth it');
      const closed = tasks('promote', 'first-finding');
      expect(closed.status).toBe(1);
      expect(closed.stderr).toContain('it does not reopen closed ones');

      // A mixed batch is all-or-nothing, and nothing is announced that was
      // not written: the valid record stays where it was and no success
      // line precedes the refusal.
      tasks('add', 'third finding', '--id', 'third-finding', '--kind', 'finding', '--severity', 'low', '--deliverable', 'fix it');
      const mixed = tasks('promote', 'third-finding', 'first-finding');
      expect(mixed.status).toBe(1);
      expect(mixed.stdout).not.toContain('promoted third-finding');
      expect(mixed.stderr).toContain('Nothing was promoted');
      expect(tasks('show', 'third-finding').stdout).toContain('[finding/unreviewed/low]');
    });
  });

  it('done closes several ids in one call, and one unknown id refuses the batch before anything is written', () => {
    fixture(({ tasks }) => {
      tasks('add', 'first task', '--id', 'first-task');
      tasks('add', 'second task', '--id', 'second-task');

      const refused = tasks('done', 'first-task', 'zzz-no-such-task');
      expect(refused.status).toBe(1);
      expect(tasks('show', 'first-task').stdout).toContain('[task/open]');

      const closed = tasks('done', 'first-task', 'second-task');
      expect(closed.status).toBe(0);
      expect(closed.stdout).toContain('done first-task');
      expect(closed.stdout).toContain('done second-task');
      expect(tasks('show', 'first-task').stdout).toContain('[task/done]');
      expect(tasks('show', 'second-task').stdout).toContain('[task/done]');
    });
  });

  it('decline closes several ids under one shared reason', () => {
    fixture(({ tasks }) => {
      tasks('add', 'first task', '--id', 'first-task');
      tasks('add', 'second task', '--id', 'second-task');
      const result = tasks('decline', 'first-task', 'second-task', '--reason', 'superseded by the rework');
      expect(result.status).toBe(0);
      expect(tasks('show', 'first-task').stdout).toContain('reason: superseded by the rework');
      expect(tasks('show', 'second-task').stdout).toContain('reason: superseded by the rework');
    });
  });

  it('a bare -- ends flag parsing, so a decision may start with a dash', () => {
    fixture(({ tasks }) => {
      const result = tasks('decision', '--', '--each added mid-branch: the survey shape won');
      expect(result.status).toBe(0);
      const log = tasks('log', '--op', 'decision');
      expect(log.stdout).toContain('--each added mid-branch: the survey shape won');
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

  it('shows a triaged finding through the same printer, id included, so it can be copied to `tasks show`', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'a finding to triage', '--id', 'triage-me', '--kind', 'finding', '--severity', 'high', '--deliverable', 'fix it', '--evidence', 'it is broken');
      // `q` on the first prompt: the pane is displayed, nothing is decided.
      const result = triage('q\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('triage-me  [finding/unreviewed/high]');
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

  it('an undelivered task survives its clause being reworded, and closes on the next met verdict', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('[undelivered/open/high]');

      // The first audit stamped the clause, so the tag is already sitting in
      // the line a human rewords when they narrow it.
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('[c1] The first clause holds.', '[c1] The first clause holds, under a narrower reading.'), 'utf8');

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

  it('audit records a pass over a spec whose clauses carry the same tag twice, naming the ambiguity', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- The first clause holds.\n- The second clause holds.', '- [c1] The first clause holds.\n- [c1] The second clause holds.'), 'utf8');
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked');
      // A typo in a heading used to stop an auditor filing anything at all.
      // doctor reports the identical condition at exit 0, so this was one
      // fact with two polarities, refusing on the write path.
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('tags more than one proof clause [c1]');
      expect(result.stderr).toContain('cannot say which one it graded');
      expect(readFileSync(specPath, 'utf8')).toContain('### Pass 1');
      expect(tasks('doctor').stdout).toContain('tags more than one proof clause [c1]');
    });
  });

  it('audit records a pass over a spec with no proof clauses, saying it graded nothing', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n', 'utf8');
      const result = tasks('audit', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('has no Proof: clauses');
      expect(readFileSync(specPath, 'utf8')).toContain('### Pass 1');

      // A --proof against a clauseless spec is a typo by definition, and
      // the zero-clause escape hatch above does not excuse it.
      const typo = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=checked');
      expect(typo.status).toBe(1);
      expect(typo.stderr).toContain('its clauses are (none)');
    });
  });

  // The verdict-wiping trap, closed: filing findings used to append a pass
  // that graded nothing, and the standing reads from the latest pass only —
  // so recorded verdicts were reset to unknown by the act of filing, twice,
  // on the branch that recorded the friction.
  it('audit with findings and no proofs files the findings without appending a pass, so verdicts stand', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const before = readFileSync(specPath, 'utf8');

      const result = tasks('audit', 'demo-spec', '--finding', 'a late finding', '--severity', 'low', '--system', 'Runtime', '--deliverable', 'fix it', '--evidence', 'observed live');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no pass appended, so recorded clause verdicts stand');
      expect(readFileSync(specPath, 'utf8')).toBe(before);
      expect(readFileSync(specPath, 'utf8')).not.toContain('### Pass 2');

      const standing = tasks('spec', 'show', 'demo-spec');
      expect(standing.stdout).toContain('clause standing (latest pass 1): no clause outstanding');

      const filed = tasks('list', '--state', 'unreviewed');
      expect(filed.stdout).toContain('a late finding');
    });
  });

  // The two remaining doors into the verdict-wiping trap, closed: a typo'd
  // clause number and an abandoned interactive walk each used to record a
  // full all-unknown pass, and the standing reads from the latest pass only.
  it('audit refuses a --proof naming no clause, so a typo cannot record an all-unknown pass', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const before = readFileSync(specPath, 'utf8');

      const typo = tasks('audit', 'demo-spec', '--proof', '99=met', '--evidence', '99=x');
      expect(typo.status).toBe(1);
      expect(typo.stderr).toContain('names no clause in demo-spec: c99');
      expect(typo.stderr).toContain('its clauses are c1, c2');

      const nan = tasks('audit', 'demo-spec', '--proof', 'c1=met', '--evidence', '1=x');
      expect(nan.status).toBe(1);
      expect(nan.stderr).toContain('(not a number)');

      expect(readFileSync(specPath, 'utf8')).toBe(before);
      expect(tasks('spec', 'show', 'demo-spec').stdout).toContain('clause standing (latest pass 1): no clause outstanding');
    });
  });

  it('audit on exhausted stdin refuses to record a pass that graded nothing', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const before = readFileSync(specPath, 'utf8');

      const abandoned = tasks('audit', 'demo-spec');
      expect(abandoned.status).toBe(1);
      expect(abandoned.stderr).toContain('graded no clause');
      expect(readFileSync(specPath, 'utf8')).toBe(before);
      expect(tasks('spec', 'show', 'demo-spec').stdout).toContain('clause standing (latest pass 1): no clause outstanding');
    });
  });

  // The one call site the audit found unguarded: cmdAudit resolved
  // --base-branch's merge-base with a bare git call and no catch, so a
  // typo'd base name threw a raw Node stack instead of a diagnostic — the
  // exact defect Slice 1 fixed for `check` one command over.
  it('audit records a pass whose range this checkout could not compute, as unresolved rather than invented', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--base-branch', 'no-such-base-branch-xyz');
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('could not resolve a merge-base');
      expect(result.stderr).not.toContain('    at ');
      expect(result.stderr).not.toContain('Command failed');
      // Recorded, and honest about what it could not determine — never a
      // placeholder sha a later reader would take for a fact.
      const written = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(written).toContain('- base: `(unresolved)`');
      expect(written).toContain('- proof 1: met');
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
    const result = spawnSync(process.execPath, [tsxCli, script, 'audit', 'demo-spec', ...globals], { cwd: repoRoot, encoding: 'utf8', input });
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

      expect(result.stdout).toContain('Required commands (all must pass; `npm run tasks -- merge-ready` runs them together):');
      expect(result.stdout).toContain('- npm run tasks -- merge-ready');

      // The checklist and the regression question live in the generated
      // prompt, not in CLAUDE.md — a hand-copied brief is what trained
      // agents to fabricate their own.
      expect(result.stdout).toContain('Is anything worse than before this branch?');
      expect(result.stdout).toContain('scope drift;');
      expect(result.stdout).toContain('tests that repeat the implementation\'s assumptions;');
      expect(result.stdout).toContain('comments that restate self-documenting code;');
      expect(result.stdout).toContain('Deliver your results into the store');
      expect(result.stdout).toContain('files the findings without recording a pass');

      // Under the header, not merely somewhere in the output: this path
      // also prints under `Member tasks:`, so a `toContain` on the path
      // alone passed with the whole relevant-files computation replaced by
      // an empty list. The `:1` locator is stripped — the list is of
      // openable paths, not evidence references.
      expect(relevantFilesBlock(result.stdout)).toContain('- src/runtime/runtime.ts\n');
      expect(relevantFilesBlock(result.stdout)).not.toContain('- src/runtime/runtime.ts:1\n');

      expect(result.stdout).toContain('Proof clauses:');
      expect(result.stdout).toContain('[c1] The first clause holds.');
      expect(result.stdout).toContain('proof: command node --version');
      // Clause 1 carries a proof target — the guidance names both shapes
      // rather than presuming the logic one.
      expect(result.stdout).toContain('if it names pure logic or an API');
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
      expect(result.stdout).toContain('npm run mutate');
      // The prompt must not instruct an auditor in a rule the tool does not
      // have. Promotion at pass 2+ was removed from the tool; the prompt
      // asked for it anyway, on every invocation, for every future auditor.
      expect(result.stdout).not.toContain('Do not promote pass-2+ findings.');
      // The brief and workflow.md step 9 describe one rule from two sides, so
      // they have to agree on the pass asymmetry: an auditor never promotes,
      // and the triage step that does treats pass 1 differently from pass 2+.
      expect(result.stdout).toContain('You file findings; you never promote them');
      expect(result.stdout).toContain('first-pass findings are promoted without a walk');
      expect(result.stdout).toContain('from pass 2 on, promotion extends what the spec already owes');
      expect(result.stdout).not.toContain('at any pass');
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

  it('audit-prompt says it could not resolve the diff range, and never invents one', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec', '--base-branch', 'no-such-base-xyz');
      // handoff answered the identical condition at exit 0 all along, which
      // is what made this refusal avoidable rather than intrinsic. The
      // placeholder half of the original claim is the part that mattered and
      // it still holds: no range is better than a made-up one.
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no-such-base-xyz');
      expect(result.stdout).not.toContain('(unknown base)');
      expect(result.stdout).not.toContain('(unknown head)');
      expect(result.stdout).not.toContain('Diff range:');
    });
  });

  it('audit-prompt falls back to the diff\'s changed files so relevant files survives a spec with no members', () => {
    gitFixture(({ commit, tasks }) => {
      commit('A commit on demo-spec, after branching from main.');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Member tasks:\n- none');
      // The file this commit added, named under the header. Asserting only
      // that `- none` is absent passed with the print loop dropped, which
      // leaves the header with nothing under it at all.
      expect(relevantFilesBlock(result.stdout)).toMatch(/- file-[^\n]+\.txt\n/);
    });
  });

  // c19. The worker's half of the generated-brief rule the auditor's half
  // has had all along: what a dispatcher hand-writes is a copy of the record
  // that drifts from it, so the record renders itself.
  it('work-prompt names the task\'s deliverable, grant, requirements and clause standings', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the dependency', '--id', 'dep', '--spec', 'demo-spec');
      tasks('done', 'dep');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=it does not actually hold', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      tasks('edit', 'demo-spec-clause-1', '--writes', 'src/runtime/save.ts,src/runtime/invented-by-a-planner.ts', '--requires', 'dep', '--deliverable', 'the first clause is delivered', '--evidence', 'the audit graded it unmet');

      const result = tasks('work-prompt', 'demo-spec-clause-1');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You are implementing demo-spec-clause-1 on branch demo-spec.');
      expect(result.stdout).toContain('deliverable: the first clause is delivered');
      expect(result.stdout).toContain('evidence: the audit graded it unmet');
      // Every requirement with why it does or does not hold the task up —
      // "requirements and whether they are closed" is the whole point of
      // printing them rather than the ids alone.
      expect(result.stdout).toContain('requires: dep (done)');

      // The grant resolved against the tree is what a worker checks a
      // forecast against: a path nobody opened matches nothing, and saying
      // so is what makes the invitation to refuse actionable rather than
      // polite.
      expect(result.stdout).toContain('- src/runtime/save.ts\n');
      expect(result.stdout).toContain('- src/runtime/invented-by-a-planner.ts — matches no tracked file');

      // The clause this record discharges, at its latest standing — and not
      // the spec's other clause, which is somebody else's brief.
      expect(result.stdout).toContain('1. [unmet] The first clause holds.');
      expect(result.stdout).not.toContain('The second clause holds.');
    });
  });

  it('work-prompt names the claim, grant-correction and concept-registration steps a worker owes before writing code', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec', '--system', 'Runtime', '--produces', 'a policy module');

      const result = tasks('work-prompt', 'a-member');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('npm run tasks -- start a-member --actor <you>');
      expect(result.stdout).toContain('npm run tasks -- edit a-member --writes');
      expect(result.stdout).toContain('npm run tasks -- concept');
      expect(result.stdout).toContain('produced by a-member');
      // The registration step is the one a `produces` claim looks like it
      // already discharged and does not — workflow.md step 6 puts the
      // judgement on the worker, so the brief has to name both.
      expect(result.stdout).toContain('produces: a policy module');
      expect(result.stdout).toContain('a forecast, not a registration');
    });
  });

  it('work-prompt invites refusal of the grant it prints', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec', '--writes', 'src/runtime/save.ts');

      const result = tasks('work-prompt', 'a-member');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You may refuse this grant');
      // An invitation with no verb behind it is a courtesy. Both exits are
      // named, because "stop, it is not mine" and "decline, it should not be
      // done" are different answers.
      expect(result.stdout).toContain('npm run tasks -- stop a-member');
      expect(result.stdout).toContain('npm run tasks -- decline a-member --reason');
    });
  });

  it('work-prompt refuses an id the store does not hold, without inventing a brief', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');

      const result = tasks('work-prompt', 'no-such-record');
      // A read answers, the way audit-prompt answers an unknown spec. What
      // it must not do is print a brief anyway: a dispatch instruction for a
      // record nobody holds is the one output here that would be invented.
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no such task: no-such-record');
      expect(result.stdout).not.toContain('You are implementing');
      expect(result.stdout).not.toContain('Write grant');
      expect(result.stdout).not.toContain('Three things the workflow puts on you');
    });
  });

  it('work-prompt names the branch this spec was last written from', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      appendEvent(dir, { branch: 'claude/earlier-4f21a0', spec: 'demo-spec', id: 'a-member' });
      appendEvent(dir, { branch: 'claude/later-9c1d3e', spec: 'demo-spec', id: 'a-member' });
      appendEvent(dir, { branch: 'claude/another-spec-7b02', spec: 'some-other-spec' });

      const result = tasks('work-prompt', 'a-member');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('demo-spec was last written from branch claude/later-9c1d3e.');
      expect(result.stdout).not.toContain('claude/earlier-4f21a0');
      expect(result.stdout).not.toContain('claude/another-spec-7b02');
      // It states the fact and stops. A worktree's environment belongs to
      // whoever spawned it, and a brief that starts repairing one is a
      // second, unowned copy of that job.
      expect(result.stdout).not.toContain('git reset');
      expect(result.stdout).not.toContain('node_modules');
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

      // Not a member — but no longer invisible either: the finding this
      // spec's audit filed is listed in its own awaiting-triage section.
      const finding = tasks('spec', 'show', 'demo-spec');
      expect(finding.stdout).toContain('1 member(s):');
      expect(finding.stdout).not.toContain('2 member(s)');
      expect(finding.stdout).toContain("unreviewed finding(s) filed by this spec's audits, awaiting triage (not members):");
      expect(finding.stdout).toContain('a fresh bug');

      const listed = tasks('list', '--spec', 'demo-spec');
      expect(listed.stdout).toContain('a fresh bug');
      expect(listed.stdout).toContain("(filed by this spec's audit — awaiting triage)");

      // next reports the count but never offers a finding as work.
      const next = tasks('next', '--spec', 'demo-spec');
      expect(next.stdout).toContain("1 unreviewed finding(s) filed by demo-spec's audits await triage");
      expect(next.stdout).not.toContain('a fresh bug');
    });
  });

  // The CLI's generic parser already refuses a flag the usage never names,
  // so this defends the exported scanner itself: called directly, it used
  // to record any unknown flag's value as a file with no error.
  it('parseAuditArgs refuses an unknown flag after a --finding by name, instead of recording its value as a file', () => {
    const parsed = parseAuditArgs(['demo-spec', '--finding', 'a finding', '--severity', 'low', '--note', 'stray']);
    expect(parsed.errors).toEqual(['unknown flag --note after --finding "a finding" — a finding takes --severity, --system, --deliverable, --evidence and --file']);
    expect(parsed.findings[0].files).toEqual([]);
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

  it('handoff prints proof clauses numbered and whole, not the ## Deliverable prose', () => {
    fixture(({ tasks, dir }) => {
      const longClause = `a clause with ${'many words in it, '.repeat(12)}and a final phrase`;
      writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), `# Demo spec\n\n## Deliverable\n\nProse that should not appear in handoff's output at all.\n\nProof:\n\n- ${longClause}\n\n## Decisions\n\n## Open questions\n\nNone.\n`, 'utf8');
      const result = tasks('handoff');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('Prose that should not appear');
      expect(result.stdout).toContain('1. [unknown] a clause with many words');
      expect(result.stdout).not.toContain('…');
      // Wrapped across lines under its own number, but every word survives.
      const printed = result.stdout.split('\n').filter((line) => /^\s{2,}\S/.test(line)).join(' ');
      expect(printed.replace(/\s+/g, ' ')).toContain(longClause.replace(/\s+/g, ' '));
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
      const result = spawnSync(process.execPath, [tsxCli, script, 'handoff', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'no-such-spec-branch'], { cwd: repoRoot, encoding: 'utf8' });
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
      const result = spawnSync(process.execPath, [tsxCli, script, 'next', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.stdout).toContain('spec inferred from the store: demo-spec');
      expect(result.stdout).toContain('open task');
    });
  });

  // Found by running `handoff` on main straight after a merge: it inferred a
  // superseded spec and opened the session with five unmet clauses about a
  // command deleted in that very merge. The inference is a resume aid for a
  // branch whose name drifted from its spec file; main is never working a
  // spec, so every answer it can give there is a guess about a branch the
  // caller is not on. Asserted on a store where a spec DOES have open
  // members, because that is the only state in which the bug is reachable.
  it('does not infer a spec from the store on the default branch', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'open task', '--id', 'open-task', '--spec', 'demo-spec', '--severity', 'high');
      const globals = ['--store', path.join(dir, 'tasks.jsonl'), '--systems', path.join(dir, 'systems.json'), '--specs-dir', path.join(dir, 'specs')];
      const on = (branch: string, command: string): { stdout: string } => spawnSync(process.execPath, [tsxCli, script, command, ...globals, '--branch', branch], { cwd: repoRoot, encoding: 'utf8' });

      for (const command of ['next', 'handoff']) {
        const onMain = on('main', command);
        expect(onMain.stdout, command).not.toContain('spec inferred from the store');
        expect(onMain.stdout, command).not.toContain('open task');

        // The same store, one branch name different: still inferred, so what
        // changed is the rule for main and not the inference itself.
        expect(on('orphaned-branch', command).stdout, command).toContain('spec inferred from the store: demo-spec');
      }
    });
  });

  it('still takes an explicit --spec on the default branch, which is asked for rather than guessed', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'open task', '--id', 'open-task', '--spec', 'demo-spec', '--severity', 'high');
      const globals = ['--store', path.join(dir, 'tasks.jsonl'), '--systems', path.join(dir, 'systems.json'), '--specs-dir', path.join(dir, 'specs')];
      const result = spawnSync(process.execPath, [tsxCli, script, 'next', ...globals, '--branch', 'main', '--spec', 'demo-spec'], { cwd: repoRoot, encoding: 'utf8' });
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
      const result = spawnSync(process.execPath, [tsxCli, script, 'next', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
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
      const result = spawnSync(process.execPath, [tsxCli, script, 'handoff', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
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
      const result = spawnSync(process.execPath, [tsxCli, script, 'list', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
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
      const result = spawnSync(process.execPath, [tsxCli, script, 'triage', ...globals], { cwd: repoRoot, encoding: 'utf8', input: '1\n' });
      expect(result.stdout).toContain('spec inferred from the store: demo-spec');
      const shown = spawnSync(process.execPath, [tsxCli, script, 'show', 'a-finding', ...globals], { cwd: repoRoot, encoding: 'utf8' });
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

interface LoggedEvent {
  t: string;
  by: string | null;
  branch: string;
  head: string | null;
  op: string;
  id: string | null;
  system: string | null;
  spec: string | null;
  note: string;
}

function readEvents(dir: string): LoggedEvent[] {
  const file = path.join(dir, 'events.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LoggedEvent);
}

// A git repo whose store sits at docs/tasks.jsonl, carrying this repo's own
// .gitattributes — so the merge tests below prove the lines actually shipped
// rather than a copy of them written for the occasion.
function eventLogGitFixture(
  run: (context: { dir: string; storePath: string; tasks: (...args: string[]) => Run; commit: (message: string) => string; git: (...args: string[]) => { status: number; stdout: string } }) => void,
): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-event-log-'));
  try {
    const git = (...args: string[]): { status: number; stdout: string } => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      return { status: result.status ?? 1, stdout: result.stdout.trim() };
    };
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');

    writeFileSync(path.join(dir, '.gitattributes'), readFileSync(path.join(repoRoot, '.gitattributes'), 'utf8'), 'utf8');
    const specsDir = path.join(dir, 'docs', 'specs');
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(path.join(specsDir, 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
    const systemsPath = path.join(dir, 'systems.json');
    writeFileSync(systemsPath, JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [{ name: 'Runtime', paths: ['src/runtime'], lastAudit: null, lastAuditDoc: null, note: null }] }), 'utf8');
    const storePath = path.join(dir, 'docs', 'tasks.jsonl');
    writeFileSync(storePath, '', 'utf8');
    writeFileSync(path.join(dir, 'docs', 'events.jsonl'), '', 'utf8');
    const globals = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'demo-spec'];

    git('add', '-A');
    git('commit', '--no-verify', '-m', 'Initial fixture\n\nA tracked store and log exist.');
    git('branch', '-M', 'main');
    git('checkout', '-q', '-b', 'demo-spec');

    run({
      dir,
      storePath,
      tasks: (...args: string[]) => runInProcess([...args, ...globals]),
      commit: (message: string) => {
        git('add', '-A');
        git('commit', '--no-verify', '-m', message);
        return git('rev-parse', 'HEAD').stdout;
      },
      git,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the event log', () => {
  // The failure mode this derivation exists to make unreachable: a test run
  // silently appending to the project's own history. There is no flag that
  // could point the log somewhere the store is not.
  it('writes beside whichever store it was given and leaves the project log untouched', () => {
    const projectLog = path.join(repoRoot, 'docs', 'events.jsonl');
    const before = existsSync(projectLog) ? readFileSync(projectLog, 'utf8') : null;

    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec', '--actor', 'worker');
      const events = readEvents(dir);
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('a-member');
    });

    expect(existsSync(projectLog) ? readFileSync(projectLog, 'utf8') : null).toBe(before);
  });

  // c11 is a universal over hand-paired call sites, and a universal that only
  // its popular members exercise is not proven. Two audits in a row mutated
  // doctor-fix, triage, import, decline and spec-defer to append nothing and
  // watched the whole suite stay green. This drives every write verb once, so
  // an unpaired sixteenth site fails here rather than in an audit.
  it('records an event for every verb that writes the store, not only the well-travelled ones', () => {
    fixture(({ tasks, dir, triage }) => {
      const auditDoc = path.join(dir, 'legacy-audit.md');
      writeFileSync(auditDoc, '# Runtime — 2026-01-01\n\n## H1 — an imported finding\n\n**Files:** `src/runtime/a.ts:1`\n\nEvidence prose.\n\n**Fix**: do the thing.\n', 'utf8');

      tasks('import', auditDoc, '--actor', 'importer');
      triage('2\n');
      tasks('add', 'a decliner', '--id', 'to-decline', '--actor', 'w');
      tasks('decline', 'to-decline', '--reason', 'not worth it', '--actor', 'w');
      tasks('add', 'a deferred member', '--id', 'to-defer', '--spec', 'demo-spec', '--actor', 'w');
      tasks('spec', 'done', 'demo-spec', '--defer-open', '--actor', 'w');
      tasks('add', 'a fixable', '--id', 'fixable', '--actor', 'w');
      tasks('edit', 'fixable', '--evidence', 'x', '--actor', 'w');
      tasks('doctor', '--fix', '--actor', 'w');

      // Every op the store can be written by. `start`/`stop`/`done`/`spec-add`
      // are covered by the test below; the first five are the ones two audits
      // proved nothing was holding. `spec-done` is the one event with no
      // store write behind it — the close is derived from member states, and
      // recording it is the whole point.
      const ops = new Set(readEvents(dir).map((event) => event.op));
      for (const op of ['import', 'triage', 'decline', 'spec-defer', 'spec-done', 'add', 'edit']) {
        expect(ops, `no event recorded for ${op}`).toContain(op);
      }
    });
  });

  it('appends exactly one event per record a write changed, in the order the writes happened', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec', '--actor', 'worker');
      tasks('edit', 'a-member', '--evidence', 'measured', '--actor', 'worker');
      tasks('start', 'a-member', '--actor', 'worker');
      tasks('stop', 'a-member', '--actor', 'worker');
      tasks('done', 'a-member', '--actor', 'worker');

      const events = readEvents(dir);
      expect(events.map((event) => event.op)).toEqual(['add', 'edit', 'start', 'stop', 'done']);
      expect(new Set(events.map((event) => event.by))).toEqual(new Set(['worker']));
      expect(new Set(events.map((event) => event.branch))).toEqual(new Set(['demo-spec']));
      expect(events.map((event) => event.id)).toEqual(Array(5).fill('a-member'));
    });
  });

  it('records one event per record when one write moves several', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'first', '--id', 'first');
      tasks('add', 'second', '--id', 'second');
      tasks('spec', 'add', 'demo-spec', 'first', 'second', '--actor', 'worker');

      const moved = readEvents(dir).filter((event) => event.op === 'spec-add');
      expect(moved.map((event) => event.id)).toEqual(['first', 'second']);
      expect(moved[0].spec).toBe('demo-spec');
    });
  });

  it('leaves no event behind when a write changes nothing', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const beforeCount = readEvents(dir).length;

      const result = tasks('edit', 'a-member');
      expect(result.stdout).toContain('nothing to change');
      expect(readEvents(dir)).toHaveLength(beforeCount);
    });
  });

  it('records an unnamed actor rather than refusing a write that named none', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      expect(readEvents(dir)[0].by).toBeNull();
    });
  });

  // The snapshot. Joining to present-day state would make this event claim
  // the record was never in demo-spec at all.
  it('keeps the spec an event was written under after the record is re-pointed', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      tasks('spec', 'remove', 'demo-spec', 'a-member');

      expect(tasks('show', 'a-member').stdout).toContain('spec: (deferred)');
      const events = readEvents(dir);
      expect(events[0].op).toBe('add');
      expect(events[0].spec).toBe('demo-spec');
      // The departure is part of that spec's history too, so it is filed
      // under the spec the record left rather than the null it now carries.
      expect(events[1].spec).toBe('demo-spec');
      expect(tasks('log', '--spec', 'demo-spec').stdout).toContain('2 of 2 event(s)');
    });
  });

  it('records the audit pass itself as an event with no task', () => {
    fixture(({ tasks, dir }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--actor', 'auditor');
      const passes = readEvents(dir).filter((event) => event.op === 'audit');
      expect(passes).toHaveLength(1);
      expect(passes[0].id).toBeNull();
      expect(passes[0].spec).toBe('demo-spec');
      expect(passes[0].by).toBe('auditor');
    });
  });

  it('records an undelivered task beside the pass that created it', () => {
    fixture(({ tasks, dir }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const events = readEvents(dir).filter((event) => event.op === 'audit');
      expect(events.map((event) => event.id)).toEqual([null, 'demo-spec-clause-1']);
    });
  });
});

describe('tasks note and tasks decision', () => {
  it('records a decision that names a system and no task', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('decision', 'union merge is right for an append-only log', '--system', 'Runtime', '--actor', 'worker');
      expect(result.status).toBe(0);

      const events = readEvents(dir);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ op: 'decision', id: null, system: 'Runtime', note: 'union merge is right for an append-only log' });
    });
  });

  it('snapshots the system and spec of the record a note names', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec', '--system', 'Runtime');
      tasks('note', 'the 277-line rewrite is why -G false-positives', '--id', 'a-member');

      const note = readEvents(dir).find((event) => event.op === 'note')!;
      expect(note).toMatchObject({ id: 'a-member', system: 'Runtime', spec: 'demo-spec' });
    });
  });

  it('refuses a note that is more than one line, and writes nothing', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('note', 'first line\nsecond line');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('a note is one line');
      expect(readEvents(dir)).toEqual([]);
    });
  });

  it('records a note against an id no record answers to, and says so', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('note', 'the record for this is not written yet', '--id', 'not-yet-a-record');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no record answers to not-yet-a-record');
      expect(readEvents(dir).map((event) => event.id)).toEqual(['not-yet-a-record']);
    });
  });

  it('refuses a system that names nothing in systems.json', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('decision', 'a decision about nothing', '--system', 'No Such System');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--system not in systems.json');
      expect(readEvents(dir)).toEqual([]);
    });
  });

  // A spec file may since have been renamed or deleted, and an event about a
  // spec that no longer exists is exactly what a log is for.
  it('records a decision against a spec with no file, and reports the gap', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('decision', 'superseded before it was written', '--spec', 'a-spec-that-went-away');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recorded against that slug anyway');
      expect(readEvents(dir)[0].spec).toBe('a-spec-that-went-away');
    });
  });
});

describe('tasks log', () => {
  it('composes filters by ANDing them, and answers from the log alone', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec', '--system', 'Runtime');
      tasks('decision', 'the gate is deleted, not guarded', '--id', 'a-member', '--system', 'Runtime');
      tasks('decision', 'the modal renders unconditionally', '--system', 'UI');

      expect(tasks('log', '--op', 'decision').stdout).toContain('2 of 3 event(s)');
      expect(tasks('log', '--op', 'decision', '--system', 'Runtime').stdout).toContain('1 of 3 event(s)');
      expect(tasks('log', '--system', 'UI', '--spec', 'demo-spec').stdout).toContain('no event matches');
      expect(tasks('log', 'modal').stdout).toContain('the modal renders unconditionally');
    });
  });

  // The same distinction `next` learned: a filter that matched nothing is a
  // different answer from a log with nothing in it.
  it('separates an empty log from a filter that matched nothing', () => {
    fixture(({ tasks }) => {
      expect(tasks('log').stdout).toContain('no events recorded yet');

      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const missed = tasks('log', '--op', 'start');
      expect(missed.status).toBe(0);
      expect(missed.stdout).toContain('no event matches --op start');
      expect(missed.stdout).toContain('1 event(s) in');
    });
  });

  it('refuses an op that names nothing rather than answering with an empty log', () => {
    fixture(({ tasks }) => {
      const result = tasks('log', '--op', 'invented');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--op must be one of');
      expect(result.stderr).toContain('decision');
    });
  });

  it('answers with the lines it could read when one is corrupt', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const log = path.join(dir, 'events.jsonl');
      writeFileSync(log, `${readFileSync(log, 'utf8')}{ not json\n`, 'utf8');

      const result = tasks('log');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('a-member');
      expect(result.stdout).toContain('skipped 1 unreadable event line(s)');
    });
  });
});

// The measurement that cut this log was invalid, and the acceptance criterion
// is aimed at exactly that error: `-S` counts occurrences of a string, so an
// edit to a title or evidence is invisible to it; `-G` matches any diff line
// containing the string, so one schema change lands in every record's history.
describe('a record history git cannot answer', () => {
  it('beats git log -S on the edits it misses and -G on the rewrites it over-reports', () => {
    eventLogGitFixture(({ dir, storePath, tasks, commit, git }) => {
      tasks('add', 'U5 claims', '--id', 'policy-seam-u5', '--spec', 'demo-spec', '--actor', 'worker');
      commit('Create the record\n\nA task exists.');
      tasks('add', 'an unrelated record', '--id', 'build-deployment-h2', '--spec', 'demo-spec', '--actor', 'worker');
      commit('Create an unrelated record\n\nA second task exists.');
      tasks('edit', 'policy-seam-u5', '--title', 'U5 claims: a claim says who holds it', '--actor', 'worker');
      commit('Edit the title\n\nThe title changed.');
      tasks('edit', 'policy-seam-u5', '--evidence', 'verified against a scratch copy of the live store', '--actor', 'worker');
      commit('Edit the evidence\n\nThe evidence changed.');
      tasks('start', 'policy-seam-u5', '--actor', 'worker');
      commit('Claim it\n\nSomebody holds it.');
      tasks('done', 'policy-seam-u5', '--actor', 'worker');
      commit('Close it\n\nThe work landed.');

      // b326230's shape: a field added to the serializer rewrites every line,
      // so one commit joins the history of every record in the store.
      const rewritten = readFileSync(storePath, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.stringify({ ...(JSON.parse(line) as Record<string, unknown>), addedByASchemaChange: null }));
      writeFileSync(storePath, `${rewritten.join('\n')}\n`, 'utf8');
      commit('Add a field to every record\n\nThe serializer rewrote all of them.');

      const gitLogCount = (flag: string): number => {
        const out = git('log', '--format=%H', flag, '--', 'docs/tasks.jsonl').stdout;
        return out === '' ? 0 : out.split('\n').length;
      };
      const loggedCount = (...args: string[]): number => {
        const stdout = tasks('log', ...args).stdout;
        return Number(/^(\d+) of \d+ event\(s\)/m.exec(stdout)?.[1] ?? 0);
      };

      // Five things happened to this record, and git's own search finds one.
      expect(gitLogCount('-Spolicy-seam-u5')).toBe(1);
      expect(loggedCount('--id', 'policy-seam-u5')).toBe(5);

      // One thing happened to this one, and -G answers with the schema change
      // as well, because that commit moved every line in the file.
      expect(gitLogCount('-Gbuild-deployment-h2')).toBeGreaterThan(1);
      expect(loggedCount('--id', 'build-deployment-h2')).toBe(1);

      // Exactness in both directions, which is what neither git search has.
      const history = readEvents(path.join(dir, 'docs'))
        .filter((event) => event.id === 'policy-seam-u5')
        .map((event) => event.op);
      expect(history).toEqual(['add', 'edit', 'edit', 'start', 'done']);
    });
  });

  // `note` appends to the log and leaves the store alone, which isolates the
  // union merge to the one file configured for it. A verb that writes both
  // would collide on the store — deliberately, per the test below.
  it("merges two branches appending to the log with no conflict, under the repo's own merge=union", () => {
    eventLogGitFixture(({ dir, tasks, commit, git }) => {
      git('checkout', '-q', '-b', 'branch-a');
      tasks('note', 'from A', '--actor', 'a');
      commit('A appends\n\nOne event, no record.');

      git('checkout', '-q', 'demo-spec');
      git('checkout', '-q', '-b', 'branch-b');
      tasks('note', 'from B', '--actor', 'b');
      commit('B appends\n\nOne event, no record.');

      const merge = git('merge', '--no-edit', 'branch-a');
      expect(merge.status).toBe(0);

      const events = readEvents(path.join(dir, 'docs'));
      expect(events.map((event) => event.note).sort()).toEqual(['from A', 'from B']);
    });
  });

  // The store is deliberately NOT merge=union. Union would keep both copies
  // under one id, which `doctor` reports at exit 0 — so CI stays green while
  // every read answers from the first copy forever.
  it('conflicts when two branches edit one record, rather than keeping both copies under one id', () => {
    eventLogGitFixture(({ tasks, commit, git }) => {
      tasks('add', 'a contested record', '--id', 'contested', '--spec', 'demo-spec');
      commit('Create the record\n\nBoth branches will edit it.');

      git('checkout', '-q', '-b', 'branch-a');
      tasks('edit', 'contested', '--title', "A's title", '--actor', 'a');
      commit('A edits the title\n\nOne line changed.');

      git('checkout', '-q', 'demo-spec');
      git('checkout', '-q', '-b', 'branch-b');
      tasks('edit', 'contested', '--title', "B's title", '--actor', 'b');
      commit('B edits the title\n\nThe same line changed.');

      expect(git('merge', '--no-edit', 'branch-a').status).not.toBe(0);
      git('merge', '--abort');

      const doctor = tasks('doctor');
      expect(doctor.status).toBe(0);
      expect(doctor.stdout).not.toContain('duplicate id');
    });
  });

  // The case the spec calls the only conflicting one, and the case dropping
  // union actually changed: every filed finding is an append, so this is
  // what two agents filing findings on two branches will hit. It conflicts,
  // and the conflict is the correct outcome — but nothing exercised it,
  // because the append test moved to `note` to isolate the log's union.
  it('conflicts when two branches each append a record, and resolving by hand leaves a store that parses', () => {
    eventLogGitFixture(({ dir, tasks, commit, git }) => {
      tasks('add', 'the shared base', '--id', 'base', '--spec', 'demo-spec');
      commit('Create a record\n\nSo both branches append after the same line.');

      git('checkout', '-q', '-b', 'branch-a');
      tasks('add', 'filed by A', '--id', 'from-a', '--spec', 'demo-spec', '--actor', 'a');
      commit('A files a finding\n\nOne appended record.');

      git('checkout', '-q', 'demo-spec');
      git('checkout', '-q', '-b', 'branch-b');
      tasks('add', 'filed by B', '--id', 'from-b', '--spec', 'demo-spec', '--actor', 'b');
      commit('B files a finding\n\nOne appended record.');

      expect(git('merge', '--no-edit', 'branch-a').status).not.toBe(0);

      // Resolved the way a human would: keep both appended records. The
      // point is that the store is left parseable and duplicate-free, so a
      // hand resolution cannot silently produce the corruption union did.
      const storePath = path.join(dir, 'docs', 'tasks.jsonl');
      const kept = readFileSync(storePath, 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '' && !/^[<>=]{7}/.test(line));
      writeFileSync(storePath, `${kept.join('\n')}\n`, 'utf8');
      git('add', 'docs/tasks.jsonl');
      commit('Resolve by keeping both\n\nBoth findings survive.');

      const doctor = tasks('doctor');
      expect(doctor.status).toBe(0);
      expect(doctor.stdout).not.toContain('duplicate id');
      expect(doctor.stdout).toContain('0 unparseable line(s)');
      const listed = tasks('list').stdout;
      expect(listed).toContain('from-a');
      expect(listed).toContain('from-b');
    });
  });
});

// The architecture queries. Their logic is unit-tested over fixture trees in
// `lib/architecture.test.ts` and `lib/producers.test.ts`; what these prove is
// the wiring — that the command reaches the derived view and the manifest at
// all. They read this repository's real tree on purpose, because that seam is
// the only part a fixture cannot exercise.
describe('tasks system', () => {
  it('lists every declared system with counts derived from the tree', () =>
    fixture(({ tasks }) => {
      const result = tasks('system');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('2 system(s) declared');
      expect(result.stdout).toMatch(/Runtime\s+\d+ file\(s\)/);
    }));

  it('opens one system, naming its dependencies and its unclaimed files', () =>
    fixture(({ tasks }) => {
      const result = tasks('system', 'Runtime');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('depends on:');
      expect(result.stdout).toContain('no concept claims');
    }));

  // The names are already in `Module.exports` at the point a total was taken
  // over them, and the total is what a planner then had to go and look up by
  // hand before it could import anything.
  it('names its exported surface instead of counting it', () =>
    fixture(({ tasks }) => {
      const result = tasks('system', 'Runtime');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('exported surface, production modules only:');
      expect(result.stdout).toMatch(/src\/runtime\/save\.ts — \w/);
      expect(result.stdout).not.toMatch(/export\(s\)/);
    }));

  it('refuses a system the manifest does not declare, and says which exist', () =>
    fixture(({ tasks }) => {
      const result = tasks('system', 'Nope');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Runtime');
    }));
});

describe('tasks where', () => {
  it('answers ownership, exports and cross-boundary imports for a file', () =>
    fixture(({ tasks }) => {
      const result = tasks('where', 'src/runtime/save.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('system:   Runtime');
      expect(result.stdout).toContain('exports:');
    }));

  it('answers for a path no system owns rather than refusing', () =>
    fixture(({ tasks }) => {
      const result = tasks('where', 'docs/workflow.md');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('declared unowned');
    }));

  it('refuses with usage when given no path', () =>
    fixture(({ tasks }) => {
      expect(tasks('where').status).toBe(1);
    }));

  // The prior art that bit was in finished work: `droptables` was done and
  // merged when its batched-chance rule was re-derived from scratch. So a
  // query that stops at live records answers the easy half.
  it('names every task that has ever claimed the path, closed and declined ones included', () =>
    fixture(({ tasks }) => {
      tasks('add', 'the save format pass', '--id', 'saves-v2', '--writes', 'src/runtime/save.ts');
      tasks('done', 'saves-v2');
      tasks('add', 'a save rewrite nobody wanted', '--id', 'save-rewrite', '--writes', 'src/runtime/save.ts');
      tasks('decline', 'save-rewrite', '--reason', 'the format is fine');

      const result = tasks('where', 'src/runtime/save.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[done] saves-v2');
      expect(result.stdout).toContain('[declined] save-rewrite');
    }));

  it('resolves a directory grant against a path beneath it', () =>
    fixture(({ tasks }) => {
      tasks('add', 'the travel pass', '--id', 'travel', '--writes', 'src/runtime');
      const result = tasks('where', 'src/runtime/save.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[open] travel');
      expect(result.stdout).toContain('writes src/runtime');
    }));

  it('answers with the owning system, the concepts on the path and the produces claims naming them', () =>
    fixture(({ tasks }) => {
      tasks('concept', 'Runtime', 'saves', '--paths', 'src/runtime/save.ts', '--note', 'from a produces claim');
      tasks('add', 'build the save migrator', '--id', 'migrator', '--writes', 'src/runtime/save.ts', '--produces', 'save migrator');

      const result = tasks('where', 'src/runtime/save.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('system:   Runtime');
      expect(result.stdout).toContain('[concept] saves — registered to Runtime');
      expect(result.stdout).toContain('produces save migrator');
    }));

  it('says outright that nothing has claimed a path, rather than printing an empty section', () =>
    fixture(({ tasks }) => {
      expect(tasks('where', 'src/runtime/save.ts').stdout).toContain('nothing has claimed src/runtime/save.ts');
    }));

  it('answers for a directory with the files under it and the whole surface they export', () =>
    fixture(({ tasks }) => {
      const result = tasks('where', 'src/runtime');
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/\d+ tracked file\(s\) under it/);
      expect(result.stdout).toMatch(/src\/runtime\/save\.ts — \w/);
    }));
});

describe('tasks produces', () => {
  it('finds a claim made by a task that has already closed', () =>
    fixture(({ tasks }) => {
      tasks('add', 'build the buff engine', '--produces', 'buff engine', '--id', 'buffs');
      tasks('done', 'buffs');
      const result = tasks('produces', 'buff engine');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[exact]');
      expect(result.stdout).toContain('claimed by buffs (done)');
    }));

  it('calls its own miss a weak one instead of asserting nothing exists', () =>
    fixture(({ tasks }) => {
      expect(tasks('produces', 'quest journal').stdout).toContain('weak "no"');
    }));
});

describe('tasks concept', () => {
  it('registers a capability, after which produces answers for it', () =>
    fixture(({ tasks }) => {
      const added = tasks('concept', 'Runtime', 'saves', '--paths', 'src/runtime/save.ts', '--note', 'from a produces claim');
      expect(added.status).toBe(0);
      expect(tasks('produces', 'saves').stdout).toContain('owned by Runtime');
    }));

  it('refuses an empty --paths, since a concept nothing resolves to answers every lookup wrongly', () =>
    fixture(({ tasks }) => {
      const empty = tasks('concept', 'Runtime', 'saves', '--paths', '');
      expect(empty.status).toBe(1);
      expect(empty.stderr).toContain('usage: tasks concept');
      expect(tasks('produces', 'saves').stdout).toContain('nothing produces');
    }));

  it('refuses a missing concept name with usage, not a raw TypeError', () =>
    fixture(({ tasks }) => {
      const missing = tasks('concept', 'Runtime', '--paths', 'src/runtime/save.ts');
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain('usage: tasks concept');
    }));

  it('refuses a name another system already registers', () =>
    fixture(({ tasks }) => {
      tasks('concept', 'Runtime', 'saves', '--paths', 'src/runtime/save.ts');
      const again = tasks('concept', 'UI', 'saves', '--paths', 'src/ui');
      expect(again.status).toBe(1);
      expect(again.stderr).toContain('already registers a concept');
    }));

  it('refuses a concept reaching outside its own system, and writes nothing', () =>
    fixture(({ dir, tasks }) => {
      const before = readFileSync(path.join(dir, 'systems.json'), 'utf8');
      const result = tasks('concept', 'Runtime', 'parsing', '--paths', 'src/grammar/parser.ts');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('cannot reach outside it');
      expect(readFileSync(path.join(dir, 'systems.json'), 'utf8')).toBe(before);
    }));

  it('refuses a system that does not exist', () =>
    fixture(({ tasks }) => {
      expect(tasks('concept', 'Nope', 'thing', '--paths', 'src/runtime').status).toBe(1);
    }));

  it('keeps a manifest field it does not know about', () =>
    fixture(({ dir, tasks }) => {
      const file = path.join(dir, 'systems.json');
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { systems: Array<Record<string, unknown>> };
      raw.systems[0].futureField = 'kept';
      writeFileSync(file, JSON.stringify(raw), 'utf8');
      tasks('concept', 'Runtime', 'saves', '--paths', 'src/runtime/save.ts');
      const after = JSON.parse(readFileSync(file, 'utf8')) as { systems: Array<Record<string, unknown>> };
      expect(after.systems[0].futureField).toBe('kept');
    }));
});

describe('tasks done, on a task that claimed to produce something', () => {
  it('names the command that would register the claim, and registers nothing itself', () =>
    fixture(({ dir, tasks }) => {
      tasks('add', 'build it', '--produces', 'droptable system', '--system', 'Runtime', '--id', 'drops');
      const before = readFileSync(path.join(dir, 'systems.json'), 'utf8');
      const result = tasks('done', 'drops');
      expect(result.stdout).toContain('tasks concept "Runtime" "droptable system"');
      expect(readFileSync(path.join(dir, 'systems.json'), 'utf8')).toBe(before);
    }));

  it('says nothing when the claim is already a registered concept', () =>
    fixture(({ tasks }) => {
      tasks('concept', 'Runtime', 'droptable system', '--paths', 'src/runtime/save.ts');
      tasks('add', 'build it', '--produces', 'droptable system', '--system', 'Runtime', '--id', 'drops');
      expect(tasks('done', 'drops').stdout).not.toContain('not registered concepts');
    }));

  it('says nothing for a task that claims nothing', () =>
    fixture(({ tasks }) => {
      tasks('add', 'plain work', '--id', 'plain');
      expect(tasks('done', 'plain').stdout).not.toContain('not registered concepts');
    }));
});

describe('tasks plan, against producers that already exist', () => {
  it('reports a plan member claiming what a closed task already produced', () =>
    fixture(({ tasks }) => {
      tasks('add', 'old work', '--produces', 'buff engine', '--id', 'old');
      tasks('done', 'old');
      tasks('add', 'new work', '--produces', 'buff engine', '--writes', 'src/runtime/buffs.ts', '--id', 'new', '--spec', 'demo-spec');
      const result = tasks('plan', 'new');
      expect(result.stdout).toContain('already claims it');
      expect(result.stdout).toContain('old');
    }));

  it('reports a plan member claiming a registered concept', () =>
    fixture(({ tasks }) => {
      tasks('concept', 'Runtime', 'buff engine', '--paths', 'src/runtime/save.ts');
      tasks('add', 'new work', '--produces', 'buff engine', '--writes', 'src/runtime/buffs.ts', '--id', 'new', '--spec', 'demo-spec');
      expect(tasks('plan', 'new').stdout).toContain('already has it as a registered concept');
    }));

  it('does not report a plan member against its own claim', () =>
    fixture(({ tasks }) => {
      tasks('add', 'only work', '--produces', 'lonely thing', '--writes', 'src/runtime/lonely.ts', '--id', 'lonely', '--spec', 'demo-spec');
      expect(tasks('plan', 'lonely').stdout).not.toContain('existing-producer');
    }));
});

// A read answers. The store is what grading a plan needs; the registry only
// widens what it can say, so losing it costs the concept half of the answer
// and must not cost the exit code — `tasks plan` is an unguarded CI step.
describe('tasks plan, when the manifest will not parse', () => {
  it('still grades the plan, and says which half of the answer it lost', () =>
    fixture(({ dir, tasks }) => {
      tasks('add', 'some work', '--writes', 'src/runtime/a.ts', '--id', 'work', '--spec', 'demo-spec');
      writeFileSync(path.join(dir, 'systems.json'), '{"unowned":{"paths":[]},"systems":', 'utf8');
      const result = tasks('plan', 'work');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recorded `produces` claims only');
      expect(result.stdout).toContain('plan: 1 task(s)');
    }));
});

describe('a command that cannot work without the manifest', () => {
  it('refuses it as malformed input, naming the file, rather than crashing', () =>
    fixture(({ dir, tasks }) => {
      writeFileSync(path.join(dir, 'systems.json'), '{"unowned":{"paths":[]},"systems":', 'utf8');
      const result = tasks('system');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('error: ');
      expect(result.stderr).toContain('systems.json');
    }));
});

describe('concept paths are stored in one spelling', () => {
  it('strips a trailing slash, so the concept claims files instead of nothing', () =>
    fixture(({ tasks }) => {
      tasks('concept', 'Runtime', 'everything', '--paths', 'src/runtime/', '--note', 'probe');
      const shown = tasks('system', 'Runtime');
      expect(shown.stdout).toMatch(/everything — [1-9]\d* file\(s\)/);
      expect(shown.stdout).not.toContain('(none matching)');
    }));

  it('reads a windows separator as the same declared region', () =>
    fixture(({ dir, tasks }) => {
      tasks('concept', 'Runtime', 'saves', '--paths', 'src\\runtime\\save.ts', '--note', 'probe');
      const raw = JSON.parse(readFileSync(path.join(dir, 'systems.json'), 'utf8')) as { systems: Array<{ concepts?: Array<{ paths: string[] }> }> };
      expect(raw.systems[0].concepts?.[0].paths).toEqual(['src/runtime/save.ts']);
    }));

  it('refuses a name that is only whitespace, which nothing could ever find', () =>
    fixture(({ tasks }) => {
      expect(tasks('concept', 'Runtime', '   ', '--paths', 'src/runtime/save.ts').status).toBe(1);
    }));
});

// A real repo, because the defect is precisely the gap between what git's
// index lists and what is on disk, and no fixture tree can hold that gap.
// This is the moment the command exists for: a worker has deleted or renamed
// a file and asks where the thing it imports now lives.
describe('the architecture queries, against a tracked file deleted from the working tree', () => {
  it('answers instead of dying on the missing file', () =>
    gitFixture(({ dir, commit, tasks }) => {
      writeFileSync(path.join(dir, 'kept.ts'), "import './gone';\nexport const kept = 1;\n", 'utf8');
      writeFileSync(path.join(dir, 'gone.ts'), 'export const gone = 1;\n', 'utf8');
      commit('Add two modules\n\nA base for the deletion below.');
      rmSync(path.join(dir, 'gone.ts'));

      const where = tasks('where', 'kept.ts');
      expect(where.status).toBe(0);
      expect(where.stdout).toContain('kept.ts');

      expect(tasks('system').status).toBe(0);
    }));
});

// The tsx-before-npx launcher choice was verified by hand and rested on
// nothing executable — a future hook edit would not have reddened anything.
describe('the commit-msg hook launcher', () => {
  it('prefers the repo-local tsx, keeping npx only as the fallback for an uninstalled checkout', () => {
    const hook = readFileSync(path.join(repoRoot, '.claude', 'hooks', 'commit-msg'), 'utf8');
    const local = hook.indexOf('node node_modules/tsx/dist/cli.mjs scripts/tasks.ts check-commit-msg');
    const fallback = hook.indexOf('npx tsx scripts/tasks.ts check-commit-msg');
    expect(local).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(local);
  });
});
