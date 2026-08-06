import { describe, expect, it } from 'vitest';
import type { State, Task } from '../lib/taskStore';
import { allUsages } from './commands';
import { authoredAsPlan, decideSpec, LEGS, runMergeReady, specToGrade, type BranchStanding, type MergeReadyDeps, type SpecCandidate, type SpecFacts } from './mergeReady';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

// A branch that is ready: clean tree, base unmoved, every member closed, and
// a pass that graded every clause met.
const ready = (overrides: Partial<BranchStanding> = {}): BranchStanding => ({
  branch: 'a-branch',
  dirty: [],
  baseMoved: false,
  baseBranch: 'main',
  spec: 'a-spec',
  specNote: null,
  specAuthoredHere: false,
  openMembers: [],
  unreviewedFindings: 0,
  outstandingClauses: [],
  deferredClauses: [],
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
      run: async (command) => {
        recorded.commands.push(command);
        return { status: 0, output: '' };
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
  it('runs every leg and reports success when all pass and the bytes are clean', async () => {
    const { deps: d, recorded } = deps();
    expect(await runMergeReady(d)).toBe(true);
    expect(recorded.commands).toEqual(LEGS.map((leg) => leg.command));
    expect(recorded.lines).toContain('merge-ready: every leg passed');
  });

  it('keeps running after a red leg — one answer per run, not one rerun per defect — and names what failed', async () => {
    const { deps: d, recorded } = deps({
      run: async (command) => {
        recorded.commands.push(command);
        return { status: command.includes('tsc') ? 2 : 0, output: '' };
      },
    });
    expect(await runMergeReady(d)).toBe(false);
    expect(recorded.commands).toEqual(LEGS.map((leg) => leg.command));
    expect(recorded.lines.join('\n')).toContain('NOT merge-ready: tsc failed');
  });

  it('starts every leg before any has answered, and still reports them in declaration order', async () => {
    // Held-open promises: nothing resolves until every leg has been started,
    // which is the concurrency claim itself.
    const resolvers: ((outcome: { status: number | null; output: string }) => void)[] = [];
    const { deps: d, recorded } = deps({
      run: (command) => {
        recorded.commands.push(command);
        return new Promise((resolve) => resolvers.push(resolve));
      },
    });
    const verdict = runMergeReady(d);
    expect(recorded.commands).toEqual(LEGS.map((leg) => leg.command));
    for (const [index, resolve] of [...resolvers.entries()].reverse()) resolve({ status: 0, output: `finished ${LEGS[index].name}` });
    expect(await verdict).toBe(true);
    const outputs = recorded.lines.filter((line) => line.startsWith('finished '));
    expect(outputs).toEqual(LEGS.map((leg) => `finished ${leg.name}`));
  });

  it('every leg is reported, in declaration order, whatever order they finish in', async () => {
    const resolvers: ((outcome: { status: number | null; output: string }) => void)[] = [];
    const { deps: d, recorded } = deps({ run: () => new Promise((resolve) => resolvers.push(resolve)) });
    const verdict = runMergeReady(d);
    for (const resolve of [...resolvers].reverse()) resolve({ status: 0, output: '' });
    expect(await verdict).toBe(true);
    const rows = recorded.lines.filter((line) => /^ {2}\S.*(?: ok {2}| FAIL {2})/.test(line));
    expect(rows.slice(0, LEGS.length).map((row) => row.trimStart().split(/ {2,}/)[0])).toEqual(LEGS.map((leg) => leg.name));
  });

  it('one red leg among green ones still fails the gate and names only itself', async () => {
    const { deps: d, recorded } = deps({
      run: async (command) => ({ status: command.includes('layer-check') ? 1 : 0, output: '' }),
    });
    expect(await runMergeReady(d)).toBe(false);
    expect(recorded.lines).toContain('NOT merge-ready: layer-check failed');
  });

  it('fails the bytes leg on a corrupt tracked file, naming it', async () => {
    const { deps: d, recorded } = deps({
      trackedFiles: () => ['fine.ts', 'broken.ts'],
      read: (file) => (file === 'broken.ts' ? new Uint8Array([0]) : utf8('ok')),
    });
    expect(await runMergeReady(d)).toBe(false);
    expect(recorded.lines.join('\n')).toContain('broken.ts: NUL byte at offset 0');
    expect(recorded.lines.join('\n')).toContain('bytes failed');
  });

  it('treats a null exit status as failure, not success', async () => {
    const { deps: d } = deps({ run: async () => ({ status: null, output: '' }) });
    expect(await runMergeReady(d)).toBe(false);
  });

  it('reports a tracked-file enumeration failure as a bytes-leg failure rather than a crash', async () => {
    const { deps: d, recorded } = deps({
      trackedFiles: () => {
        throw new Error('git ls-files failed — cannot enumerate tracked files');
      },
    });
    expect(await runMergeReady(d)).toBe(false);
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
  const graded = async (overrides: Partial<BranchStanding>): Promise<{ ok: boolean; body: string }> => {
    const { deps: d, recorded } = deps({ standing: () => ready(overrides) });
    const ok = await runMergeReady(d);
    return { ok, body: recorded.lines.join('\n') };
  };
  const body = async (overrides: Partial<BranchStanding>): Promise<string> => (await graded(overrides)).body;

  it('fails on main having moved, which is the one that bites and failed nothing', async () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ baseMoved: true }) });
    expect(await runMergeReady(d)).toBe(false);
    expect(recorded.lines.join('\n')).toContain('main has moved past the merge base');
    expect(recorded.lines.join('\n')).toContain('base           git merge main');
  });

  it('fails on a dirty tree, naming the paths a cleanup would discard the closes of', async () => {
    const { ok, body: lines } = await graded({ dirty: ['docs/tasks.jsonl', 'src/a.ts'] });
    expect(ok).toBe(false);
    expect(lines).toContain('2 uncommitted path(s): docs/tasks.jsonl, src/a.ts');
  });

  it('fails on an unclosed spec, sending an open member to `tasks next` and an unreviewed finding to `tasks triage`', async () => {
    const open = await graded({ openMembers: ['a-slice'] });
    expect(open.ok).toBe(false);
    expect(open.body).toContain('spec           npm run tasks -- next');

    const untriaged = await graded({ unreviewedFindings: 2 });
    expect(untriaged.ok).toBe(false);
    expect(untriaged.body).toContain('spec           npm run tasks -- triage');
  });

  it('fails on an outstanding clause, and separates one nobody graded from one left unmet', async () => {
    const ungraded = await graded({ auditPasses: 0 });
    expect(ungraded.ok).toBe(false);
    expect(ungraded.body).toContain('a-spec has no recorded audit pass');

    const outstanding = await graded({ outstandingClauses: ['c2', 'c7'] });
    expect(outstanding.ok).toBe(false);
    expect(outstanding.body).toContain('2 outstanding after pass 1: c2, c7');
  });

  // c7: a branch that deferred its way to green says so in the same line
  // that says green, rather than the clauses leg passing silently.
  it('passes the clauses leg on a deferred clause, and names it in the same line that says pass', async () => {
    const deferred = await graded({ deferredClauses: ['c3'] });
    expect(deferred.ok).toBe(true);
    expect(deferred.body).toContain('clauses        ok  pass — the latest of 1 pass(es) leaves no clause outstanding; deferred: c3');
  });

  it('names a deferred clause beside a real outstanding one, on a failing run', async () => {
    const both = await graded({ outstandingClauses: ['c2'], deferredClauses: ['c3'] });
    expect(both.ok).toBe(false);
    expect(both.body).toContain('1 outstanding after pass 1: c2; deferred: c3');
  });

  it('carries doctor\'s warning count into the summary without changing what fails', async () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ doctorWarnings: 5 }) });
    expect(await runMergeReady(d)).toBe(true);
    expect(recorded.lines.join('\n')).toContain('doctor         ok  pass — 5 warning(s) reported above, which do not fail this leg');
    expect(recorded.lines.join('\n')).toContain('merge-ready: every leg passed, with 5 doctor warning(s) that fail nothing');
  });

  it('ends a green run on the two commands that finish the branch', async () => {
    const green = await body({});
    expect(green).toContain('next: npm run tasks -- spec done a-spec');
    expect(green).toContain('then merge a-branch into main');
  });

  it('has nothing to say about a spec on a branch working none', async () => {
    const none = await body({ spec: null });
    expect(none).toContain('this branch is working no spec, so it owes no clause');
    expect(none).not.toContain('clauses  ');
  });

  // The planning branch: `audit-session-timing` shipped its own deliverable
  // and wrote two specs for branches that had not started, and the gate read
  // both as debts — "3 open members" and "no recorded audit pass", each true
  // and neither a defect.
  it('passes the spec and clauses legs for a branch that wrote its spec as a plan for a later branch', async () => {
    const { ok, body: lines } = await graded({ specAuthoredHere: true, openMembers: ['m1', 'm2', 'm3'], auditPasses: 0 });
    expect(ok).toBe(true);
    expect(lines).toContain('wrote a-spec as a plan for a later branch and worked none of its 3 member(s)');
    // The clauses leg is gone rather than passing quietly, the way it is for
    // a branch working no spec at all.
    expect(lines).not.toContain('has no recorded audit pass');
    // And no `spec done`: closing a plan the moment it is written is the one
    // move a green run must not name here.
    expect(lines).not.toContain('spec done a-spec');
  });
});

