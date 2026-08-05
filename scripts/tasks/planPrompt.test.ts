import { describe, expect, it } from 'vitest';
import { fixture } from './cliFixtures';

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
    fixture(({ tasks }) => {
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
    fixture(({ tasks }) => {
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

  it('ends with the decompose/plan/dispatch sequence, naming the next commands', () =>
    fixture(({ tasks }) => {
      const result = tasks('plan-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('3. Decompose into tasks whose `--writes` regions are disjoint');
      expect(result.stdout).toContain('4. `tasks plan` grades the set');
      expect(result.stdout).toContain('5. Dispatch a worker with one instruction: run `npm run tasks -- work-prompt <id>` and do what it says.');
    }));
});
