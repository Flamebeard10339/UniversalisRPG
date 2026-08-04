import { describe, expect, it } from 'vitest';
import { LEGS, runMergeReady, type BranchStanding, type MergeReadyDeps } from './mergeReady';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

// A branch that is ready: clean tree, base unmoved, every member closed, and
// a pass that graded every clause met.
const ready = (overrides: Partial<BranchStanding> = {}): BranchStanding => ({
  branch: 'a-branch',
  dirty: [],
  baseMoved: false,
  baseBranch: 'main',
  spec: 'a-spec',
  openMembers: [],
  unreviewedFindings: 0,
  outstandingClauses: [],
  auditPasses: 1,
  doctorWarnings: 0,
  ...overrides,
});

interface Recorded {
  lines: string[];
  commands: string[];
}

function deps(overrides: Partial<MergeReadyDeps> = {}): { deps: MergeReadyDeps; recorded: Recorded } {
  const recorded: Recorded = { lines: [], commands: [] };
  return {
    recorded,
    deps: {
      run: (command) => {
        recorded.commands.push(command);
        return { status: 0 };
      },
      trackedFiles: () => ['a.ts'],
      read: () => utf8('clean'),
      emit: (line) => recorded.lines.push(line),
      standing: () => ready(),
      ...overrides,
    },
  };
}

describe('runMergeReady', () => {
  it('runs every leg and reports success when all pass and the bytes are clean', () => {
    const { deps: d, recorded } = deps();
    expect(runMergeReady(d)).toBe(true);
    expect(recorded.commands).toEqual(LEGS.map((leg) => leg.command));
    expect(recorded.lines).toContain('merge-ready: every leg passed');
  });

  it('keeps running after a red leg — one answer per run, not one rerun per defect — and names what failed', () => {
    const { deps: d, recorded } = deps({
      run: (command) => {
        recorded.commands.push(command);
        return { status: command.includes('tsc') ? 2 : 0 };
      },
    });
    expect(runMergeReady(d)).toBe(false);
    expect(recorded.commands).toEqual(LEGS.map((leg) => leg.command));
    expect(recorded.lines.join('\n')).toContain('NOT merge-ready: tsc failed');
  });

  it('fails the bytes leg on a corrupt tracked file, naming it', () => {
    const { deps: d, recorded } = deps({
      trackedFiles: () => ['fine.ts', 'broken.ts'],
      read: (file) => (file === 'broken.ts' ? new Uint8Array([0]) : utf8('ok')),
    });
    expect(runMergeReady(d)).toBe(false);
    expect(recorded.lines.join('\n')).toContain('broken.ts: NUL byte at offset 0');
    expect(recorded.lines.join('\n')).toContain('bytes failed');
  });

  it('treats a null exit status as failure, not success', () => {
    const { deps: d } = deps({ run: () => ({ status: null }) });
    expect(runMergeReady(d)).toBe(false);
  });

  it('reports a tracked-file enumeration failure as a bytes-leg failure rather than a crash', () => {
    const { deps: d, recorded } = deps({
      trackedFiles: () => {
        throw new Error('git ls-files failed — cannot enumerate tracked files');
      },
    });
    expect(runMergeReady(d)).toBe(false);
    expect(recorded.lines.join('\n')).toContain('git ls-files failed');
  });
});

// The questions a merge turns on, which cost six manual reads across two
// tools while the gate passed every leg without answering one of them.
describe('runMergeReady, on this branch\'s standing', () => {
  const body = (overrides: Partial<BranchStanding>): string => {
    const { deps: d, recorded } = deps({ standing: () => ready(overrides) });
    runMergeReady(d);
    return recorded.lines.join('\n');
  };

  it('fails on main having moved, which is the one that bites and failed nothing', () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ baseMoved: true }) });
    expect(runMergeReady(d)).toBe(false);
    expect(recorded.lines.join('\n')).toContain('main has moved past the merge base');
    expect(recorded.lines.join('\n')).toContain('base           git merge main');
  });

  it('names the uncommitted paths a cleanup would discard the closes of', () => {
    expect(body({ dirty: ['docs/tasks.jsonl', 'src/a.ts'] })).toContain('2 uncommitted path(s): docs/tasks.jsonl, src/a.ts');
  });

  it('sends an open member to `tasks next` and an unreviewed finding to `tasks triage`', () => {
    expect(body({ openMembers: ['a-slice'] })).toContain('spec           npm run tasks -- next');
    expect(body({ unreviewedFindings: 2 })).toContain('spec           npm run tasks -- triage');
  });

  it('separates a clause nobody graded from a clause left outstanding', () => {
    expect(body({ auditPasses: 0 })).toContain('a-spec has no recorded audit pass');
    expect(body({ outstandingClauses: ['c2', 'c7'] })).toContain('2 outstanding after pass 1: c2, c7');
  });

  it('carries doctor\'s warning count into the summary without changing what fails', () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ doctorWarnings: 5 }) });
    expect(runMergeReady(d)).toBe(true);
    expect(recorded.lines.join('\n')).toContain('doctor         ok  pass — 5 warning(s) reported above, which do not fail this leg');
    expect(recorded.lines.join('\n')).toContain('merge-ready: every leg passed, with 5 doctor warning(s) that fail nothing');
  });

  it('ends a green run on the two commands that finish the branch', () => {
    const green = body({});
    expect(green).toContain('next: npm run tasks -- spec done a-spec');
    expect(green).toContain('then merge a-branch into main');
  });

  it('has nothing to say about a spec on a branch working none', () => {
    const none = body({ spec: null });
    expect(none).toContain('this branch is working no spec, so it owes no clause');
    expect(none).not.toContain('clauses  ');
  });
});