// The spec the gate graded, named on its own line — without it a reader
// cannot see the gate grading a spec they did not mean, which is how the
// wrong-spec pass below stayed invisible.
describe('the spec merge-ready says it graded', () => {
  it('reports the route to the spec it is about to grade', async () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ specNote: 'spec inferred from the event log: a-spec' }) });
    await runMergeReady(d);
    expect(recorded.lines.join('\n')).toContain('spec source    ok  spec inferred from the event log: a-spec');
  });

  it('says a plan was the only spec graded, so a green run cannot be read as covering another', async () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ specAuthoredHere: true, openMembers: ['m1'], auditPasses: 0 }) });
    await runMergeReady(d);
    expect(recorded.lines.join('\n')).toContain('No other spec was graded');
  });
});

describe('specToGrade', () => {
  const plan = (spec: string): SpecCandidate => ({ spec, authoredAsPlan: true });
  const owed = (spec: string): SpecCandidate => ({ spec, authoredAsPlan: false });

  // The regression this exists to stop: `resolveActiveSpec` takes the most
  // recently written spec, planning happens last, so a branch that
  // implemented `real-work` and then wrote `plan-for-later` resolved to the
  // plan — which owes nothing — and the gate printed "every leg passed" with
  // `real-work` never named and never graded.
  it('grades a spec the branch owes ahead of a plan it merely wrote, however recent the plan', () => {
    expect(specToGrade([plan('plan-for-later'), owed('real-work')])?.spec).toBe('real-work');
  });

  it('leaves an ordinary branch and a planning branch exactly as they were', () => {
    // One spec, owed: the overwhelming majority, and untouched.
    expect(specToGrade([owed('a-spec')])?.spec).toBe('a-spec');
    // Every candidate a plan — the planning branch this spec serves, which
    // carries no spec of its own. It still passes as a plan.
    expect(specToGrade([plan('later-a'), plan('later-b')])).toEqual(plan('later-a'));
    // Most recent first, so the first owed spec wins among several.
    expect(specToGrade([plan('p'), owed('newer'), owed('older')])?.spec).toBe('newer');
    expect(specToGrade([])).toBe(null);
  });
});

