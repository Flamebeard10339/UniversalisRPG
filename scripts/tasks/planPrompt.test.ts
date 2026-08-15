import { describe, expect, it } from 'vitest';
import { enclosingGitFixture, fixture } from './cliFixtures';

// `plan-prompt` is the planner's brief, symmetric with `work-prompt` and
// `audit-prompt`: it runs step 1's survey rather than listing the commands
// and trusting anyone to remember them. What these prove is the wiring —
// that the survey the brief runs is the same one `tasks where` answers, and
// that the brief refuses nothing, states the clause format literally, and
// ends with the decompose/plan/dispatch sequence. The survey's own logic
// (rulings, prior art, ownership) is unit-tested in `lib/producers.test.ts`
// and against `tasks where` in `architectureCmds.test.ts`.
describe('tasks plan-prompt', () => {
  it('refuses with usage when given no slug', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('usage: tasks plan-prompt');
    }));

  it('names the branch and says a spec file does not exist yet, rather than refusing', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'not-yet-a-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You are planning not-yet-a-spec on branch demo-spec.');
      expect(result.stdout).toContain('No spec file yet at');
    }));

  it('reports an existing spec\'s clause count and standing', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('already exists — 2 proof clause(s) recorded');
    }));

  it('says outright that no path was named, rather than silently skipping the survey', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No paths were named on this command line');
      expect(result.stdout).not.toContain('---');
    }));

  // This is the wiring the whole task exists for: the same survey `tasks
  // where` runs, reached without a planner having to type the command.
  it('runs the same survey `tasks where` answers, for every path named on the command line', () =>
    enclosingGitFixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec', 'src/runtime/save.ts', 'src/ui');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--- src/runtime/save.ts ---');
      expect(result.stdout).toContain('system:   Runtime');
      expect(result.stdout).toContain('--- src/ui ---');
      expect(result.stdout).toContain('system:   UI');
    }));

  // The motivating gap this whole spec exists to close: a ruling sitting in
  // a declined record's reason, invisible to a survey that only reads
  // writes/files. If plan-prompt's per-path survey did not carry rulings
  // through, a planner reading only this brief would still miss it.
  it('surfaces a ruling on a named path, not only the claims on it', () =>
    enclosingGitFixture(({ tasks }) => {
      tasks('add', 'shrink the save test', '--id', 'save-test-shrink', '--spec', 'demo-spec');
      tasks('decline', 'save-test-shrink', '--reason', 'save.test.ts is 16s of a 25s wall, and shrinking it further means faking the subprocess it tests');

      const result = tasks('plan-prompt', 'demo-spec', 'src/runtime/save.test.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('rulings on src/runtime/save.test.ts:');
      expect(result.stdout).toContain('[ruling] save-test-shrink (declined) reason —');
    }));

  it('states the clause format literally as a `- [cN]` bullet under `Proof:`', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Proof:');
      expect(result.stdout).toContain('- [c1] a checkable clause');
      expect(result.stdout).toContain('--discharges');
    }));

  it('ends with the register/plan/dispatch sequence, naming the next commands', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('3. Register the spec as its own single member');
      expect(result.stdout).toContain('4. `tasks plan` grades the open specs against each other');
      expect(result.stdout).toContain('5. Dispatch a worker with one instruction: run `npm run tasks -- work-prompt <id>` and do what it says.');
    }));

  // The clauses leg of `merge-ready` reads `discharges`, and a member that
  // discharges none passes it on nothing — so the brief has to say "every".
  it('tells the planner to discharge every clause on that one member', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.stdout).toContain('naming EVERY clause the spec has');
      expect(result.stdout).not.toContain('Decompose into tasks');
    }));

  it('requires a proof target on every clause, and a derived proof under a universal one', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.stdout).toContain('Every clause carries a `proof:` target');
      expect(result.stdout).toContain('derives its own subjects');
    }));
});

// briefs-carry-the-lessons c3: the four planner instructions the
// 2026-08-06 orchestrated run's contract-fault records paid for. Each is its
// own test naming the literal text, not a loop over `PLANNER_LESSONS` itself
// — a loop over the array under test would still pass with the array
// emptied.
describe('plan-prompt carries the lessons a prior run paid for', () => {
  it('carries the state-the-invariant rule', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.stdout).toContain('State the invariant.');
      expect(result.stdout).toContain('Offer instances as illustration, never as extent.');
    }));

  it('carries the guard-placement rule', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.stdout).toContain('When a clause requires a guard, name the point at which it must act.');
      expect(result.stdout).toContain('Enforce where a value is assembled, not where it is read.');
    }));

  it('carries the who-else-computes-this rule', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.stdout).toContain('Ask who else computes this answer.');
    }));

  it('carries the name-what-the-worker-may-decide rule', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.stdout).toContain('Name what the worker may decide.');
      expect(result.stdout).toContain('## Open questions');
    }));
});

// c5, checked for plan-prompt: the same "instructions, not incidents" check
// workPrompt.test.ts makes for the worker's lessons. A property proven for
// one member of the family is not proven for the rest of it — this is what
// would have let three of four briefs reacquire narrative text silently.
describe('plan-prompt prints instructions, not the incidents that motivated them', () => {
  it('never prints the narrative evidence behind a planner lesson', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.stdout).not.toContain('four call sites');
      expect(result.stdout).not.toContain('a-branch-knows-which-spec-it-owes');
      expect(result.stdout).not.toContain('HIGH findings');
    }));
});
