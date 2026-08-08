import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as git from '../lib/git';
import { parseStoreTolerantly, type Task } from '../lib/taskStore';
import { allUsages } from './commands';
import type { Config } from './context';
import { installDataGit } from './cliFixtures';
import { realGitRepo } from './realGitFixture';
import {
  branchStanding,
  changedRecords,
  declaredSpecs,
  LEGS,
  runMergeReady,
  storeDiff,
  type BranchStanding,
  type SpecStanding,
} from './mergeReady';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

// Every field a store line can carry, defaulted the way `normalizeTask`
// defaults an absent one, so a test only has to name what it is asserting
// about.
const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'member-1',
  seq: 1,
  title: 'Member',
  kind: 'task',
  state: 'open',
  severity: null,
  system: null,
  spec: 'a-spec',
  departure: null,
  clause: null,
  discharges: [],
  requires: [],
  files: [],
  writes: [],
  grant: null,
  fault: null,
  decider: null,
  produces: [],
  deliverable: null,
  evidence: null,
  source: null,
  reason: null,
  trigger: null,
  closed: null,
  closedCommit: null,
  claimed: null,
  claimedBy: null,
  extra: null,
  ...overrides,
});

// A row this file's assertions can match without hand-counting `padEnd`
// columns, which drift the moment a leg's name carries a spec slug of a
// different length. `esc` because a detail string routinely carries
// parentheses (`"pass(es)"`), which are regex metacharacters otherwise.
const esc = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rowMatch = (name: string, rest: string): RegExp => new RegExp(`${esc(name)}\\s+${esc(rest)}`);

// A branch working one clause of one spec, ready to merge: clean tree, base
// unmoved, its own member closed, and a pass that graded that clause met.
const readySpec = (overrides: Partial<SpecStanding> = {}): SpecStanding => ({
  spec: 'a-spec',
  openMembers: [],
  unreviewedFindings: 0,
  clausesOwed: 1,
  outstandingClauses: [],
  deferredClauses: [],
  declinedClauses: [],
  auditPasses: 1,
  ...overrides,
});

const ready = (overrides: Partial<BranchStanding> = {}): BranchStanding => ({
  branch: 'a-branch',
  dirty: [],
  baseMoved: false,
  baseBranch: 'main',
  diffReadable: true,
  specs: [readySpec()],
  doctorWarnings: 0,
  ...overrides,
});

interface Recorded {
  lines: string[];
  commands: string[];
}