// The glue between git, the store and the decision, which `branchStanding`
// held inline where nothing could call it: inverting the flag's polarity left
// the whole file green and `tsc` clean.
describe('decideSpec', () => {
  const facts = (overrides: Partial<SpecFacts> = {}): SpecFacts => ({ activeSpec: 'a-spec', activeNote: 'inferred from the branch name', written: ['a-spec'], isPlan: () => false, ...overrides });

  it('grades what the resume aid answered, and keeps its note, when that spec is owed', () => {
    expect(decideSpec(facts())).toEqual({ spec: 'a-spec', specNote: 'inferred from the branch name', specAuthoredHere: false });
  });

  it('passes a plan through as a plan when the branch owes nothing else', () => {
    const decision = decideSpec(facts({ activeSpec: 'later', written: ['later'], isPlan: () => true }));
    expect(decision).toEqual({ spec: 'later', specNote: 'inferred from the branch name', specAuthoredHere: true });
  });

  // The regression: the log route takes the most recent write and planning
  // happens last, so `real-work` went ungraded behind `plan-for-later` and
  // the gate printed "every leg passed".
  it('steps past a plan to the spec the branch owes, and says it did', () => {
    const decision = decideSpec(facts({ activeSpec: 'plan-for-later', written: ['plan-for-later', 'real-work'], isPlan: (spec) => spec === 'plan-for-later' }));
    expect(decision.spec).toBe('real-work');
    expect(decision.specAuthoredHere).toBe(false);
    expect(decision.specNote).toContain('spec chosen by the gate: real-work');
    expect(decision.specNote).toContain('plan-for-later is a plan this branch wrote');
  });

  it('has no spec to grade when the resume aid found none', () => {
    expect(decideSpec(facts({ activeSpec: null, written: ['written-anyway'] }))).toEqual({ spec: null, specNote: null, specAuthoredHere: false });
  });
});

