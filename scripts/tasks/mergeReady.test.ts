import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { TaskEvent } from '../lib/eventLog';
import * as git from '../lib/git';
import type { ProofClause } from '../lib/specDoc';
import type { State, Task } from '../lib/taskStore';
import { allUsages } from './commands';
import type { Config } from './context';
import { installDataGit } from './cliFixtures';
import { realGitRepo } from './realGitFixture';
import {
  authoredAsPlan,
  branchStanding,
  branchWorkedOnMembers,
  changedFiles,
  decideSpec,
  diffTouchesRegion,
  headAddsClauseId,
  LEGS,
  runMergeReady,
  specAddsClauseId,
  specToGrade,
  type BranchStanding,
  type MergeReadyDeps,
  type SpecCandidate,
  type SpecFacts,
} from './mergeReady';

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
  declinedClauses: [],
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

  // c7: the printed command carries the spec it already knows — `next` and
  // `triage` both refuse without one now, so a suggestion that omitted it
  // would send a reader straight into that refusal.
  it('fails on an unclosed spec, sending an open member to `tasks next --spec` and an unreviewed finding to `tasks triage --spec`', async () => {
    const open = await graded({ openMembers: ['a-slice'] });
    expect(open.ok).toBe(false);
    expect(open.body).toContain('spec           npm run tasks -- next --spec a-spec');

    const untriaged = await graded({ unreviewedFindings: 2 });
    expect(untriaged.ok).toBe(false);
    expect(untriaged.body).toContain('spec           npm run tasks -- triage --spec a-spec');
  });

  it('fails on an outstanding clause, and separates one nobody graded from one left unmet', async () => {
    const ungraded = await graded({ auditPasses: 0 });
    expect(ungraded.ok).toBe(false);
    expect(ungraded.body).toContain('a-spec has no recorded audit pass');

    const outstanding = await graded({ outstandingClauses: ['c2', 'c7'] });
    expect(outstanding.ok).toBe(false);
    expect(outstanding.body).toContain('2 outstanding across 1 pass(es): c2, c7');
    // c7 (this spec's): the clauses leg's own next-step carries the spec it
    // already knows, the same fix as the spec leg above.
    expect(outstanding.body).toContain('clauses        npm run tasks -- next --spec a-spec');
  });

  // c7: a branch that deferred its way to green says so in the same line
  // that says green, rather than the clauses leg passing silently.
  it('passes the clauses leg on a deferred clause, and names it in the same line that says pass', async () => {
    const deferred = await graded({ deferredClauses: ['c3'] });
    expect(deferred.ok).toBe(true);
    expect(deferred.body).toContain('clauses        ok  pass — 1 pass(es) recorded, no clause outstanding; deferred: c3');
  });

  it('names a deferred clause beside a real outstanding one, on a failing run', async () => {
    const both = await graded({ outstandingClauses: ['c2'], deferredClauses: ['c3'] });
    expect(both.ok).toBe(false);
    expect(both.body).toContain('1 outstanding across 1 pass(es): c2; deferred: c3');
  });

  it('passes the clauses leg on a declined clause, and names it distinctly from a real outstanding one', async () => {
    const declined = await graded({ declinedClauses: ['c5'] });
    expect(declined.ok).toBe(true);
    expect(declined.body).toContain('clauses        ok  pass — 1 pass(es) recorded, no clause outstanding; declined: c5');
  });

  it('names a declined clause beside a real outstanding one, on a failing run', async () => {
    const both = await graded({ outstandingClauses: ['c2'], declinedClauses: ['c5'] });
    expect(both.ok).toBe(false);
    expect(both.body).toContain('1 outstanding across 1 pass(es): c2; declined: c5');
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
  const facts = (overrides: Partial<SpecFacts> = {}): SpecFacts => ({
    activeSpec: 'a-spec',
    activeNote: 'inferred from the branch name',
    written: ['a-spec'],
    isPlan: () => false,
    touchedWriteRegion: () => true,
    ...overrides,
  });

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

  // c4: a branch that offers many candidates pays for a wrong classification
  // once, on the spec it was wrong about — not by losing the real debt behind
  // it. `plan-for-later` here is misclassified as owed (should have read as a
  // plan); the genuinely owed `real-work` right behind it is still graded
  // correctly, and exactly one spec comes back either way.
  it('a single wrong classification costs only that spec, not the one behind it', () => {
    const decision = decideSpec(facts({ activeSpec: 'plan-for-later', written: ['plan-for-later', 'real-work'], isPlan: () => false }));
    expect(decision.spec).toBe('plan-for-later');
    expect(decision.specAuthoredHere).toBe(false);

    const corrected = decideSpec(facts({ activeSpec: 'plan-for-later', written: ['plan-for-later', 'real-work'], isPlan: (spec) => spec === 'plan-for-later' }));
    expect(corrected.spec).toBe('real-work');
  });

  // c7: a spec this branch's diff never touched is dropped before it can be
  // graded as either a plan or a debt — recording a note against it is not
  // work against it, however open its members are.
  it('drops a spec this branch never touched, and grades nothing else it has', () => {
    expect(decideSpec(facts({ activeSpec: 'noted-only', written: ['noted-only'], touchedWriteRegion: () => false }))).toEqual({ spec: null, specNote: null, specAuthoredHere: false });
  });

  it('steps past an untouched spec to one the branch actually worked, and says which', () => {
    const decision = decideSpec(
      facts({
        activeSpec: 'noted-only',
        written: ['noted-only', 'real-work'],
        touchedWriteRegion: (spec) => spec !== 'noted-only',
      }),
    );
    expect(decision.spec).toBe('real-work');
  });

  // c5: the reason a candidate was skipped is stated, and an untouched spec
  // is not reported as a plan this branch wrote — the two are different
  // facts and the note must not blur them.
  it('names the untouched reason distinctly from the plan reason', () => {
    const decision = decideSpec(
      facts({
        activeSpec: 'noted-only',
        written: ['noted-only', 'real-work'],
        touchedWriteRegion: (spec) => spec !== 'noted-only',
      }),
    );
    expect(decision.specNote).toContain("noted-only was not shown to be touched by this branch's diff");
    expect(decision.specNote).not.toContain('is a plan this branch wrote');
  });
});

