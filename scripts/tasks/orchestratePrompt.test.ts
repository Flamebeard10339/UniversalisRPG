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
  it('carries the buffer-not-decision-maker rule', () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt');
      expect(result.stdout).toContain('The orchestrator is a buffer, not a decision-maker.');
      expect(result.stdout).toContain('Route a design question you could answer yourself to a planning session anyway');
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

  it("carries the orchestrator's-records-are-invisible rule", () =>
    fixture(({ tasks }) => {
      const result = tasks('orchestrate-prompt');
      expect(result.stdout).toContain("The orchestrator's own records are invisible to its workers.");
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
