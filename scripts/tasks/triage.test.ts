import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, runInProcess, runInProcessAsync } from './cliFixtures';
import { TRIAGE_ACTIONS } from './triage';

describe('tasks CLI', () => {
  it('triage promotes, defers and declines findings, saving after every decision', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'promote me', '--id', 'promote-me', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--system', 'Runtime', '--evidence', 'evidence text', '--deliverable', 'fix it');
      tasks('add', 'defer me', '--id', 'defer-me', '--kind', 'finding', '--fault', 'tooling', '--severity', 'medium', '--deliverable', 'fix it');
      tasks('add', 'decline me', '--id', 'decline-me', '--kind', 'finding', '--fault', 'tooling', '--severity', 'low', '--deliverable', 'fix it');

      const result = await triage('1\n2\n3\nstale, superseded by later work\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 unreviewed finding(s) left');

      expect(tasks('show', 'promote-me').stdout).toContain('spec: demo-spec');
      expect(tasks('show', 'defer-me').stdout).toContain('spec: (retriage)');
      const declined = tasks('show', 'decline-me').stdout;
      expect(declined).toContain('reason: stale, superseded by later work');
    });
  });

  it('triage displays evidence and deliverable labelled, saying so explicitly when there is no proposed fix', async () => {
    await fixture(async ({ dir, triage }) => {
      // A finding with no deliverable can no longer be created via `add`
      // (the store predates that rule — 58 open tasks do exactly this, and
      // triage still has to display them), so this one is written directly.
      const storePath = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        storePath,
        `${JSON.stringify({ id: 'no-fix-yet', title: 'no fix yet', kind: 'finding', state: 'unreviewed', severity: 'high', system: null, spec: null, requires: [], files: [], deliverable: null, evidence: 'it breaks like this', source: null, reason: null, closed: null })}\n`,
        'utf8',
      );
      const result = await triage('s\n');
      expect(result.stdout).toContain('evidence — what is broken:');
      expect(result.stdout).toContain('it breaks like this');
      expect(result.stdout).toContain('deliverable — the proposed fix:');
      expect(result.stdout).toContain('no proposed fix recorded');
    });
  });

  it('triage shows a recorded deliverable next to its evidence', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'has a fix', '--id', 'has-a-fix', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--evidence', 'broken thing', '--deliverable', 'the proposed repair');
      const result = await triage('s\n');
      expect(result.stdout).toContain('the proposed repair');
      expect(result.stdout).not.toContain('no proposed fix recorded');
    });
  });

  it('printEvidence wraps long text onto multiple indented lines, instead of one unbroken line, for both evidence and deliverable', async () => {
    await fixture(async ({ tasks, triage }) => {
      const longText = "loadSave gives activeAction, player and activeBuffs no check past isObject, so a body whose ids are all real but whose cadences is absent crashes the validator that exists to prevent it.";
      tasks('add', 'checkSave crashes', '--id', 'checksave-crashes', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--evidence', longText, '--deliverable', longText);
      const result = await triage('s\n');
      expect(result.stdout).not.toContain(longText);

      const indented = result.stdout.split('\n').filter((line) => line.startsWith('          ') && line.trim().length > 0);
      expect(indented.length).toBeGreaterThan(2); // multiple wrapped lines each for evidence and deliverable
      for (const line of indented) expect(line.length).toBeLessThanOrEqual(78);
    });
  });

  it('triage redirect replaces the deliverable, saves it, then re-asks for a decision on the same task', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'wrong fix', '--id', 'wrong-fix', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'the wrong fix');
      const result = await triage('4\nthe right fix\n1\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('0 unreviewed finding(s) left');
      const shown = tasks('show', 'wrong-fix').stdout;
      expect(shown).toContain('deliverable: the right fix');
      expect(shown).toContain('spec: demo-spec');
    });
  });

  // Isolated from any later decision on purpose: every other redirect test
  // chains a subsequent promote whose own save persists the whole store,
  // including the deliverable redirect already changed in memory — so a
  // redirect that dropped its own save+record call would still pass every
  // one of them. Quitting right after the redirect, with nothing else
  // touching the store, is what actually proves redirect persists on its own.
  it('triage redirect alone — with no later decision — persists the deliverable and files the triage event by itself', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'wrong fix', '--id', 'wrong-fix-alone', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'the wrong fix');
      const result = await triage('4\nthe right fix\nq\n');
      expect(result.status).toBe(0);
      const shown = tasks('show', 'wrong-fix-alone').stdout;
      expect(shown).toContain('deliverable: the right fix');
      expect(shown).toContain('unreviewed');
      expect(tasks('log', '--op', 'triage').stdout).toContain('redirected the deliverable to: the right fix');
    });
  });

  it('triage redirect is cancelled by an empty response, leaving the deliverable and the queue unchanged', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'wrong fix', '--id', 'wrong-fix', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'original fix');
      const result = await triage('4\n\ns\n');
      expect(result.stdout).toContain('empty — redirect cancelled');
      expect(result.stdout).toContain('1 unreviewed finding(s) left');
      expect(tasks('show', 'wrong-fix').stdout).toContain('deliverable: original fix');
    });
  });

  it('triage quits early and leaves the rest unreviewed', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'first', '--id', 'first', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'fix it');
      tasks('add', 'second', '--id', 'second', '--kind', 'finding', '--fault', 'tooling', '--severity', 'low', '--deliverable', 'fix it');

      const result = await triage('q\n');
      expect(result.stdout).toContain('2 unreviewed finding(s) left');
      expect(tasks('show', 'first').stdout).toContain('unreviewed');
    });
  });

  it('triage [a] records a question on the finding and leaves it unreviewed', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'needs context', '--id', 'needs-context', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--evidence', 'the original evidence', '--deliverable', 'fix it');
      const result = await triage('a\nwhich universe was this measured against?\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('it stays unreviewed until the question is answered');
      expect(result.stdout).toContain('1 unreviewed finding(s) left');
      const shown = tasks('show', 'needs-context').stdout;
      expect(shown).toContain('the original evidence');
      expect(shown).toContain('triage asked');
      expect(shown).toContain('which universe was this measured against?');
    });
  });

  it('triage warns, naming the question, when a later session promotes a record that still carries a live question from an earlier one', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'needs context', '--id', 'needs-context', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'fix it');
      await triage('a\nwhich universe was this measured against?\n');
      const result = await triage('1\n');
      expect(result.stdout).toContain('warning: this record has a live, unanswered question');
      expect(result.stdout).toContain('which universe was this measured against?');
      expect(tasks('show', 'needs-context').stdout).toContain('spec: demo-spec');
    });
  });

  it('triage [a] with an empty question asks nothing and re-offers the same finding', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'needs context', '--id', 'needs-context', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--evidence', 'original', '--deliverable', 'fix it');
      const result = await triage('a\n\ns\n');
      expect(result.stdout).toContain('empty — nothing asked');
      expect(tasks('show', 'needs-context').stdout).not.toContain('triage asked');
    });
  });

  // In-process with its own globals rather than through the context's
  // helpers, because the branch this test is about is exactly the one the
  // fixture pins.
  //
  // A single open-member spec used to be promoted into silently — the store
  // route `a-branch-is-told-which-spec-it-owes` deleted. `promote` no longer
  // guesses even a lone candidate: it names it and skips, the same refusal
  // every caller now gets when the branch name does not answer.
  it("triage's promote refuses to guess a spec when the branch matches no spec file, naming the candidate", async () => {
    await fixture(async ({ tasks, dir }) => {
      tasks('add', 'fix-now anchor', '--id', 'anchor', '--spec', 'demo-spec');
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'fix it');
      const globals = ['--store', path.join(dir, 'tasks.jsonl'), '--systems', path.join(dir, 'systems.json'), '--specs-dir', path.join(dir, 'specs'), '--branch', 'orphaned-branch'];
      const result = await runInProcessAsync(['triage', ...globals], '1\n');
      expect(result.stdout).toContain('spec not given: no');
      expect(result.stdout).toContain('1 spec has open members — demo-spec');
      expect(result.stdout).toContain('no active spec to promote into — pass --spec, skipping');
      const shown = runInProcess(['show', 'a-finding', ...globals]);
      expect(shown.stdout).not.toContain('spec: demo-spec');
      expect(shown.stdout).toContain('[finding/unreviewed');
    });
  });

  it("triage's promote takes an explicitly given --spec on a branch the branch name cannot answer for", async () => {
    await fixture(async ({ tasks, dir }) => {
      tasks('add', 'a finding', '--id', 'a-finding', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'fix it');
      const globals = ['--store', path.join(dir, 'tasks.jsonl'), '--systems', path.join(dir, 'systems.json'), '--specs-dir', path.join(dir, 'specs'), '--branch', 'orphaned-branch'];
      await runInProcessAsync(['triage', ...globals, '--spec', 'demo-spec'], '1\n');
      const shown = runInProcess(['show', 'a-finding', ...globals]);
      expect(shown.stdout).toContain('spec: demo-spec');
    });
  });

  it('triage promotes a finding sourced from an audit pass 2 or later, saying that it extends the spec', async () => {
    await fixture(async ({ tasks, audit, triage }) => {
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'late finding', '--severity', 'low', '--fault', 'contract', '--deliverable', 'fix it', '--evidence', 'seen late');
      const result = await triage('1\n');
      expect(result.stdout).toContain('promoting a pass 2 finding, which extends what demo-spec owes');
      const shown = tasks('show', 'demo-spec-pass2-late-finding');
      expect(shown.stdout).toContain('spec: demo-spec');
    });
  });

  // A golden string, not one derived from TRIAGE_ACTIONS: deriving the
  // expectation from the same table the menu is rendered from would make
  // this tautological (it could never fail from a reorder, since it checks
  // the table against itself) — pass 1 caught exactly that shape of gap.
  it('the menu keeps its pre-refactor key order: promote, defer, decline, redirect, ask', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'menu check', '--id', 'menu-check', '--kind', 'finding', '--fault', 'tooling', '--severity', 'low', '--deliverable', 'fix it');
      const result = await triage('s\n');
      expect(result.stdout).toContain('[1] promote   [2] defer   [3] decline   [4] redirect   [a] ask   [s] skip   [q] save and quit');
    });
  });

  it('every action in the table names a `tasks` verb that actually exists, so a table entry with no route fails here', () => {
    fixture(({ tasks }) => {
      for (const action of TRIAGE_ACTIONS) {
        const result = tasks(action.verb, '--help');
        expect(result.status, `\`tasks ${action.verb} --help\` (the ${action.label} action's non-interactive route)`).toBe(0);
        expect(result.stdout).not.toContain('unknown command');
      }
    });
  });

  it('tasks defer opens a record outside every spec, the inverse of promote, filing the same wording the walk records', () => {
    fixture(({ tasks }) => {
      tasks('add', 'defer me', '--id', 'defer-me', '--kind', 'finding', '--fault', 'tooling', '--severity', 'medium', '--deliverable', 'fix it');
      const result = tasks('defer', 'defer-me');
      expect(result.status).toBe(0);
      expect(tasks('show', 'defer-me').stdout).toContain('spec: (retriage)');
      expect(tasks('log', '--op', 'triage').stdout).toContain('deferred: opened outside every spec');

      tasks('decline', 'defer-me', '--reason', 'closed for the refusal check');
      const refused = tasks('defer', 'defer-me');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('it does not reopen closed ones');
    });
  });

  it('tasks ask records the question on the finding, files a triage event, and leaves it unreviewed so the queue keeps offering it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'needs context', '--id', 'needs-context', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--evidence', 'the original evidence', '--deliverable', 'fix it');
      const result = tasks('ask', 'needs-context', '--question', 'which universe was this measured against?');
      expect(result.status).toBe(0);
      const shown = tasks('show', 'needs-context').stdout;
      expect(shown).toContain('unreviewed');
      expect(shown).toContain('the original evidence');
      expect(shown).toContain('triage asked');
      expect(shown).toContain('which universe was this measured against?');
      expect(tasks('log', '--op', 'triage').stdout).toContain('asked for more information: which universe was this measured against?');
    });
  });

  it('tasks ask refuses a closed record: a declined record is in no queue, so a question against it would land where nobody reads it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'closed already', '--id', 'closed-already', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'fix it');
      tasks('decline', 'closed-already', '--reason', 'closed for the refusal check');
      const refused = tasks('ask', 'closed-already', '--question', 'still relevant?');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('not unreviewed');
      const shown = tasks('show', 'closed-already').stdout;
      expect(shown).toContain('declined');
      expect(shown).not.toContain('triage asked');
    });
  });

  // The boundary pass 2 caught: `unreviewedQueue` re-offers only the
  // `unreviewed` state, not `open` too, so a deferred (open, spec-less)
  // record is exactly as unreachable by the queue as a closed one is.
  it('tasks ask refuses an open record too, not just a closed one — an already-open record is not in the review queue either', () => {
    fixture(({ tasks }) => {
      tasks('add', 'deferred already', '--id', 'deferred-already', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'fix it');
      tasks('defer', 'deferred-already');
      const refused = tasks('ask', 'deferred-already', '--question', 'still relevant?');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('not unreviewed');
      const shown = tasks('show', 'deferred-already').stdout;
      expect(shown).toContain('[finding/open/high]');
      expect(shown).not.toContain('triage asked');
    });
  });

  it("tasks redirect is the same operation as the walk's redirect: it files a triage event, not an edit one", () => {
    fixture(({ tasks }) => {
      tasks('add', 'wrong fix', '--id', 'wrong-fix', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'the wrong fix');
      const result = tasks('redirect', 'wrong-fix', '--deliverable', 'the right fix');
      expect(result.status).toBe(0);
      expect(tasks('show', 'wrong-fix').stdout).toContain('deliverable: the right fix');
      expect(tasks('log', '--op', 'triage').stdout).toContain('redirected the deliverable to: the right fix');
      expect(tasks('log', '--op', 'edit').stdout).not.toContain('wrong-fix');
    });
  });

  it('tasks redirect refuses a closed record, matching defer and promote rather than silently reopening it', () => {
    fixture(({ tasks }) => {
      tasks('add', 'closed fix', '--id', 'closed-fix', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'original fix');
      tasks('decline', 'closed-fix', '--reason', 'closed for the refusal check');
      const refused = tasks('redirect', 'closed-fix', '--deliverable', 'a new fix');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('it does not reopen a closed one');
      expect(tasks('show', 'closed-fix').stdout).toContain('deliverable: original fix');
    });
  });

  it('triage prompts read exactly as before the table refactor: "reason: ", "replacement deliverable: ", "question: "', async () => {
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'decline prompt', '--id', 'decline-prompt', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'fix it');
      const declined = await triage('3\na reason\n');
      expect(declined.stdout).toContain('reason: ');
    });
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'redirect prompt', '--id', 'redirect-prompt', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'fix it');
      const redirected = await triage('4\na new fix\n1\n');
      expect(redirected.stdout).toContain('replacement deliverable: ');
    });
    await fixture(async ({ tasks, triage }) => {
      tasks('add', 'ask prompt', '--id', 'ask-prompt', '--kind', 'finding', '--fault', 'tooling', '--severity', 'high', '--deliverable', 'fix it');
      const asked = await triage('a\na question\n');
      expect(asked.stdout).toContain('question: ');
    });
  });
});