describe('authoredAsPlan', () => {
  const member = (state: State): Task => ({ state }) as Task;

  it('reads a spec as a plan only when head adds a clause id absent from base and this branch worked none of its members', () => {
    expect(authoredAsPlan([member('open'), member('open')], true)).toBe(true);

    // Git could not be asked — an unresolvable base ref, no repository. The
    // exemption must not widen when the evidence for it disappears.
    expect(authoredAsPlan([member('open'), member('open')], null)).toBe(false);

    // No id in head that base lacks: nothing was authored here, whether
    // because only a pass was appended or because a clause was merely lost —
    // this branch owes the spec, not a plan for it.
    expect(authoredAsPlan([member('open'), member('open')], false)).toBe(false);

    // c3: one member worked here is work done against the spec, whatever the
    // clause text did — deferring a clause mid-branch must not read as
    // authorship and exempt the branch from the gate that would catch it.
    for (const state of ['in-progress', 'done', 'declined', 'unreviewed'] as State[]) {
      expect(authoredAsPlan([member('open'), member(state)], true)).toBe(false);
    }

    // A spec file authored and never decomposed promised a later branch
    // nothing, so it keeps owing its clauses.
    expect(authoredAsPlan([], true)).toBe(false);
  });
});

// c1: clause identity is the id `stampClauseIds` writes into the text, not
// the wording. Directional, not symmetric: pass 2 of the audit found that a
// symmetric set-difference read a conflict marker over one bullet — losing a
// clause without emptying the file — as authorship, the same misclassification
// as the file-existence test it replaced. Only a head id absent from base is
// evidence anything was authored; loss on its own, however it happened, is
// refused.
describe('headAddsClauseId', () => {
  const clause = (id: number, text: string): ProofClause => ({ id, text });

  it('is false when the id set matches, even though the wording changed — a typo fix is not authorship', () => {
    expect(headAddsClauseId([clause(1, 'first'), clause(2, 'second')], [clause(1, 'first, fixed'), clause(2, 'second')])).toBe(false);
  });

  it('is true when head carries a clause id base lacks, whatever order the ids appear in', () => {
    expect(headAddsClauseId([clause(1, 'a'), clause(2, 'b')], [clause(2, 'b'), clause(1, 'a'), clause(3, 'c')])).toBe(true);
  });

  it('is true against an absent base, whose empty clause list has no id for head to lack', () => {
    expect(headAddsClauseId([], [clause(1, 'a')])).toBe(true);
  });

  // Pass 2's exact reproduction: a conflict marker over the middle bullet of
  // a longer list loses one clause without touching the others or emptying
  // the file. No id in head is new, so the exemption is refused.
  it('is false when head lost a clause from the middle of a longer list — corruption, not authorship', () => {
    expect(headAddsClauseId([clause(1, 'a'), clause(2, 'b'), clause(3, 'c')], [clause(1, 'a'), clause(3, 'c')])).toBe(false);
  });

  // Pure deletion is refused along with corruption: it is not evidence of
  // authorship either, and erring toward grading is the safe direction.
  it('is false when head only dropped a clause and added none, even as a deliberate respec', () => {
    expect(headAddsClauseId([clause(1, 'a'), clause(2, 'b')], [clause(1, 'a')])).toBe(false);
  });

  it('is true when a legitimate respec adds one clause to an otherwise unchanged set', () => {
    expect(headAddsClauseId([clause(1, 'a'), clause(2, 'b')], [clause(1, 'a'), clause(2, 'b'), clause(3, 'c')])).toBe(true);
  });

  it('is false when the file is corrupted to zero clauses entirely, subsumed by the same rule rather than special-cased', () => {
    expect(headAddsClauseId([clause(1, 'a'), clause(2, 'b')], [])).toBe(false);
  });
});

