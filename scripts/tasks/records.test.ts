import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tsxCli } from '../lib/tsxCli';
import { TERMINAL_WIDTH } from './render';
import { ageClaim, appendEvent, enclosingGitFixture, fixture, gitFixture, repoRoot, runInProcess, script, today } from './cliFixtures';
import { realGitFixture } from './realGitFixture';

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

  it('records a write grant and a produced interface, and shows both back', () => {
    fixture(({ tasks }) => {
      const added = tasks('add', 'extract the policy module', '--id', 'seam', '--writes', 'scripts/lib/policy.ts,scripts/lib/policy.test.ts', '--produces', 'policy module,PolicyDecision type');
      expect(added.status).toBe(0);

      const shown = tasks('show', 'seam').stdout;
      expect(shown).toContain('writes (forecast): scripts/lib/policy.ts, scripts/lib/policy.test.ts');
      expect(shown).toContain('produces: policy module, PolicyDecision type');

      const edited = tasks('edit', 'seam', '--writes', 'scripts/lib/policy.ts');
      expect(edited.stdout).toContain('edited seam: writes');
      expect(tasks('show', 'seam').stdout).toContain('writes (forecast): scripts/lib/policy.ts\n');
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

      // The field wraps under its own label now, so nothing is cut and no
      // continuation lands flush at column zero against the next label.
      // Collapsing the run of whitespace is what puts the value back.
      const flat = (output: string): string => output.replace(/\s+/g, ' ');

      const concise = tasks('next');
      expect(concise.stdout).toContain('verbose-task  [task/open/high]');
      expect(concise.stdout).toContain('files: src/runtime/save.ts:1');
      expect(flat(concise.stdout)).toContain(`evidence: ${longEvidence}`);
      expect(flat(concise.stdout)).toContain(tail);
      // The prose field and its continuations fit the report. A record's id,
      // title and file list are single values and are never cut.
      const wrapped = concise.stdout.split('\n').filter((line) => line.startsWith('evidence:') || line.startsWith('          '));
      expect(wrapped.length).toBeGreaterThan(1);
      for (const line of wrapped) expect(line.length).toBeLessThanOrEqual(TERMINAL_WIDTH);

      const full = tasks('next', '--full');
      expect(flat(full.stdout)).toContain(longEvidence);
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

  // The motivating gap this closes: a declined record's whole argument can
  // live in `reason` with nothing in `writes` or `files` to be found by, the
  // shape `audit-loop-costs-less-clause-5` actually has. `list`'s default
  // still hides closed work — that default is for a live queue, and a
  // declined or done record is resolved, not something to work on.
  describe('search reaches the reason field and closed records', () => {
    it('matches a declined record by its reason, with no --state given', () =>
      fixture(({ tasks }) => {
        tasks('add', 'shrink the save test', '--id', 'save-test-shrink');
        tasks('decline', 'save-test-shrink', '--reason', 'shrinking it further means faking the git subprocesses that are the thing it tests');

        const result = tasks('search', 'faking git');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('save-test-shrink');
        expect(result.stdout).toContain('(matches: reason)');
      }));

    it('does not put a declined record in the default queue view — only search reaches past the not-closed default', () =>
      fixture(({ tasks }) => {
        tasks('add', 'shrink the save test', '--id', 'save-test-shrink');
        tasks('decline', 'save-test-shrink', '--reason', 'faking the subprocess is not worth it');

        expect(tasks('list').stdout).not.toContain('save-test-shrink');
        expect(tasks('search', 'faking').stdout).toContain('save-test-shrink');
      }));

    it('an explicit --state still narrows a search the way it narrows a list', () =>
      fixture(({ tasks }) => {
        tasks('add', 'shrink the save test', '--id', 'save-test-shrink');
        tasks('decline', 'save-test-shrink', '--reason', 'faking the subprocess is not worth it');
        tasks('add', 'an open record about the same word', '--id', 'still-open', '--deliverable', 'faking is mentioned here too');

        const declinedOnly = tasks('search', 'faking', '--state', 'declined');
        expect(declinedOnly.stdout).toContain('save-test-shrink');
        expect(declinedOnly.stdout).not.toContain('still-open');
      }));

    it('reports the words a query is split into as matched anywhere they land, not only as a contiguous phrase', () =>
      fixture(({ tasks }) => {
        tasks('add', 'the phrase is split across the sentence', '--id', 'split-match', '--deliverable', 'this reason talks about faking a subprocess and also mentions git elsewhere');
        const result = tasks('search', 'faking git');
        expect(result.stdout).toContain('split-match');
      }));
  });

  it('a query naming nothing points at the event log as the index it did not read', () =>
    fixture(({ tasks }) => {
      tasks('add', 'unrelated record', '--id', 'unrelated');
      const result = tasks('search', 'no-record-carries-this-term');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('This searches id, title, system, deliverable, evidence, reason');
      expect(result.stdout).toContain('tasks log "no-record-carries-this-term"');
    }));

  it('list, with no search term, does not print the event-log pointer on an empty result', () =>
    fixture(({ tasks }) => {
      const result = tasks('list', '--state', 'done');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('not the event log');
    }));

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
    enclosingGitFixture(({ tasks, dir }) => {
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
    realGitFixture(({ dir, commit, tasks }) => {
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

  // The motivating gap this closes: `audit-loop-costs-less-clause-5` was
  // declined with "we will reevaluate handoff and its tests if npm test
  // becomes an issue" resting only in `reason` prose — no queue, roadmap or
  // survey surfaced it when that reevaluation was actually asked for.
  describe('decline --trigger and list --triggered', () => {
    it('records a condition for revisiting, printed back by show', () =>
      fixture(({ tasks }) => {
        tasks('add', 'shrink the handoff test', '--id', 'handoff-shrink');
        const declined = tasks('decline', 'handoff-shrink', '--reason', 'faking the git subprocesses is not worth it', '--trigger', 'reevaluate if npm test becomes an issue');
        expect(declined.status).toBe(0);
        expect(declined.stdout).toContain('trigger recorded');

        const shown = tasks('show', 'handoff-shrink');
        expect(shown.stdout).toContain('reason: faking the git subprocesses is not worth it');
        expect(shown.stdout).toContain('trigger: reevaluate if npm test becomes an issue');
      }));

    it('a decline with no --trigger records none, and show prints no trigger line', () =>
      fixture(({ tasks }) => {
        tasks('add', 'no condition here', '--id', 'plain-decline');
        tasks('decline', 'plain-decline', '--reason', 'not worth it');
        expect(tasks('show', 'plain-decline').stdout).not.toContain('trigger:');
      }));

    it('list --triggered reaches a declined record with a trigger, past the not-closed default', () =>
      fixture(({ tasks }) => {
        tasks('add', 'shrink the handoff test', '--id', 'handoff-shrink');
        tasks('decline', 'handoff-shrink', '--reason', 'not worth faking git over', '--trigger', 'reevaluate if npm test becomes an issue');
        tasks('add', 'a plain declined record', '--id', 'plain-decline');
        tasks('decline', 'plain-decline', '--reason', 'not worth it');
        tasks('add', 'a live record', '--id', 'still-open');

        expect(tasks('list').stdout).not.toContain('handoff-shrink');

        const result = tasks('list', '--triggered');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('handoff-shrink');
        expect(result.stdout).toContain('(trigger: reevaluate if npm test becomes an issue)');
        expect(result.stdout).not.toContain('plain-decline');
        expect(result.stdout).not.toContain('still-open');
      }));
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
      const on = (branch: string): { stdout: string } => spawnSync(process.execPath, [tsxCli, script, 'next', ...globals, '--branch', branch], { cwd: repoRoot, encoding: 'utf8' });

      const onMain = on('main');
      expect(onMain.stdout).not.toContain('spec inferred from the store');
      expect(onMain.stdout).not.toContain('open task');

      // The same store, one branch name different: still inferred, so what
      // changed is the rule for main and not the inference itself.
      expect(on('orphaned-branch').stdout).toContain('spec inferred from the store: demo-spec');
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
      for (const command of [['next'], ['spec', 'show']]) {
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

  // `list` filters on no spec unless one is given, so resolving one was
  // three lines contesting an answer the query never read. A read infers a
  // spec only where it uses one.
  it('list neither infers a spec nor mentions one, because it does not filter on one', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a task', '--id', 'a-task', '--spec', 'demo-spec');
      tasks('add', 'deferred task', '--id', 'deferred-task');
      const storePath = path.join(dir, 'tasks.jsonl');
      const systemsPath = path.join(dir, 'systems.json');
      const specsDir = path.join(dir, 'specs');
      const result = spawnSync(process.execPath, [tsxCli, script, 'list', '--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'orphaned-branch'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.stdout).not.toContain('spec inferred');
      expect(result.stdout).not.toContain('spec contested');
      expect(result.stdout).toContain('a-task');
      expect(result.stdout).toContain('deferred-task');
    });
  });
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

// Six clauses meeting on one surface: what a grant declares, what setting
// one asks, what a close says back, and the two behaviours that had to
// survive all of it.
describe('a record that declares its grant kind', () => {
  it('records a grant declared at add time as a forecast, and names the command that commits it', () =>
    fixture(({ tasks }) => {
      const added = tasks('add', 'unread work', '--id', 'unread', '--writes', 'src/runtime/');
      expect(added.stdout).toContain('recorded as a forecast');
      expect(added.stdout).toContain('--grant commitment');
      expect(tasks('show', 'unread').stdout).toContain('writes (forecast): src/runtime/');
    }));

  it('keeps a commitment through an edit that changes something else', () =>
    fixture(({ tasks }) => {
      tasks('add', 'read work', '--id', 'read', '--writes', 'src/runtime/combat.ts', '--grant', 'commitment');
      tasks('edit', 'read', '--title', 'read work, retitled');
      expect(tasks('show', 'read').stdout).toContain('writes (commitment):');
    }));

  it('leaves a record that has said nothing saying nothing, rather than defaulting it', () =>
    fixture(({ tasks }) => {
      tasks('add', 'no grant', '--id', 'silent');
      expect(tasks('show', 'silent').stdout).not.toContain('writes');
      expect(tasks('edit', 'silent', '--severity', 'low').stdout).toBe('edited silent: severity\n');
    }));

  it('refuses a grant kind it does not know, rather than recording it', () =>
    fixture(({ tasks }) => {
      const result = tasks('add', 'bad grant', '--id', 'bad', '--writes', 'src/runtime/', '--grant', 'maybe');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--grant must be one of forecast, commitment');
    }));

  it('grades an overlap between two commitments as a defect and the same overlap under a forecast as a note', () =>
    fixture(({ tasks }) => {
      tasks('add', 'left', '--id', 'left', '--spec', 'demo-spec', '--writes', 'src/runtime/combat.ts', '--grant', 'commitment');
      tasks('add', 'right', '--id', 'right', '--spec', 'demo-spec', '--writes', 'src/runtime/combat.ts', '--grant', 'commitment');
      const committed = tasks('plan', 'left', 'right').stdout;
      expect(committed).toContain('2 of those a commitment');
      expect(committed).toContain('[defect] left and right both write');

      tasks('edit', 'right', '--grant', 'forecast');
      const forecast = tasks('plan', 'left', 'right').stdout;
      expect(forecast).toContain("[note] left and right both write");
      expect(forecast).toContain("right's grant is forecast");
    }));
});

describe('setting a write grant, which asks what already claims those paths', () => {
  it('answers without being asked, and does not report the record against its own grant', () =>
    fixture(({ tasks }) => {
      tasks('add', 'the first claim', '--id', 'first', '--writes', 'src/runtime/combat.ts');
      const second = tasks('add', 'the second claim', '--id', 'second', '--writes', 'src/runtime/combat.ts');
      expect(second.stdout).toContain('prior art on src/runtime/combat.ts');
      expect(second.stdout).toContain('first — the first claim');
      expect(second.stdout).not.toContain('second — the second claim');
    }));

  it('reaches a claim that closed, which is what a dispatch-set check cannot see', () =>
    fixture(({ tasks }) => {
      tasks('add', 'settled long ago', '--id', 'settled', '--writes', 'src/runtime/save.ts');
      tasks('done', 'settled');
      expect(tasks('add', 'the same region again', '--id', 'again', '--writes', 'src/runtime/save.ts').stdout).toContain('[done] settled');
    }));

  it('fires on edit as well as add, and says plainly when nothing has claimed the paths', () =>
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'lonely');
      expect(tasks('edit', 'lonely', '--writes', 'src/ui/untouched.ts').stdout).toContain('nothing has claimed src/ui/untouched.ts');
    }));

  it('stays quiet on an edit that sets no grant', () =>
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'quiet', '--writes', 'src/runtime/combat.ts');
      expect(tasks('edit', 'quiet', '--severity', 'low').stdout).not.toContain('prior art');
    }));

  // The re-survey a write grant fires by itself is the one nobody has to
  // remember to run, and until now it could only see a claim, not a
  // decision — the same defect `where` had before rulingsOn existed, alive
  // at this second call site.
  it('prints rulings beside prior art when a write grant lands on a path something has already been ruled on', () =>
    fixture(({ tasks }) => {
      tasks('add', 'shrink the handoff test', '--id', 'shrink-handoff', '--writes', 'scripts/tasks/handoff.test.ts');
      tasks('decline', 'shrink-handoff', '--reason', 'handoff.test.ts is 16s of a 25s wall, and shrinking it further means faking the subprocess it tests');

      const result = tasks('add', 'touch the handoff test', '--id', 'touch-handoff', '--writes', 'scripts/tasks/handoff.test.ts');
      expect(result.stdout).toContain('prior art on scripts/tasks/handoff.test.ts');
      expect(result.stdout).toContain('rulings on scripts/tasks/handoff.test.ts:');
      expect(result.stdout).toContain('[ruling] shrink-handoff (declined) reason —');
    }));

  it('excludes the record\'s own claim from rulings, the same way it excludes it from prior art', () =>
    fixture(({ tasks }) => {
      tasks('add', 'shrink the save test', '--id', 'self-ruling', '--writes', 'src/runtime/save.test.ts');
      tasks('decline', 'self-ruling', '--reason', 'save.test.ts is not worth shrinking further');

      const result = tasks('edit', 'self-ruling', '--writes', 'src/runtime/save.test.ts');
      expect(result.stdout).not.toContain('[ruling] self-ruling');
      expect(result.stdout).toContain('no ruling names src/runtime/save.test.ts or its basename');
    }));
});

describe('a close that says back what it knows', () => {
  it('surfaces on the record the evidence a closer recorded with tasks note', () =>
    fixture(({ tasks }) => {
      tasks('add', 'the renaming', '--id', 'renames', '--spec', 'demo-spec');
      tasks('done', 'renames');
      tasks('note', 'checked all 28 renamed titles against the store; none had dropped', '--id', 'renames', '--actor', 'worker');
      tasks('decision', 'the rewrite is one change, so one commit', '--id', 'renames', '--actor', 'worker');

      const shown = tasks('show', 'renames').stdout;
      expect(shown).toContain('2 judgement(s) recorded against this record');
      expect(shown).toContain('checked all 28 renamed titles');
      expect(shown).toContain('[decision]');
      expect(shown).toContain('worker');
    }));

  it('says nothing about judgements on a record that carries none', () =>
    fixture(({ tasks }) => {
      tasks('add', 'plain work', '--id', 'plain');
      expect(tasks('show', 'plain').stdout).not.toContain('judgement(s)');
    }));

  it('names the tasks decision command from done and from decline', () =>
    fixture(({ tasks }) => {
      tasks('add', 'closed work', '--id', 'closing');
      expect(tasks('done', 'closing').stdout).toContain('tasks decision "<one line>" --id closing');

      tasks('add', 'refused work', '--id', 'refusing');
      expect(tasks('decline', 'refusing', '--reason', 'not worth it').stdout).toContain('tasks decision "<one line>" --id refusing');
    }));

  it('names it from triage too, which is the third place a disposition is decided', () =>
    fixture(async ({ tasks, triage }) => {
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--severity', 'high', '--deliverable', 'fix it', '--evidence', 'seen');
      expect((await triage('1\n')).stdout).toContain('tasks decision "<one line>" --id a-finding');
    }));
});

// The two behaviours this branch had to leave alone. Both are the tool
// declining to let a close look tidier than it is, at the moment the
// judgement is made.
describe('what already worked, after the record verbs changed around it', () => {
  it('still prints the clause standing a done closed against', () =>
    fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=unmet', '--evidence', '1=the seam is still open', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(tasks('done', 'demo-spec-clause-1').stdout).toContain('clause standing at close: proof clause 1 is unmet in the latest audit pass (pass 1)');
    }));

  it('still names a pass-2 promotion as extending what the spec owes', () =>
    fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'late finding', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'seen late');
      const result = tasks('promote', 'demo-spec-pass2-late-finding');
      expect(result.stdout).toContain('promoting a pass 2 finding, which extends what demo-spec owes: demo-spec-pass2-late-finding');
    }));
});