function deps(overrides: Partial<import('./mergeReady').MergeReadyDeps> = {}): { deps: import('./mergeReady').MergeReadyDeps; recorded: Recorded } {
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
  // Overrides apply to the one declared spec `ready()` carries by default —
  // most of these tests are about one spec's own standing, not the branch
  // shell around it.
  const graded = async (specOverrides: Partial<SpecStanding>): Promise<{ ok: boolean; body: string }> => {
    const { deps: d, recorded } = deps({ standing: () => ready({ specs: [readySpec(specOverrides)] }) });
    const ok = await runMergeReady(d);
    return { ok, body: recorded.lines.join('\n') };
  };
  const body = async (specOverrides: Partial<SpecStanding>): Promise<string> => (await graded(specOverrides)).body;

  it('fails on main having moved, which is the one that bites and failed nothing', async () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ baseMoved: true }) });
    expect(await runMergeReady(d)).toBe(false);
    expect(recorded.lines.join('\n')).toContain('main has moved past the merge base');
    expect(recorded.lines.join('\n')).toContain('base           git merge main');
  });

  it('fails on a dirty tree, naming the paths a cleanup would discard the closes of', async () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ dirty: ['docs/tasks.jsonl', 'src/a.ts'] }) });
    expect(await runMergeReady(d)).toBe(false);
    expect(recorded.lines.join('\n')).toContain('2 uncommitted path(s): docs/tasks.jsonl, src/a.ts');
  });

  // c7: the printed command carries the spec it already knows — `next` and
  // `triage` both refuse without one now, so a suggestion that omitted it
  // would send a reader straight into that refusal.
  it('fails on an unclosed spec, sending an open member to `tasks next --spec` and an unreviewed finding to `tasks triage --spec`', async () => {
    const open = await graded({ openMembers: ['a-slice'] });
    expect(open.ok).toBe(false);
    expect(open.body).toMatch(rowMatch('spec a-spec', 'npm run tasks -- next --spec a-spec'));

    const untriaged = await graded({ unreviewedFindings: 2 });
    expect(untriaged.ok).toBe(false);
    expect(untriaged.body).toMatch(rowMatch('spec a-spec', 'npm run tasks -- triage --spec a-spec'));
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
    expect(outstanding.body).toMatch(rowMatch('clauses a-spec', 'npm run tasks -- next --spec a-spec'));
  });

  // c7: a branch that deferred its way to green says so in the same line
  // that says green, rather than the clauses leg passing silently.
  it('passes the clauses leg on a deferred clause, and names it in the same line that says pass', async () => {
    const deferred = await graded({ deferredClauses: ['c3'] });
    expect(deferred.ok).toBe(true);
    expect(deferred.body).toMatch(rowMatch('clauses a-spec', 'ok  pass — 1 pass(es) recorded, no clause outstanding; deferred: c3'));
  });

  it('names a deferred clause beside a real outstanding one, on a failing run', async () => {
    const both = await graded({ outstandingClauses: ['c2'], deferredClauses: ['c3'] });
    expect(both.ok).toBe(false);
    expect(both.body).toContain('1 outstanding across 1 pass(es): c2; deferred: c3');
  });

  it('passes the clauses leg on a declined clause, and names it distinctly from a real outstanding one', async () => {
    const declined = await graded({ declinedClauses: ['c5'] });
    expect(declined.ok).toBe(true);
    expect(declined.body).toMatch(rowMatch('clauses a-spec', 'ok  pass — 1 pass(es) recorded, no clause outstanding; declined: c5'));
  });

  it('names a declined clause beside a real outstanding one, on a failing run', async () => {
    const both = await graded({ outstandingClauses: ['c2'], declinedClauses: ['c5'] });
    expect(both.ok).toBe(false);
    expect(both.body).toContain('1 outstanding across 1 pass(es): c2; declined: c5');
  });

  // c11: a clause no member of this branch discharges is not this branch's
  // to answer — the clauses leg reads as nothing owed rather than blocked.
  it('passes the clauses leg vacuously when this branch\'s own members discharge no clause', async () => {
    const { ok, body: lines } = await graded({ clausesOwed: 0, auditPasses: 0 });
    expect(ok).toBe(true);
    expect(lines).toMatch(rowMatch('clauses a-spec', 'ok  pass — no member of a-spec this branch declared discharges a clause'));
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

  it('has nothing to say about a spec on a branch whose store diff declares none', async () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ specs: [] }) });
    expect(await runMergeReady(d)).toBe(true);
    const none = recorded.lines.join('\n');
    expect(none).toContain("this branch's store diff declares no spec, so it owes no clause");
    expect(none).not.toContain('clauses');
  });

  // c9: unreadable is never read as "declares nothing" — that would be
  // exactly the guess this branch's spec forbids, on the one axis this gate
  // exists to answer.
  it('fails distinctly when the store diff could not be read, rather than reading it as declaring nothing', async () => {
    const { deps: d, recorded } = deps({ standing: () => ready({ diffReadable: false, specs: [] }) });
    expect(await runMergeReady(d)).toBe(false);
    const body_ = recorded.lines.join('\n');
    expect(body_).toContain("this branch's store diff against main could not be read — declared specs cannot be determined");
  });

  // c10: two declared specs are graded independently — a branch working two
  // cannot go green on the strength of the one it finished, and each names
  // its own next step in a fully green run.
  it('grades every declared spec on its own, and cannot go green on the strength of only one', async () => {
    const { deps: d, recorded } = deps({
      standing: () => ready({ specs: [readySpec({ spec: 'spec-a' }), readySpec({ spec: 'spec-b', openMembers: ['m1'] })] }),
    });
    expect(await runMergeReady(d)).toBe(false);
    const body_ = recorded.lines.join('\n');
    expect(body_).toContain('NOT merge-ready:');
    expect(body_).toContain('spec spec-b');
    expect(body_).not.toContain('spec spec-a  FAIL');

    const { deps: d2, recorded: r2 } = deps({
      standing: () => ready({ specs: [readySpec({ spec: 'spec-a' }), readySpec({ spec: 'spec-b' })] }),
    });
    expect(await runMergeReady(d2)).toBe(true);
    const green = r2.lines.join('\n');
    expect(green).toContain('next: npm run tasks -- spec done spec-a');
    expect(green).toContain('next: npm run tasks -- spec done spec-b');
  });
});

