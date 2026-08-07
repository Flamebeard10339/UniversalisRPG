import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, repoRoot, runInProcess, type Run } from './cliFixtures';

describe('tasks CLI', () => {
  it('check-commit-msg passes a subject and body, a trailing Next: line included as ordinary content', () => {
    fixture(({ tasks, dir }) => {
      const msgFile = path.join(dir, 'msg.txt');
      writeFileSync(msgFile, 'Subject\n\nA body explaining the change.\n', 'utf8');
      expect(tasks('check-commit-msg', msgFile).status).toBe(0);

      writeFileSync(msgFile, 'Subject\n\nNext: pick up X.\n', 'utf8');
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
  it('records an event for every verb that writes the store, not only the well-travelled ones', async () => {
    await fixture(async ({ dir, tasks, triage }) => {
      const auditDoc = path.join(dir, 'legacy-audit.md');
      writeFileSync(auditDoc, '# Runtime — 2026-01-01\n\n## H1 — an imported finding\n\n**Files:** `src/runtime/a.ts:1`\n\nEvidence prose.\n\n**Fix**: do the thing.\n', 'utf8');

      tasks('import', auditDoc, '--fault', 'contract', '--actor', 'importer');
      await triage('2\n');
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

  it('records the audit pass itself as an event with no task', async () => {
    await fixture(async ({ dir, audit }) => {
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--actor', 'auditor');
      const passes = readEvents(dir).filter((event) => event.op === 'audit');
      expect(passes).toHaveLength(1);
      expect(passes[0].id).toBeNull();
      expect(passes[0].spec).toBe('demo-spec');
      expect(passes[0].by).toBe('auditor');
    });
  });

  it('records an undelivered task beside the pass that created it', async () => {
    await fixture(async ({ dir, audit }) => {
      await audit('demo-spec', '--proof', '1=unmet', '--evidence', '1=not yet', '--proof', '2=met', '--evidence', '2=clause 2 checked');
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