describe('a read that resolves a spec only where it uses one', () => {
  // `claude/<topic>-<hash>` looks for a nested spec path that cannot exist,
  // and the open-members route contests whenever more than one spec is live.
  // The log already records the branch of every store write, so which spec a
  // branch is working is derivable rather than declared.
  it('infers the spec this branch last wrote to, which the branch name cannot answer for a worktree', () => {
    fixture(({ tasks, dir, args }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      tasks('add', 'elsewhere', '--id', 'elsewhere');
      appendEvent(dir, { branch: 'claude/generated-2f9a11', spec: 'demo-spec', id: 'a-member' });
      const result = runInProcess(['next', ...args(), '--branch', 'claude/generated-2f9a11']);
      expect(result.stdout).toContain('spec inferred from the event log: demo-spec');
      expect(result.stdout).toContain('the most recent spec written from claude/generated-2f9a11');
    });
  });

  it('leaves the default branch inferring nothing, whatever the log holds', () => {
    fixture(({ tasks, dir, args }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      appendEvent(dir, { branch: 'main', spec: 'demo-spec', id: 'a-member' });
      expect(runInProcess(['next', ...args(), '--branch', 'main']).stdout).toContain('no active spec for this branch');
    });
  });

  it('answers `spec show` with no slug the way `next` answers with no --spec', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      const result = tasks('spec', 'show');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('spec inferred from the branch name: demo-spec');
      expect(result.stdout).toContain('a-member');
    });
  });
});

// The store is versioned with the code, so a checkout that predates a
// branch's writes answers `0 task(s)` — indistinguishable from "those
// records are gone", which is what sent a session to `git show` piped
// through `node -e` to recover them.
describe('a query that cannot see a record', () => {
  it('says the read is scoped to this checkout, and how much the file holds', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task');
      const result = tasks('search', 'a-word-no-record-carries');
      expect(result.stdout).toContain('0 task(s)');
      expect(result.stdout).toContain('1 record(s) in the whole file');
      expect(result.stdout).toContain('A record written on another branch is not in this one until that branch merges');
    });
  });

  it('says nothing of the sort when the query did match', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a task', '--id', 'a-task');
      expect(tasks('search', 'a-task').stdout).not.toContain('in the whole file');
    });
  });
});