describe('changedRecords', () => {
  it('is empty when nothing differs from base, field for field', () => {
    const t = task();
    expect(changedRecords([t], [t])).toEqual([]);
  });

  it('includes a record present in current but absent from base', () => {
    const t = task();
    expect(changedRecords([], [t])).toEqual([t]);
  });

  // The shape a real `tasks start` writes: `state` and the claim fields
  // move together, which is exactly the signal the deleted event-log route
  // was reading — a record in the store diff, not an event naming it.
  it('includes a record whose state and claim changed', () => {
    const before = task({ state: 'open', claimed: null, claimedBy: null });
    const after = task({ state: 'in-progress', claimed: '2026-01-01', claimedBy: 'someone' });
    expect(changedRecords([before], [after])).toEqual([after]);
  });

  it('drops a record neither side changed, leaving one that did', () => {
    const unchanged = task({ id: 'member-1' });
    const changed = task({ id: 'member-2', state: 'in-progress' });
    expect(changedRecords([unchanged, task({ id: 'member-2' })], [unchanged, changed])).toEqual([changed]);
  });

  // A store rewrite is not a change: `saveStore` re-serializes every record
  // on every save, and two branches' independent saves must not read each
  // other's untouched records as touched because a key landed in a
  // different position.
  it('is unmoved by key order alone', () => {
    const before = task();
    const reordered = {} as Record<string, unknown>;
    for (const key of [...Object.keys(before)].reverse()) reordered[key] = (before as unknown as Record<string, unknown>)[key];
    expect(changedRecords([before], [reordered as unknown as Task])).toEqual([]);
  });
});