// c7's discriminator, isolated from the git reads that feed it: a changed
// path either falls inside a declared region or it does not.
describe('diffTouchesRegion', () => {
  it('is true on an exact match or a directory the changed path sits under', () => {
    expect(diffTouchesRegion(['scripts/tasks/mergeReady.ts'], ['scripts/tasks/mergeReady.ts'])).toBe(true);
    expect(diffTouchesRegion(['scripts/tasks/mergeReady.ts'], ['scripts/tasks'])).toBe(true);
  });

  it('is false when nothing changed falls inside any region', () => {
    expect(diffTouchesRegion(['docs/tasks.jsonl', 'docs/events.jsonl'], ['docs/specs/a-spec.md', 'scripts/tasks/mergeReady.ts'])).toBe(false);
  });

  it('is true when the diff could not be read at all, so the exemption never widens on missing evidence', () => {
    expect(diffTouchesRegion(null, ['scripts/tasks/mergeReady.ts'])).toBe(true);
  });
});

const specV1 = ['# a-spec', '', '## Deliverable', '', 'Promise.', '', 'Proof:', '', '- [c1] first.', '- [c2] second.', ''].join('\n');

// specV1 with one recorded pass grading c1 unmet — the standing c5's
// declined-clause tests settle or leave outstanding.
const specV1AuditedUnmet = [
  '# a-spec', '', '## Deliverable', '', 'Promise.', '', 'Proof:', '', '- [c1] first.', '- [c2] second.', '',
  '## Audit passes', '',
  '### Pass 1 — 2026-01-01', '',
  '- base: `aaa`', '- head: `bbb`', '- proof 1: unmet — broken', '- proof 2: met — fine', '',
].join('\n');

