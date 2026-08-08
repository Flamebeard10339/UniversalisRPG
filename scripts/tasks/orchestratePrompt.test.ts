import { describe, expect, it } from 'vitest';
import { fixture } from './cliFixtures';

// The fourth member of the family `work-prompt`, `audit-prompt` and
// `plan-prompt` already form — `run-an-orchestrator-over-three-parallel-
// tasks` c6, delivered here rather than on that branch because the brief is
// downstream of what the run learned. Unlike the other three it takes no
// required argument: an orchestrator is not working one spec.
describe('tasks orchestrate-prompt', () => {
  it('exists and prints a brief with no spec named on the command line', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You are orchestrating on branch demo-spec.');
      expect(result.stdout).toContain('No spec named on the command line');
      expect(result.stdout).toContain('npm run tasks -- roadmap');
    }));

  it('prints the clause standing of every spec named on the command line', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Standing of the named spec(s):');
      expect(result.stdout).toContain('demo-spec: 2 clause(s)');
    }));

  it('reports an unknown spec by name rather than refusing the whole brief', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt', 'not-a-real-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no such spec: not-a-real-spec');
      // A brief that refuses outright over one bad slug would lose the
      // orchestrator's own lessons along with it.
      expect(result.stdout).toContain("The orchestrator's lessons");
    }));

  it('refuses --help as any other command would, rather than being unreachable through the sweep', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt', '--help');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('usage: tasks orchestrate-prompt');
    }));
});

// briefs-carry-the-lessons c4: the orchestrator's own six instructions,
// observed rather than imagined during the 2026-08-06 run. Each is its own
// test naming the literal text, not a loop over `ORCHESTRATOR_LESSONS`
// itself — a loop over the array under test would still pass with the array
// emptied.
describe('orchestrate-prompt carries the lessons the run observed', () => {
  it('carries the decision-placement rule as a test with a criterion, and names where an escalation goes', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt');
      expect(result.stdout).toContain('Place a decision where it will not be re-decided; the test is durability, not who is busy.');
      // The prohibition it replaced said only where not to decide. A
      // destination is what makes the alternative to deciding reachable.
      expect(result.stdout).toContain('--decider planner|author');
      expect(result.stdout).toContain('A decision made in the wrong place gets re-decided, and the re-decision is the cost.');
    }));

  it('carries the ruling-is-a-contract-too rule', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt');
      expect(result.stdout).toContain('A ruling is a contract too, and gets less review than a clause.');
    }));

  it('carries the verify-do-not-grade rule', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt');
      expect(result.stdout).toContain('Verify what a report claims; do not grade the report.');
      expect(result.stdout).toContain('Confirm a mutation actually applied before believing the test result it reports.');
    }));

  it("carries the file-on-the-worker's-branch rule", () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt');
      expect(result.stdout).toContain("File a record on the worker's branch, not the orchestrator's.");
      expect(result.stdout).toContain('never hand a worker an id it cannot resolve in its own store');
      expect(result.stdout).toContain('describe it in prose instead');
    }));

  it('carries the scratch-filename-prefix rule', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt');
      expect(result.stdout).toContain('Give every dispatched agent a scratch filename prefix.');
    }));

  it('carries the do-not-tune-mid-run rule', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt');
      expect(result.stdout).toContain('Do not tune the brief mid-run if the rates it produces are meant to be comparable.');
    }));
});

// c5, checked for orchestrate-prompt: the same "instructions, not incidents"
// check workPrompt.test.ts makes for the worker's lessons. A property proven
// for one member of the family is not proven for the rest of it — this is
// what would have let three of four briefs reacquire narrative text
// silently.
describe('orchestrate-prompt prints instructions, not the incidents that motivated them', () => {
  it('never prints the narrative evidence behind an orchestrator lesson', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt');
      expect(result.stdout).not.toContain('reported as verified');
      expect(result.stdout).not.toContain('two auditors');
      expect(result.stdout).not.toContain("overwrote each other's mutation manifests");
    }));
});