describe('declaredSpecs', () => {
  it('is the set of specs the changed records name, sorted and deduplicated', () => {
    expect(declaredSpecs([task({ id: 'a', spec: 'spec-b' }), task({ id: 'b', spec: 'spec-a' }), task({ id: 'c', spec: 'spec-a' })])).toEqual(['spec-a', 'spec-b']);
  });

  it('drops a record naming no spec', () => {
    expect(declaredSpecs([task({ spec: null })])).toEqual([]);
  });

  it('is empty over no changed records', () => {
    expect(declaredSpecs([])).toEqual([]);
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

// `storeDiff`, `declaredSpecs` and `branchStanding` cannot run without a
// repository, so these get a snapshot-backed history directly — the same
// seam `specAddsClauseId` used to, now driving the task store instead of a
// spec's markdown.
describe('storeDiff, against repository facts', () => {
  let dir: string;
  let originalCwd: string;
  let repo: ReturnType<typeof installDataGit>;

  beforeEach(() => {
    originalCwd = process.cwd();
    dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-storediff-'));
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
  // The live store, read the way `readStore` reads it — matching the base
  // read's own normalization, so a record neither commit changed compares
  // equal rather than differing on a field this fixture forgot to repeat.
  const currentTasks = (): Task[] => parseStoreTolerantly(readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8'), 'tasks.jsonl').tasks;

  // c9: on a branch whose store diff names two specs, the set has both.
  it('names every spec a changed record points at', () => {
    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'M1', kind: 'task', state: 'open', spec: 'spec-a', requires: [], files: [] })}\n`);
    commit('base');
    repo.fork();

    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-1', title: 'M1', kind: 'task', state: 'open', spec: 'spec-a', requires: [], files: [] }),
        JSON.stringify({ id: 'member-2', title: 'M2', kind: 'task', state: 'open', spec: 'spec-b', requires: [], files: [] }),
      ].join('\n') + '\n',
    );
    commit('declare spec-b');

    const diff = storeDiff(config(), git.mergeBase('main'), currentTasks());
    expect(diff.readable).toBe(true);
    expect(declaredSpecs(diff.changed)).toEqual(['spec-b']);
  });

  // c9: on one whose diff names none, the set is empty — an unrelated
  // change is not a declaration.
  it('is empty when nothing about the store changed', () => {
    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'M1', kind: 'task', state: 'open', spec: 'spec-a', requires: [], files: [] })}\n`);
    commit('base');
    repo.fork();

    write('unrelated.txt', 'x');
    commit('unrelated change, store untouched');

    const diff = storeDiff(config(), git.mergeBase('main'), currentTasks());
    expect(diff.readable).toBe(true);
    expect(diff.changed).toEqual([]);
  });

  // c9: a checkout that cannot produce a diff says so, rather than reading
  // "no merge base" as "declares nothing".
  it('is unreadable when there is no merge base to diff from', () => {
    write('tasks.jsonl', '');
    commit('only commit');
    const diff = storeDiff(config(), null, []);
    expect(diff.readable).toBe(false);
    expect(diff.changed).toEqual([]);
  });

  it('is unreadable when the store did not exist at the merge base', () => {
    write('specs/a-spec.md', specV1);
    commit('base, no store yet');
    repo.fork();
    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'M1', kind: 'task', state: 'open', spec: 'spec-a', requires: [], files: [] })}\n`);
    commit('store introduced on this branch');

    const diff = storeDiff(config(), git.mergeBase('main'), [task({ id: 'member-1', spec: 'spec-a' })]);
    expect(diff.readable).toBe(false);
  });
});

// `branchStanding` wires `storeDiff` to a repository history and a real
// store — the seam the pass-1/pass-2 findings on the deleted event-log route
// used to live in, and the one thing calling the pieces separately cannot
// prove.
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
  const standingFor = (config_: Config, spec: string): SpecStanding | undefined => branchStanding(config_, 'main').specs.find((s) => s.spec === spec);

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

  // c9: a spec is declared the moment a task record naming it changes,
  // whatever files the branch's commits otherwise touched — the git
  // file-diff route the deleted mechanism used is gone, and no separate
  // "did the diff touch this spec's write region" check replaces it.
  it('declares a spec whose member changed in the store, even though no other file did', () => {
    writeSystems();
    write('specs/a-spec.md', specV1);
    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'Member', kind: 'task', state: 'open', spec: 'a-spec', requires: [], files: [], writes: ['impl.ts'] })}\n`);
    commit('base');
    repo.fork();

    // The real shape `tasks start` writes: state and claim move together,
    // and impl.ts — the member's declared writes grant — is never touched.
    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'Member', kind: 'task', state: 'in-progress', spec: 'a-spec', requires: [], files: [], writes: ['impl.ts'], claimed: '2026-01-01', claimedBy: 'someone' })}\n`);
    commit('start recorded in the store');

    const standing = branchStanding(config(), 'main');
    expect(standing.specs.map((s) => s.spec)).toEqual(['a-spec']);
  });

  // c9: no reader of the branch's spec set consults docs/events.jsonl — an
  // event alone, with the store itself untouched, declares nothing.
  it('declares nothing when only an unrelated file changed, an events.jsonl entry included', () => {
    writeSystems();
    write('specs/a-spec.md', specV1);
    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'Member', kind: 'task', state: 'open', spec: 'a-spec', requires: [], files: [] })}\n`);
    commit('base');
    repo.fork();

    write('events.jsonl', `${JSON.stringify({ t: '2026-01-01T00:00:00Z', by: null, branch: 'feature', head: null, op: 'start', id: 'member-1', system: null, spec: 'a-spec', note: 'started member-1' })}\n`);
    commit('event recorded, store untouched');

    const standing = branchStanding(config(), 'main');
    expect(standing.specs).toEqual([]);
  });

  // c9: a checkout whose diff cannot be read fails loudly rather than
  // reading empty as "nothing declared".
  it('reads as unreadable, not as declaring nothing, when there is no merge base', () => {
    writeSystems();
    write('tasks.jsonl', '');
    commit('only commit');
    const standing = branchStanding(config(), 'no-such-branch');
    expect(standing.diffReadable).toBe(false);
    expect(standing.specs).toEqual([]);
  });

  // c8: a spec merely authored — the markdown written, no task record ever
  // pointing at it — never enters the declared set. This replaces
  // "authored as a plan" without a special case: nothing was declared, so
  // nothing is graded, whether or not the file exists.
  it('does not declare a spec this branch only wrote the markdown for', () => {
    writeSystems();
    write('README.md', 'placeholder');
    commit('base, no spec yet');
    repo.fork();

    write('specs/later-work.md', specV1.replace('a-spec', 'later-work'));
    commit('author a spec for a later branch, decompose nothing');

    const standing = branchStanding(config(), 'main');
    expect(standing.specs).toEqual([]);
  });

  // c11: a branch holding one member of a multi-member spec is graded on
  // that member's own discharged clauses, not on the member another branch
  // already closed — the exact shape that read as red-by-design before this
  // branch.
  it('scopes openMembers and clauses to this branch\'s own member of a multi-member spec', () => {
    writeSystems();
    write('specs/a-spec.md', specV1);
    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-1', title: 'Member 1', kind: 'task', state: 'done', spec: 'a-spec', discharges: [1], requires: [], files: [] }),
        JSON.stringify({ id: 'member-2', title: 'Member 2', kind: 'task', state: 'open', spec: 'a-spec', discharges: [2], requires: [], files: [] }),
      ].join('\n') + '\n',
    );
    commit('base — member-1 already closed by an earlier, already-merged branch');
    repo.fork();

    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-1', title: 'Member 1', kind: 'task', state: 'done', spec: 'a-spec', discharges: [1], requires: [], files: [] }),
        JSON.stringify({ id: 'member-2', title: 'Member 2', kind: 'task', state: 'done', spec: 'a-spec', discharges: [2], requires: [], files: [], closed: '2026-01-02' }),
      ].join('\n') + '\n',
    );
    commit('this branch closes member-2 only');

    const standing = standingFor(config(), 'a-spec');
    expect(standing?.openMembers).toEqual([]);
    // member-1 never entered this branch's diff, so its clause (c1) is not
    // this branch's to answer — only c2, member-2's own, is.
    expect(standing?.clausesOwed).toBe(1);
  });

  // c11, pinning a mutation pass 1's own audit found surviving at
  // whole-suite scope: scoping `ownClauseIds` to `ownMembers` — this spec's
  // own changed records — has to happen before the clause ids are read, not
  // be skipped in favour of reading every declared spec's changed records
  // together. Two specs in one diff, sharing a clause *number* that is also
  // a real clause in spec-a's own document, is the shape that survived: a
  // foreign id that happened not to exist in spec-a's text would have stood
  // out as the "stale clause id" case above proves it does; one that does
  // exist reads as spec-a legitimately owing it, and only the ownership
  // filter — not the clause's existence in the document — tells them apart.
  it('does not credit spec-a\'s owed clauses with a clause number spec-b\'s own member discharged (c11)', () => {
    writeSystems();
    write('specs/spec-a.md', specV1.replace(/a-spec/g, 'spec-a'));
    write('specs/spec-b.md', specV1.replace(/a-spec/g, 'spec-b'));
    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-a', title: 'A', kind: 'task', state: 'open', spec: 'spec-a', discharges: [1], requires: [], files: [] }),
        JSON.stringify({ id: 'member-b', title: 'B', kind: 'task', state: 'open', spec: 'spec-b', discharges: [2], requires: [], files: [] }),
      ].join('\n') + '\n',
    );
    commit('base');
    repo.fork();

    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-a', title: 'A', kind: 'task', state: 'done', spec: 'spec-a', discharges: [1], requires: [], files: [] }),
        // c2 is spec-b's own member's discharge, and also a real clause id
        // in spec-a's own document (specV1 carries [c1] and [c2] on every
        // spec it is copied onto) — the overlap that makes a filter on
        // clause existence alone indistinguishable from a filter on
        // ownership, unless ownership is what is actually checked.
        JSON.stringify({ id: 'member-b', title: 'B', kind: 'task', state: 'done', spec: 'spec-b', discharges: [2], requires: [], files: [] }),
      ].join('\n') + '\n',
    );
    commit('this branch closes both members, declaring one spec each');

    const standing = standingFor(config(), 'spec-a');
    // Only member-a's own discharge (c1) is spec-a's to own — c2 is
    // spec-b's member's, not spec-a's, however identically it is numbered.
    expect(standing?.clausesOwed).toBe(1);
    expect(standing?.outstandingClauses).not.toContain('c2');
  });

  // c10: two declared specs are graded independently.
  it('declares both specs when the diff changes a member of each', () => {
    writeSystems();
    write('specs/spec-a.md', specV1.replace(/a-spec/g, 'spec-a'));
    write('specs/spec-b.md', specV1.replace(/a-spec/g, 'spec-b'));
    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-a', title: 'A', kind: 'task', state: 'open', spec: 'spec-a', requires: [], files: [] }),
        JSON.stringify({ id: 'member-b', title: 'B', kind: 'task', state: 'open', spec: 'spec-b', requires: [], files: [] }),
      ].join('\n') + '\n',
    );
    commit('base');
    repo.fork();

    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-a', title: 'A', kind: 'task', state: 'done', spec: 'spec-a', requires: [], files: [], closed: '2026-01-02' }),
        // Still open, but claimed since the base commit — this branch's own
        // diff touches it too, which is what puts spec-b in the declared set
        // alongside spec-a rather than leaving it a silent bystander.
        JSON.stringify({ id: 'member-b', title: 'B', kind: 'task', state: 'in-progress', spec: 'spec-b', requires: [], files: [], claimed: '2026-01-02', claimedBy: 'someone' }),
      ].join('\n') + '\n',
    );
    commit('close member-a, start member-b — both are this branch\'s own diff');

    const standing = branchStanding(config(), 'main');
    expect(standing.specs.map((s) => s.spec)).toEqual(['spec-a', 'spec-b']);
    expect(standing.specs.find((s) => s.spec === 'spec-a')?.openMembers).toEqual([]);
    expect(standing.specs.find((s) => s.spec === 'spec-b')?.openMembers).toEqual(['member-b']);
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
    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'Member', kind: 'task', state: 'done', spec: 'a-spec', discharges: [1, 2], requires: [], files: [] })}\n`);
    commit('base');
    repo.fork();

    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'Member', kind: 'task', state: 'done', spec: 'a-spec', discharges: [1, 2], requires: [], files: [], closedCommit: 'x' })}\n`);
    commit('close the member, closingCommit recorded');

    const standing = standingFor(config(), 'a-spec');
    expect(standing).toBeDefined();
    expect(standing?.outstandingClauses).toEqual([]);
  });

  // c5: an undelivered task whose only record was declined is abandoned,
  // not discharged, and must not leave the clauses leg red with no action
  // left to clear it.
  it('drops a clause whose only undelivered record was declined off outstandingClauses, and names it declined (c5)', () => {
    writeSystems();
    write('specs/a-spec.md', specV1AuditedUnmet);
    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', seq: 1, title: 'Member', kind: 'task', state: 'open', spec: 'a-spec', discharges: [1], requires: [], files: [] })}\n`);
    commit('base');
    repo.fork();

    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-1', seq: 1, title: 'Member', kind: 'task', state: 'done', spec: 'a-spec', discharges: [1], requires: [], files: [] }),
        JSON.stringify({ id: 'a-spec-clause-1', seq: 2, title: 'Unmet deliverable clause 1', kind: 'undelivered', state: 'declined', spec: 'a-spec', clause: 1, requires: [], files: [] }),
      ].join('\n') + '\n',
    );
    commit('close the member, decline the clause');

    const standing = standingFor(config(), 'a-spec');
    expect(standing?.outstandingClauses).toEqual([]);
    expect(standing?.declinedClauses).toEqual(['c1']);
  });

  it('keeps a clause outstanding when its unmet recurred after an earlier record for it was declined (c5)', () => {
    writeSystems();
    write('specs/a-spec.md', specV1AuditedUnmet);
    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', seq: 1, title: 'Member', kind: 'task', state: 'open', spec: 'a-spec', discharges: [1], requires: [], files: [] })}\n`);
    commit('base');
    repo.fork();

    write(
      'tasks.jsonl',
      [
        JSON.stringify({ id: 'member-1', seq: 1, title: 'Member', kind: 'task', state: 'done', spec: 'a-spec', discharges: [1], requires: [], files: [] }),
        JSON.stringify({ id: 'a-spec-clause-1', seq: 2, title: 'Unmet deliverable clause 1', kind: 'undelivered', state: 'declined', spec: 'a-spec', clause: 1, requires: [], files: [] }),
        JSON.stringify({ id: 'a-spec-clause-1-pass-2', seq: 3, title: 'Unmet deliverable clause 1, again', kind: 'undelivered', state: 'open', spec: 'a-spec', clause: 1, requires: [], files: [] }),
      ].join('\n') + '\n',
    );
    commit('close the member, decline once, recur once');

    const standing = standingFor(config(), 'a-spec');
    expect(standing?.outstandingClauses).toEqual(['c1']);
    expect(standing?.declinedClauses).toEqual([]);
  });

  // A clause id an own member discharges but the spec's own text no longer
  // carries reads as unknown — still outstanding — rather than silently
  // dropping out of the standing because `clauseStandings` never produced a
  // verdict for it.
  it('reads a stale clause id an own member discharges as outstanding, not as nothing owed', () => {
    writeSystems();
    write('specs/a-spec.md', specV1);
    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'Member', kind: 'task', state: 'open', spec: 'a-spec', discharges: [99], requires: [], files: [] })}\n`);
    commit('base');
    repo.fork();

    write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'Member', kind: 'task', state: 'done', spec: 'a-spec', discharges: [99], requires: [], files: [] })}\n`);
    commit('close the member');

    const standing = standingFor(config(), 'a-spec');
    expect(standing?.clausesOwed).toBe(1);
    expect(standing?.outstandingClauses).toEqual(['c99']);
  });
});