// The two functions that turn repository facts into the decisions above.
// `branchStanding` itself is not called here for the same reason `decideSpec`
// was pulled out of it — it cannot run without those facts — so these get a
// snapshot-backed history directly.
describe('specAddsClauseId and changedFiles, against repository facts', () => {
  let dir: string;
  let originalCwd: string;
  let repo: ReturnType<typeof installDataGit>;

  beforeEach(() => {
    originalCwd = process.cwd();
    dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-mergeready-'));
    repo = installDataGit(dir);
    process.chdir(dir);
  });

  afterEach(() => {
    repo.uninstall();
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (relPath: string, content: string): void => {
    mkdirSync(path.dirname(path.join(dir, relPath)), { recursive: true });
    writeFileSync(path.join(dir, relPath), content, 'utf8');
  };
  const commit = (message: string): void => {
    repo.commit(message);
  };
  const config = (): Config => ({ storePath: 'tasks.jsonl', eventsPath: 'events.jsonl', systemsPath: 'systems.json', specsDir: 'specs', branch: 'feature', actor: null });

  it('reads a respec as a differing clause set (c2)', () => {
    write('specs/a-spec.md', specV1);
    commit('base');
    repo.fork();

    write('specs/a-spec.md', specV1.replace('- [c2] second.', '- [c2] second.\n- [c3] third.'));
    commit('respec, adding a clause');

    expect(specAddsClauseId(config(), 'main', git.resolveCommit('main'), 'a-spec')).toBe(true);
  });

  it('reads an appended audit pass as identical, the deliverable untouched (c1)', () => {
    write('specs/a-spec.md', specV1);
    commit('base');
    repo.fork();

    write('specs/a-spec.md', `${specV1}\n## Audit passes\n\n### Pass 1 — 2026-01-01\n\n- base: \`x\`\n- head: \`y\`\n`);
    commit('audit pass appended, deliverable untouched');

    expect(specAddsClauseId(config(), 'main', git.resolveCommit('main'), 'a-spec')).toBe(false);
  });

  it('reads a brand-new spec, absent from base, as differing (c1 folds the old file-existence case in)', () => {
    write('README.md', 'placeholder');
    commit('base, no spec yet');
    repo.fork();
    write('specs/a-spec.md', specV1);
    commit('author the spec');

    expect(specAddsClauseId(config(), 'main', git.resolveCommit('main'), 'a-spec')).toBe(true);
  });

  it('is null when git cannot answer at all, rather than guessing (c6)', () => {
    commit('only commit');
    expect(specAddsClauseId(config(), 'no-such-branch', null, 'a-spec')).toBe(null);
  });

  // Finding 1 (pass 1 audit): a spec file present but unreadable/corrupted
  // parses to zero head clauses, which the directional rule refuses on its
  // own — no id read from head can be new. Subsumed rather than special-cased.
  it('is false when the head copy parses to zero clauses against a populated base, rather than reading corruption as authorship', () => {
    write('specs/a-spec.md', specV1);
    commit('base');
    repo.fork();

    write('specs/a-spec.md', 'not a spec document at all — no ## Deliverable heading survived.');
    commit('spec file corrupted on this branch');

    expect(specAddsClauseId(config(), 'main', git.resolveCommit('main'), 'a-spec')).toBe(false);
  });

  // Pass 2 of the audit: a conflict marker over one bullet in the middle of
  // a longer Proof list loses a clause without emptying the file or touching
  // the others — the shape the zero-clause-only guard did not cover.
  it('is false when the head copy loses one clause of several, mid-list, to partial corruption', () => {
    const threeClauses = ['# a-spec', '', '## Deliverable', '', 'Promise.', '', 'Proof:', '', '- [c1] first.', '- [c2] second.', '- [c3] third.', ''].join('\n');
    write('specs/a-spec.md', threeClauses);
    commit('base, three clauses');
    repo.fork();

    write('specs/a-spec.md', threeClauses.replace('- [c2] second.\n', '<<<<<<< HEAD\n=======\n>>>>>>> branch\n'));
    commit('conflict marker over the middle bullet, on this branch');

    expect(specAddsClauseId(config(), 'main', git.resolveCommit('main'), 'a-spec')).toBe(false);
  });

  it('is true when a legitimate respec adds one clause, against a real repository', () => {
    write('specs/a-spec.md', specV1);
    commit('base, two clauses');
    repo.fork();

    write('specs/a-spec.md', `${specV1}- [c3] third.\n`);
    commit('respec, adding one clause');

    expect(specAddsClauseId(config(), 'main', git.resolveCommit('main'), 'a-spec')).toBe(true);
  });

  it('still reads a real, deliberate empty-Proof spec as identical to an equally empty base', () => {
    const noProof = ['# a-spec', '', '## Deliverable', '', 'Nothing proven yet.', ''].join('\n');
    write('specs/a-spec.md', noProof);
    commit('base, no proof clauses');
    repo.fork();
    write('other.txt', 'x');
    commit('unrelated change');

    expect(specAddsClauseId(config(), 'main', git.resolveCommit('main'), 'a-spec')).toBe(false);
  });

  it('is null when there is no merge base to diff from', () => {
    expect(changedFiles(null)).toBe(null);
  });
});

// The residual real-git case: what stays fixed here is the merge base's
// position while main moves on after the fork — a fact about git's history
// graph, not about any commit's content, so a snapshot history cannot
// stand in for it.
describe('changedFiles when main moves after the fork, against real git', () => {
  it('reports only the paths this branch\'s own commits changed, not a later move of main', () =>
    realGitRepo(({ git: sh, write, commit }) => {
      write('specs/a-spec.md', specV1);
      commit('base');
      sh('checkout', '-q', '-b', 'feature');
      write('src/impl.ts', 'x');
      commit('implement');

      expect(changedFiles(git.mergeBase('main'))).toEqual(['src/impl.ts']);

      sh('checkout', '-q', 'main');
      write('unrelated.txt', 'y');
      commit('main moves on');
      sh('checkout', '-q', 'feature');
      expect(changedFiles(git.mergeBase('main'))).toEqual(['src/impl.ts']);
    }));
});

// Finding 2 (pass 1 audit): a declared `writes` grant is a forecast, and the
// diff is only the stronger of two kinds of evidence for `touchedWriteRegion`
// — a `start`/`stop`/`done` event against a member is the other.
describe('branchWorkedOnMembers', () => {
  const event = (overrides: Partial<TaskEvent> = {}): TaskEvent => ({ t: '2026-01-01T00:00:00Z', by: null, branch: 'feature', head: null, op: 'start', id: 'member-1', system: null, spec: 'a-spec', note: '', ...overrides });

  it('is true for a start, stop or done event naming a member, from this branch', () => {
    for (const op of ['start', 'stop', 'done']) {
      expect(branchWorkedOnMembers([event({ op })], 'feature', new Set(['member-1']))).toBe(true);
    }
  });

  it('is false for a bare note or decision — an annotation is not work', () => {
    for (const op of ['note', 'decision', 'edit', 'add']) {
      expect(branchWorkedOnMembers([event({ op })], 'feature', new Set(['member-1']))).toBe(false);
    }
  });

  it('is false when the event is from a different branch, or names a task that is not a member', () => {
    expect(branchWorkedOnMembers([event({ branch: 'other-branch' })], 'feature', new Set(['member-1']))).toBe(false);
    expect(branchWorkedOnMembers([event({ id: 'not-a-member' })], 'feature', new Set(['member-1']))).toBe(false);
  });

  it('goes by the event\'s id, not its spec field, so a member re-pointed since the event was written still counts', () => {
    expect(branchWorkedOnMembers([event({ id: 'member-1', spec: 'some-other-spec' })], 'feature', new Set(['member-1']))).toBe(true);
  });
});

// `branchStanding` wires `decideSpec`'s facts to a repository history and a
// real store — the seam both pass-1 findings lived in, and the one thing
// calling the pieces separately cannot prove.
describe('branchStanding, against repository facts', () => {
  let dir: string;
  let originalCwd: string;
  let repo: ReturnType<typeof installDataGit>;

  beforeEach(() => {
    originalCwd = process.cwd();
    dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-branchstanding-'));
    repo = installDataGit(dir);
    process.chdir(dir);
  });

  afterEach(() => {
    repo.uninstall();
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (relPath: string, content: string): void => {
    mkdirSync(path.dirname(path.join(dir, relPath)), { recursive: true });
    writeFileSync(path.join(dir, relPath), content, 'utf8');
  };
  const commit = (message: string): void => {
    repo.commit(message);
  };
  const config = (): Config => ({ storePath: 'tasks.jsonl', eventsPath: 'events.jsonl', systemsPath: 'systems.json', specsDir: 'specs', branch: 'feature', actor: null });
  const writeSystems = (): void => write('systems.json', JSON.stringify({ unowned: { note: '', paths: [] }, systems: [] }));
  const writeStore = (task: Record<string, unknown>): void => write('tasks.jsonl', `${JSON.stringify({ requires: [], files: [], ...task })}\n`);
  const writeEvent = (op: string, note: string): void => write('events.jsonl', `${JSON.stringify({ t: '2026-01-01T00:00:00Z', by: null, branch: 'feature', head: null, op, id: 'member-1', system: null, spec: 'a-spec', note })}\n`);

  // The read that fills standing.dirty, asserted where it is assembled: the
  // rendering of a dirty list was already covered against a hand-built
  // standing object, which is exactly the coverage that let the read itself
  // be blinded with the suite green.
  it('reports the working tree\'s own uncommitted paths as dirty', () => {
    writeSystems();
    write('specs/a-spec.md', specV1);
    commit('base');
    repo.fork();

    write('left-behind.txt', 'uncommitted');
    const standing = branchStanding(config(), 'main');
    expect(standing.dirty).toEqual(['left-behind.txt']);
  });

  it('keeps a spec whose diff never touched its declared writes, because a start event names its member (finding 2)', () => {
    writeSystems();
    write('specs/a-spec.md', specV1);
    writeStore({ id: 'member-1', title: 'Member', kind: 'task', state: 'open', spec: 'a-spec', writes: ['impl.ts'] });
    commit('base');
    repo.fork();

    // Real work landed outside the declared grant: impl.ts is untouched, and
    // the branch's own diff carries only the event log entry below.
    writeEvent('start', 'started member-1');
    commit('start recorded, grant not yet corrected');

    const standing = branchStanding(config(), 'main');
    expect(standing.spec).toBe('a-spec');
    expect(standing.specAuthoredHere).toBe(false);
  });

  it('drops a spec whose diff never touched it and which carries only a note — the bug c7 fixed stays fixed', () => {
    writeSystems();
    write('specs/a-spec.md', specV1);
    writeStore({ id: 'member-1', title: 'Member', kind: 'task', state: 'open', spec: 'a-spec', writes: ['impl.ts'] });
    commit('base');
    repo.fork();

    writeEvent('note', 'a passing observation, not work');
    commit('note recorded');

    expect(branchStanding(config(), 'main').spec).toBe(null);
  });

  it('does not exempt a branch whose local spec copy is corrupted, even though its diff touches the spec file (finding 1)', () => {
    writeSystems();
    write('specs/a-spec.md', specV1);
    writeStore({ id: 'member-1', title: 'Member', kind: 'task', state: 'open', spec: 'a-spec', writes: ['impl.ts'] });
    commit('base');
    repo.fork();

    // A candidate has to reach `branchStanding` before it can be graded — the
    // branch name does not match here, so, as with the two cases above, an
    // event is what proposes `a-spec` at all.
    writeEvent('start', 'started member-1');
    write('specs/a-spec.md', 'garbled — no recognizable spec structure left.');
    commit('spec corrupted on this branch');

    const standing = branchStanding(config(), 'main');
    expect(standing.spec).toBe('a-spec');
    expect(standing.specAuthoredHere).toBe(false);
  });

  // c4, end to end: two audit passes over disjoint clause sets, exactly the
  // shape the merge that motivated this spec produced — c1 met by pass 1
  // and never regraded, c2 met only by pass 2. A standing read off the
  // latest pass alone would call c1 outstanding.
  const specWithTwoPasses = [
    '# a-spec', '', '## Deliverable', '', 'Promise.', '', 'Proof:', '', '- [c1] first.', '- [c2] second.', '',
    '## Audit passes', '',
    '### Pass 1 — 2026-01-01', '',
    '- base: `aaa`', '- head: `bbb`', '- proof 1: met — checked once', '- proof 2: unknown', '',
    '### Pass 2 — 2026-01-02', '',
    '- base: `ccc`', '- head: `ddd`', '- proof 1: unknown', '- proof 2: met — checked separately', '',
  ].join('\n');

  it('leaves a clause an earlier pass met off outstandingClauses, even though the latest pass never regraded it (c4)', () => {
    writeSystems();
    write('specs/a-spec.md', specWithTwoPasses);
    writeStore({ id: 'member-1', title: 'Member', kind: 'task', state: 'done', spec: 'a-spec', writes: ['impl.ts'] });
    commit('base');
    repo.fork();

    writeEvent('start', 'started member-1');
    commit('start recorded');

    const standing = branchStanding(config(), 'main');
    expect(standing.spec).toBe('a-spec');
    expect(standing.outstandingClauses).toEqual([]);
  });

  // c5: an undelivered task whose only record was declined is abandoned,
  // not discharged, and must not leave the clauses leg red with no action
  // left to clear it.
  it('drops a clause whose only undelivered record was declined off outstandingClauses, and names it declined (c5)', () => {
    writeSystems();
    write('specs/a-spec.md', specV1AuditedUnmet);
    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-1', seq: 1, title: 'Member', kind: 'task', state: 'done', spec: 'a-spec', requires: [], files: [], writes: ['impl.ts'] }),
        JSON.stringify({ id: 'a-spec-clause-1', seq: 2, title: 'Unmet deliverable clause 1', kind: 'undelivered', state: 'declined', spec: 'a-spec', clause: 1, requires: [], files: [], writes: [] }),
      ].join('\n') + '\n',
    );
    commit('base');
    repo.fork();

    writeEvent('start', 'started member-1');
    commit('start recorded');

    const standing = branchStanding(config(), 'main');
    expect(standing.spec).toBe('a-spec');
    expect(standing.outstandingClauses).toEqual([]);
    expect(standing.declinedClauses).toEqual(['c1']);
  });

  it('keeps a clause outstanding when its unmet recurred after an earlier record for it was declined (c5)', () => {
    writeSystems();
    write('specs/a-spec.md', specV1AuditedUnmet);
    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-1', seq: 1, title: 'Member', kind: 'task', state: 'done', spec: 'a-spec', requires: [], files: [], writes: ['impl.ts'] }),
        JSON.stringify({ id: 'a-spec-clause-1', seq: 2, title: 'Unmet deliverable clause 1', kind: 'undelivered', state: 'declined', spec: 'a-spec', clause: 1, requires: [], files: [], writes: [] }),
        JSON.stringify({ id: 'a-spec-clause-1-pass-2', seq: 3, title: 'Unmet deliverable clause 1, again', kind: 'undelivered', state: 'open', spec: 'a-spec', clause: 1, requires: [], files: [], writes: [] }),
      ].join('\n') + '\n',
    );
    commit('base');
    repo.fork();

    writeEvent('start', 'started member-1');
    commit('start recorded');

    const standing = branchStanding(config(), 'main');
    expect(standing.outstandingClauses).toEqual(['c1']);
    expect(standing.declinedClauses).toEqual([]);
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