describe('authoredAsPlan', () => {
  const member = (state: State): Task => ({ state }) as Task;

  it('reads a spec as a plan only when this branch wrote it and worked none of its members', () => {
    expect(authoredAsPlan([member('open'), member('open')], false)).toBe(true);

    // Git could not be asked — an unresolvable base ref, no repository. The
    // exemption must not widen when the evidence for it disappears.
    expect(authoredAsPlan([member('open'), member('open')], null)).toBe(false);

    // A spec the base branch already carries is somebody else's plan, picked
    // up rather than written — this branch owes it.
    expect(authoredAsPlan([member('open'), member('open')], true)).toBe(false);

    // One member worked here is work done against the spec, and every other
    // state says the same: the branch is implementing, not planning.
    for (const state of ['in-progress', 'done', 'declined', 'unreviewed'] as State[]) {
      expect(authoredAsPlan([member('open'), member(state)], false)).toBe(false);
    }

    // A spec file authored and never decomposed promised a later branch
    // nothing, so it keeps owing its clauses.
    expect(authoredAsPlan([], false)).toBe(false);
  });
});

// A leg that names its next move is only useful if the move is real, and a
// verb renamed out from under one of these strings would be invisible: the
// leg still prints, the caller still runs it, and the CLI answers "unknown
// command". Checked against the verb list the CLI itself resolves against.
describe('the commands the legs name', () => {
  const verbs = new Set(allUsages().map((usage) => /^usage: tasks (?:spec )?([a-z-]+)/.exec(usage)?.[1]).filter((verb): verb is string => verb !== undefined));

  it('names only verbs the CLI actually has', async () => {
    const nexts: string[] = [];
    for (const overrides of [{ dirty: ['a.ts'] }, { baseMoved: true }, { openMembers: ['x'] }, { unreviewedFindings: 1 }, { auditPasses: 0 }, { outstandingClauses: ['c1'] }, {}]) {
      const { deps: d, recorded } = deps({ standing: () => ready(overrides) });
      await runMergeReady(d);
      nexts.push(...recorded.lines);
    }
    const named = [...new Set(nexts.flatMap((line) => [...line.matchAll(/npm run tasks -- ([a-z-]+)( [a-z-]+)?/g)].map((match) => match[1])))];
    expect(named.length).toBeGreaterThan(0);
    for (const verb of named) expect(verbs).toContain(verb);
  });
});
