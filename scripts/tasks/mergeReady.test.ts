import { describe, expect, it } from 'vitest';
import { allUsages } from './commands';
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
  // The verdict as well as the text. Asserting only on the detail string let
  // a leg stop failing while the suite stayed green — the very failure clause
  // 11 exists to fix ("the one that bites in practice fails nothing"),
  // reintroduced one level up. Mutation-verified: `ok: standing.dirty.length
  // === 0` and `ok: clausesOk` both survived at whole-suite scope before this.
  const graded = (overrides: Partial<BranchStanding>): { ok: boolean; body: string } => {
    const { deps: d, recorded } = deps({ standing: () => ready(overrides) });
    const ok = runMergeReady(d);
    return { ok, body: recorded.lines.join('\n') };
  };
  const body = (overrides: Partial<BranchStanding>): string => graded(overrides).body;

  it('fails on main having moved, which is the one that bites and failed nothing', () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ baseMoved: true }) });
    expect(runMergeReady(d)).toBe(false);
    expect(recorded.lines.join('\n')).toContain('main has moved past the merge base');
    expect(recorded.lines.join('\n')).toContain('base           git merge main');
  });

  it('fails on a dirty tree, naming the paths a cleanup would discard the closes of', () => {
    const { ok, body: lines } = graded({ dirty: ['docs/tasks.jsonl', 'src/a.ts'] });
    expect(ok).toBe(false);
    expect(lines).toContain('2 uncommitted path(s): docs/tasks.jsonl, src/a.ts');
  });

  it('fails on an unclosed spec, sending an open member to `tasks next` and an unreviewed finding to `tasks triage`', () => {
    const open = graded({ openMembers: ['a-slice'] });
    expect(open.ok).toBe(false);
    expect(open.body).toContain('spec           npm run tasks -- next');

    const untriaged = graded({ unreviewedFindings: 2 });
    expect(untriaged.ok).toBe(false);
    expect(untriaged.body).toContain('spec           npm run tasks -- triage');
  });

  it('fails on an outstanding clause, and separates one nobody graded from one left unmet', () => {
    const ungraded = graded({ auditPasses: 0 });
    expect(ungraded.ok).toBe(false);
    expect(ungraded.body).toContain('a-spec has no recorded audit pass');

    const outstanding = graded({ outstandingClauses: ['c2', 'c7'] });
    expect(outstanding.ok).toBe(false);
    expect(outstanding.body).toContain('2 outstanding after pass 1: c2, c7');
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

// A leg that names its next move is only useful if the move is real, and a
// verb renamed out from under one of these strings would be invisible: the
// leg still prints, the caller still runs it, and the CLI answers "unknown
// command". Checked against the verb list the CLI itself resolves against.
describe('the commands the legs name', () => {
  const verbs = new Set(allUsages().map((usage) => /^usage: tasks (?:spec )?([a-z-]+)/.exec(usage)?.[1]).filter((verb): verb is string => verb !== undefined));

  it('names only verbs the CLI actually has', () => {
    const nexts: string[] = [];
    for (const overrides of [{ dirty: ['a.ts'] }, { baseMoved: true }, { openMembers: ['x'] }, { unreviewedFindings: 1 }, { auditPasses: 0 }, { outstandingClauses: ['c1'] }, {}]) {
      const { deps: d, recorded } = deps({ standing: () => ready(overrides) });
      runMergeReady(d);
      nexts.push(...recorded.lines);
    }
    const named = [...new Set(nexts.flatMap((line) => [...line.matchAll(/npm run tasks -- ([a-z-]+)( [a-z-]+)?/g)].map((match) => match[1])))];
    expect(named.length).toBeGreaterThan(0);
    for (const verb of named) expect(verbs).toContain(verb);
  });
});
