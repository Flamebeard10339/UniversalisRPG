import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultStoreGitFixture, fixture, installDataGit, runInProcess, spawnTasks, unbornDefaultStoreFixture, type Run } from './cliFixtures';
import { realDefaultStoreGitFixture } from './realGitFixture';

describe('tasks CLI', () => {
  it('doctor reports a record disagreeing with itself and still exits zero, because no disagreement about the work may fail a build', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'fine', '--system', 'Runtime');
      const clean = tasks('doctor');
      expect(clean.status).toBe(0);
      expect(clean.stdout).toContain('0 error(s)');

      writeFileSync(path.join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', title: 'a', kind: 'task', state: 'declined', severity: null, system: null, spec: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: null })}\n`, 'utf8');
      const inconsistent = tasks('doctor');
      expect(inconsistent.status).toBe(0);
      expect(inconsistent.stdout).toContain('reported, not enforced');
      expect(inconsistent.stdout).toContain('[error] a is declined but has no reason');
    });
  });

  it('doctor exits non-zero on a reference that resolves to nothing, which is the one thing about the store a machine can check', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', title: 'a', kind: 'task', state: 'open', severity: null, system: 'Nonexistent', spec: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: null })}\n`, 'utf8');
      const result = tasks('doctor');
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('[dangling] a has a system not in systems.json: Nonexistent');
      expect(result.stdout).toContain('1 dangling reference(s)');
      expect(result.stderr).toContain('resolve to nothing');
    });
  });

  it('a closed record keeps its spec slug after the spec file is deleted, so a finished spec can retire', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      tasks('done', 'a-member');
      rmSync(path.join(dir, 'specs', 'demo-spec.md'));

      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('references a spec with no file');
      expect(tasks('show', 'a-member').stdout).toContain('spec: demo-spec');
    });
  });

  it('a live record naming a spec with no file is a dangling reference, and `spec remove` detaches it without the file', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      rmSync(path.join(dir, 'specs', 'demo-spec.md'));
      expect(tasks('doctor').status).toBe(1);

      const removed = tasks('spec', 'remove', 'demo-spec', 'a-member');
      expect(removed.status).toBe(0);
      expect(removed.stdout).toContain('detaching them is what this is for');
      expect(tasks('doctor').status).toBe(0);
    });
  });

  it('doctor exits non-zero on a store that will not parse, which a later write would delete rather than disagree with', () => {
    fixture(({ tasks, dir }) => {
      const store = path.join(dir, 'tasks.jsonl');
      tasks('add', 'fine');
      writeFileSync(store, `${readFileSync(store, 'utf8')}<<<<<<< HEAD\n`, 'utf8');

      const result = tasks('doctor');
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('1 unparseable line(s)');
      expect(result.stderr).toContain('does not parse');
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
      // Non-zero for the unresolved requirement it repaired nothing about,
      // never for the close date it did.
      expect(fixed.status).toBe(1);
      expect(fixed.stdout).toContain('repaired 1:');
      expect(fixed.stdout).toContain('reopened is open: cleared its close date (2026-08-01)');
      expect(readFileSync(store, 'utf8')).not.toContain('2026-08-01');
      // The unresolved requirement is reported by both runs and repaired by
      // neither: dropping the edge and creating the task are both defensible.
      expect(fixed.stdout).toContain('[dangling] reopened requires unresolved id: ghost');
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
  // Only the write that warns is a real process: a silent write never sets
  // the once-per-process flag, so the two silence observations run
  // in-process without spending what the warn-once test below observes —
  // and the warning observation spawns, so it cannot spend it either.
  it('default-store writes stay silent about their own dirtiness, and warn once over stale uncommitted state', () => {
    realDefaultStoreGitFixture(({ dir, tasks }) => {
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
      const stale = spawnTasks(dir, ['add', 'Third task', '--id', 'third-task', '--branch', 'demo-spec']);
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
    realDefaultStoreGitFixture(({ dir, tasks }) => {
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
    realDefaultStoreGitFixture(({ dir, tasks }) => {
      tasks('add', 'stale finding', '--id', 'stale', '--kind', 'finding', '--fault', 'tooling', '--deliverable', 'fix it');
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
    mkdirSync(path.join(dir, 'docs'), { recursive: true });
    const store = path.join(dir, 'docs', 'tasks.jsonl');
    const record = (id: string): string =>
      `${JSON.stringify({ id, title: id, kind: 'task', state: 'open', severity: null, system: null, spec: null, clause: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: null, closedCommit: null, claimed: null, claimedBy: null })}\n`;
    writeFileSync(store, record('committed-task'), 'utf8');
    // The install snapshots the baseline store, standing in for the commit
    // that used to carry it.
    const repo = installDataGit(dir);
    try {
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
      repo.uninstall();
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Mid-merge, HEAD is still the pre-merge commit, so both git-anchored
  // checks answer about a tree that does not exist yet — the exact state in
  // which a hand-resolved store most needs the store-only checks readable.
  it('doctor suspends the git-anchored checks during an unresolved merge, and the store-only checks still run', () => {
    realDefaultStoreGitFixture(({ dir, tasks }) => {
      tasks('add', 'closable task', '--id', 'closable', '--requires', 'ghost-requirement');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'add closable'], { cwd: dir, encoding: 'utf8' });

      // The merge scenery is built while the store is clean, so the -a
      // commits below cannot quietly carry the close this test is about.
      writeFileSync(path.join(dir, 'conflict.txt'), 'base\n', 'utf8');
      spawnSync('git', ['add', '.'], { cwd: dir });
      spawnSync('git', ['commit', '--no-verify', '-m', 'base'], { cwd: dir, encoding: 'utf8' });
      spawnSync('git', ['checkout', '-q', '-b', 'side'], { cwd: dir });
      writeFileSync(path.join(dir, 'conflict.txt'), 'side\n', 'utf8');
      spawnSync('git', ['commit', '--no-verify', '-am', 'side edit'], { cwd: dir, encoding: 'utf8' });
      spawnSync('git', ['checkout', '-q', '-'], { cwd: dir });
      writeFileSync(path.join(dir, 'conflict.txt'), 'ours\n', 'utf8');
      spawnSync('git', ['commit', '--no-verify', '-am', 'our edit'], { cwd: dir, encoding: 'utf8' });

      // The close stays working-tree-only through the conflicted merge, so
      // the suspension is the only thing keeping its warning out of the
      // report — remove it and the assertion below fails.
      tasks('done', 'closable');
      spawnSync('git', ['merge', 'side'], { cwd: dir, encoding: 'utf8' });

      const result = tasks('doctor');
      // Non-zero for the unresolved requirement below, which is the point of
      // the assertion after it: the store-only checks ran.
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('a merge is in progress (MERGE_HEAD exists)');
      expect(result.stdout).not.toContain('only in the working tree');
      // The store-only checks are the ones worth reading mid-merge, and the
      // unresolved requirement proves they still ran.
      expect(result.stdout).toContain('closable requires unresolved id: ghost-requirement');
    });
  });

  it('doctor reports a working-tree-only in-progress transition as a warning, not an error', () => {
    realDefaultStoreGitFixture(({ dir, tasks }) => {
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

  // The store must be the tracked default one for the comparison to be
  // attempted at all: under any other `--store` the check returns before it
  // reads HEAD, and a test written there passes without reaching the
  // degradation it is named for.
  it('doctor degrades to no working-tree-comparison issue when there is no committed store (unborn HEAD)', () => {
    unbornDefaultStoreFixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'docs', 'tasks.jsonl'), `${JSON.stringify({ id: 'a', title: 'a', kind: 'task', state: 'done', severity: null, system: null, spec: null, clause: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: '2026-08-01', closedCommit: null })}\n`, 'utf8');
      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('only in the working tree');
    });
  });

  // The other side of the same guard, and the reason it cannot be dropped as
  // redundant: HEAD does carry this store, so without the guard the
  // comparison runs and reports a close the branch never owed anyone.
  it('doctor compares no store against HEAD but the tracked default, even when HEAD carries the path it was given', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-aside-store-'));
    const cwd = process.cwd();
    const record = (state: string): string =>
      `${JSON.stringify({ id: 'a', title: 'a', kind: 'task', state, severity: null, system: null, spec: null, clause: null, requires: [], files: [], deliverable: null, evidence: null, source: null, reason: null, closed: state === 'done' ? '2026-08-01' : null, closedCommit: null })}\n`;
    mkdirSync(path.join(dir, 'docs', 'specs'), { recursive: true });
    mkdirSync(path.join(dir, 'docs', 'audits'), { recursive: true });
    writeFileSync(path.join(dir, 'docs', 'audits', 'systems.json'), JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [] }), 'utf8');
    writeFileSync(path.join(dir, 'docs', 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nX.\n\nProof:\n\n- It holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
    writeFileSync(path.join(dir, 'docs', 'tasks.jsonl'), '', 'utf8');
    const aside = path.join(dir, 'docs', 'aside.jsonl');
    writeFileSync(aside, record('open'), 'utf8');
    const repo = installDataGit(dir, 'main');
    try {
      process.chdir(dir);
      writeFileSync(aside, record('done'), 'utf8');
      const result = runInProcess(['doctor', '--store', aside, '--branch', 'demo-spec']);
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('only in the working tree');
    } finally {
      repo.uninstall();
      process.chdir(cwd);
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

  it('doctor ignores a directory named like a markdown spec file', () => {
    fixture(({ tasks, dir }) => {
      mkdirSync(path.join(dir, 'specs', 'not-a-file.md'));
      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 error(s)');
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
});

// c4 and c5. Ruled by the author 2026-08-06, refusing this clause's original
// form: one historical absence is the case for reporting it, not for failing
// the build on the store's own history. Written as a refusal rather than
// deleted, because a deleted clause leaves the gate available to the next
// branch that finds the argument locally reasonable — and this exact gate was
// proposed twice in one day from two independent directions.
describe('the log against the store, reported and never enforced', () => {
  const vanish = (tasks: (...args: string[]) => Run, dir: string, id: string): void => {
    tasks('add', 'a record that will vanish', '--id', id);
    const store = path.join(dir, 'tasks.jsonl');
    writeFileSync(
      store,
      readFileSync(store, 'utf8')
        .split('\n')
        .filter((line) => !line.includes(`"id":${JSON.stringify(id)}`))
        .join('\n'),
      'utf8',
    );
  };

  it('names an unexplained absence, counts it, and still exits zero', () => {
    fixture(({ tasks, dir }) => {
      vanish(tasks, dir, 'vanished');

      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('1 record(s) absent with nothing explaining it');
      expect(result.stdout).toContain('[absent] vanished');
      expect(result.stdout).toContain('tasks remove vanished --reason');
    });
  });

  it('stops naming it once a removal accounts for it', () => {
    fixture(({ tasks, dir }) => {
      vanish(tasks, dir, 'vanished');
      tasks('remove', 'vanished', '--reason', 'scratch, never real work');

      const result = tasks('doctor');
      expect(result.stdout).toContain('0 record(s) absent with nothing explaining it, 1 absent and accounted for');
      expect(result.stdout).not.toContain('[absent] vanished');
    });
  });

  it('prints its coverage on a clean run rather than the word reconciled', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'ordinary work', '--id', 'ordinary');
      const store = path.join(dir, 'tasks.jsonl');
      // A record predating the log: in the store, with no `add` event, so
      // nothing here can say whether it ever left.
      writeFileSync(store, `${readFileSync(store, 'utf8')}${JSON.stringify({ id: 'from-before', seq: 9, title: 'older than the log', kind: 'task', state: 'open', severity: null, system: null, spec: null, clause: null, discharges: [], requires: [], files: [], writes: [], grant: null, produces: [], deliverable: null, evidence: null, source: null, reason: null, trigger: null, closed: null, closedCommit: null, claimed: null, claimedBy: null })}\n`, 'utf8');

      const result = tasks('doctor');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 record(s) absent with nothing explaining it');
      expect(result.stdout).toContain('1 of 2 store record(s) outside what this can check at all');
      expect(result.stdout).not.toContain('reconciled');
    });
  });

  it('leaves --fix alone, because a record the store lost is not one doctor may invent', () => {
    fixture(({ tasks, dir }) => {
      vanish(tasks, dir, 'vanished');

      const fixed = tasks('doctor', '--fix');
      expect(fixed.status).toBe(0);
      expect(fixed.stdout).toContain('[absent] vanished');
      expect(readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8')).not.toContain('vanished');
    });
  });
});
