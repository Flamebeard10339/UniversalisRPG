import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.join(import.meta.dirname, '..');
const tsx = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const script = path.join(repoRoot, 'scripts/tasks.ts');

interface Run {
  status: number;
  stdout: string;
  stderr: string;
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

describe('tasks CLI', () => {
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
      tasks('add', 'checkSave crashes', '--kind', 'finding', '--severity', 'high', '--spec', 'demo-spec');
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

  it('decline requires a reason and is refused for undelivered tasks', () => {
    fixture(({ tasks }) => {
      tasks('add', 'stale finding', '--id', 'stale', '--kind', 'finding');
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
      tasks('add', 'promote me', '--id', 'promote-me', '--kind', 'finding', '--severity', 'high', '--system', 'Runtime', '--evidence', 'evidence text');
      tasks('add', 'defer me', '--id', 'defer-me', '--kind', 'finding', '--severity', 'medium');
      tasks('add', 'decline me', '--id', 'decline-me', '--kind', 'finding', '--severity', 'low');

      const result = triage('1\n2\n3\nstale, superseded by later work\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 unreviewed finding(s) left');

      expect(tasks('show', 'promote-me').stdout).toContain('spec: demo-spec');
      expect(tasks('show', 'defer-me').stdout).toContain('spec: (deferred)');
      const declined = tasks('show', 'decline-me').stdout;
      expect(declined).toContain('reason: stale, superseded by later work');
    });
  });

  it('triage quits early and leaves the rest unreviewed', () => {
    fixture(({ tasks, triage }) => {
      tasks('add', 'first', '--id', 'first', '--kind', 'finding', '--severity', 'high');
      tasks('add', 'second', '--id', 'second', '--kind', 'finding', '--severity', 'low');

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
      const added = tasks('spec', 'add', 'demo-spec', 'a-task');
      expect(added.status).toBe(0);
      expect(tasks('show', 'a-task').stdout).toContain('spec: demo-spec');
    });
  });

  it('spec add refuses an unknown spec or an unknown task', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task');
      expect(tasks('spec', 'add', 'no-such-spec', 'a-task').status).toBe(1);
      expect(tasks('spec', 'add', 'demo-spec', 'no-such-task').status).toBe(1);
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
        `${JSON.stringify({ id: 'demo-spec-clause-1', title: 'Unmet deliverable clause 1', kind: 'undelivered', state: 'open', severity: 'high', system: null, spec: 'demo-spec', requires: [], files: [], deliverable: 'The first clause holds.', evidence: null, source: { spec: 'demo-spec', pass: 1 }, reason: null, closed: null })}\n`,
        'utf8',
      );
      const result = tasks('done', 'demo-spec-clause-1');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no recorded audit pass');
    });
  });

  it('done on an undelivered task refuses when its clause text no longer matches any proof clause', () => {
    fixture(({ tasks, dir }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      const storePath = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        storePath,
        `${JSON.stringify({ id: 'stale-clause', title: 'Unmet deliverable clause 9', kind: 'undelivered', state: 'open', severity: 'high', system: null, spec: 'demo-spec', requires: [], files: [], deliverable: 'a clause that used to exist', evidence: null, source: { spec: 'demo-spec', pass: 1 }, reason: null, closed: null })}\n`,
        'utf8',
      );
      const result = tasks('done', 'stale-clause');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no longer matches');
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

  it('audit refuses when a proof clause is missing a verdict', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('missing');
      expect(result.stderr).toContain('2');
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
        '--finding',
        'a fresh bug',
        '--severity',
        'medium',
        '--system',
        'Runtime',
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

      const finding = tasks('spec', 'show', 'demo-spec');
      expect(finding.stdout).not.toContain('a fresh bug'); // findings are not spec members until promoted
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

  it('check --merge refuses when a promoted finding is still unreviewed', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--severity', 'low');
      tasks('spec', 'add', 'demo-spec', 'a-finding');
      const result = tasks('check', '--merge');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('still unreviewed');
    });
  });

  it('handoff prints the last commit\'s Next: line, the spec deliverable, and open fix-now tasks', () => {
    fixture(({ tasks }) => {
      tasks('add', 'open task', '--id', 'open-task', '--spec', 'demo-spec', '--severity', 'high');
      const result = tasks('handoff');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('branch: demo-spec');
      expect(result.stdout).toContain('spec: demo-spec');
      expect(result.stdout).toContain('The first clause holds.');
      expect(result.stdout).toContain('open-task');
    });
  });

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

  it('triage refuses to promote a finding sourced from an audit pass 2 or later', () => {
    fixture(({ tasks, triage }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--finding', 'late finding', '--severity', 'low');
      const result = triage('1\n');
      expect(result.stdout).toContain('cannot be promoted');
      const shown = tasks('show', 'demo-spec-pass2-late-finding');
      expect(shown.stdout).toContain('spec: (deferred)');
    });
  });

  it('check-commit-msg passes a subject, body, and Next: trailer', () => {
    fixture(({ tasks, dir }) => {
      const msgFile = path.join(dir, 'msg.txt');
      writeFileSync(msgFile, 'Subject\n\nA body explaining the change.\n\nNext: pick up X.\n', 'utf8');
      const result = tasks('check-commit-msg', msgFile);
      expect(result.status).toBe(0);
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