// The residual real-git case: what stays fixed here is the merge base's
// position while main moves on after the fork — a fact about git's history
// graph, not about any commit's content, so a snapshot history cannot
// stand in for it.
describe('branchStanding\'s declared set, when main moves after the fork, against real git', () => {
  it('stays fixed at the merge base\'s copy of the store, not a later move of main', () =>
    realGitRepo(({ git: sh, write, commit }) => {
      write('systems.json', JSON.stringify({ unowned: { note: '', paths: [] }, systems: [] }));
      write('specs/a-spec.md', specV1);
      write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'Member', kind: 'task', state: 'open', spec: 'a-spec', requires: [], files: [] })}\n`);
      commit('base');
      sh('checkout', '-q', '-b', 'feature');

      write('tasks.jsonl', `${JSON.stringify({ id: 'member-1', title: 'Member', kind: 'task', state: 'done', spec: 'a-spec', requires: [], files: [] })}\n`);
      commit('this branch closes its member');

      const config: Config = { storePath: 'tasks.jsonl', eventsPath: 'events.jsonl', systemsPath: 'systems.json', specsDir: 'specs', branch: 'feature', actor: null };
      expect(branchStanding(config, 'main').specs.map((s) => s.spec)).toEqual(['a-spec']);

      sh('checkout', '-q', 'main');
      write('specs/other-spec.md', specV1.replace(/a-spec/g, 'other-spec'));
      write('tasks.jsonl', `${JSON.stringify({ id: 'member-2', title: 'Unrelated', kind: 'task', state: 'open', spec: 'other-spec', requires: [], files: [] })}\n`);
      commit('main moves on, declaring an unrelated spec');
      sh('checkout', '-q', 'feature');

      expect(branchStanding(config, 'main').specs.map((s) => s.spec)).toEqual(['a-spec']);
    }));
});

// A leg that names its next move is only useful if the move is real, and a
// verb renamed out from under one of these strings would be invisible: the
// leg still prints, the caller still runs it, and the CLI answers "unknown
// command". Checked against the verb list the CLI itself resolves against.
describe('the commands the legs name', () => {
  const verbs = new Set(allUsages().map((usage) => /^usage: tasks (?:spec )?([a-z-]+)/.exec(usage)?.[1]).filter((verb): verb is string => verb !== undefined));

  it('names only verbs the CLI actually has', async () => {
    const nexts: string[] = [];
    const specOverrideSets: Partial<SpecStanding>[] = [{ openMembers: ['x'] }, { unreviewedFindings: 1 }, { auditPasses: 0 }, { outstandingClauses: ['c1'] }, {}];
    for (const overrides of [{ dirty: ['a.ts'] }, { baseMoved: true }, ...specOverrideSets.map((specOverrides) => ({ specs: [readySpec(specOverrides)] }))]) {
      const { deps: d, recorded } = deps({ standing: () => ready(overrides) });
      await runMergeReady(d);
      nexts.push(...recorded.lines);
    }
    const named = [...new Set(nexts.flatMap((line) => [...line.matchAll(/npm run tasks -- ([a-z-]+)( [a-z-]+)?/g)].map((match) => match[1])))];
    expect(named.length).toBeGreaterThan(0);
    for (const verb of named) expect(verbs).toContain(verb);
  });
});
