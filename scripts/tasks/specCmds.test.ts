import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture } from './cliFixtures';

describe('tasks CLI', () => {
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

  it('done is unaffected for a normal kind:task, met/unmet verdicts do not apply to it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'plain', '--id', 'plain');
      const result = tasks('done', 'plain');
      expect(result.status).toBe(0);
      expect(tasks('show', 'plain').stdout).toContain('closed: ');
    });
  });
});

// The map from clauses to owners is a decomposition session's whole output,
// and it had nowhere to go but prose: seventeen clauses and twelve members,
// with the mapping in twelve deliverable strings no reader can join.
describe('a task that records which clauses it discharges', () => {
  it('records them from add, reads c3 and 3 alike, and shows them back', () => {
    fixture(({ tasks }) => {
      const added = tasks('add', 'a slice', '--id', 'slice', '--spec', 'demo-spec', '--discharges', 'c2,1,c1');
      expect(added.status).toBe(0);
      expect(tasks('show', 'slice').stdout).toContain('discharges: c1, c2');
    });
  });

  it('adds and removes the clauses a task discharges through edit', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a slice', '--id', 'slice', '--spec', 'demo-spec', '--discharges', 'c1');
      expect(tasks('edit', 'slice', '--discharges', 'c1,c2').stdout).toContain('edited slice: discharges');
      expect(tasks('show', 'slice').stdout).toContain('discharges: c1, c2');

      // An empty value clears them, so a slice that turns out to owe nothing
      // can say so without the record keeping a claim it no longer makes.
      tasks('edit', 'slice', '--discharges', '');
      expect(tasks('show', 'slice').stdout).not.toContain('discharges:');
    });
  });

  it('refuses something that is not a clause number rather than recording it', () => {
    fixture(({ tasks }) => {
      const result = tasks('add', 'a slice', '--id', 'slice', '--spec', 'demo-spec', '--discharges', 'the second one');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--discharges takes clause numbers, as 3 or c3');
    });
  });

  it('names the owner of every clause standing, and says plainly which clause has none', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a slice', '--id', 'slice', '--spec', 'demo-spec', '--discharges', 'c1');
      const shown = tasks('spec', 'show', 'demo-spec').stdout;
      expect(shown).toContain('owed by: slice (open)');
      expect(shown).toContain('owed by: nobody — `tasks edit <id> --discharges c2` names the slice that does');
    });
  });

  it('reports a claim on a clause when no spec says what the number means', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a slice', '--id', 'slice', '--discharges', 'c1');
      expect(tasks('doctor').stdout).toContain('slice claims to discharge clause(s) 1 and names no spec');
    });
  });
});

// The one moment the whole capability landscape is in view, and the moment a
// planner is least likely to stop and ask.
describe('tasks spec new', () => {
  it('prints the capability survey and the reminder that the judgement belongs in ## Decisions', () => {
    fixture(({ tasks }) => {
      const result = tasks('spec', 'new', 'a-fresh-spec');
      expect(result.stdout).toContain('tasks where <path>');
      expect(result.stdout).toContain('tasks produces "<name>"');
      expect(result.stdout).toContain('## Decisions');
      expect(result.stdout).toContain('adds, extends');
    });
  });
});
