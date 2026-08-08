import { describe, expect, it } from 'vitest';
import { liveStateOf, roadmapView, type ReadSpec } from './roadmap';
import { listQueue, type Task } from './taskStore';

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    seq: null,
    title: overrides.id,
    kind: 'task',
    state: 'open',
    severity: null,
    system: null,
    spec: null,
    departure: null,
    clause: null,
    discharges: [],
    requires: [],
    files: [],
    writes: [],
    grant: null,
    fault: null,
    decider: null,
    breaches: [],
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
  };
}

const noSpecFiles: ReadSpec = () => null;
const specFiles =
  (docs: Record<string, string>): ReadSpec =>
  (slug) =>
    docs[slug] ?? null;

const TWO_CLAUSES_ONE_MET = `# demo

## Deliverable

Proof:

- [c1] the first promise
- [c2] the second promise

## Audit passes

### Pass 1 — 2026-08-04

- base: \`aaa\`
- head: \`bbb\`
- proof 1: met
`;

const ids = (entries: Array<{ task: Task }>): string[] => entries.map((entry) => entry.task.id);
const slugs = (specs: Array<{ spec: string }>): string[] => specs.map((entry) => entry.spec);

describe('liveStateOf', () => {
  it('names the four states a live record can be in, by what each one needs next', () => {
    const gate = task({ id: 'gate' });
    const tasks = [gate, task({ id: 'specced', spec: 'branch' }), task({ id: 'unspecced' }), task({ id: 'waiting', spec: 'branch', requires: ['gate'] }), task({ id: 'claimed', spec: 'branch', state: 'in-progress' })];
    const byId = new Map(tasks.map((entry) => [entry.id, entry]));
    expect(tasks.map((entry) => liveStateOf(entry, byId))).toEqual(['unspecced', 'ready', 'unspecced', 'blocked', 'in-progress']);
  });
});

describe('roadmapView', () => {
  it('shows a task that has a spec, instead of hiding it behind a count', () => {
    const view = roadmapView([task({ id: 'decided', spec: 'a-branch' })], noSpecFiles);
    expect(slugs(view.decided)).toEqual(['a-branch']);
    expect(view.decided[0].members.map((member) => member.id)).toEqual(['decided']);
    expect(view.counts.ready).toBe(1);
  });

  it('backs its topics with the unspecced filter, not the narrower deferred one — a record with no spec belongs here whatever the reason', () => {
    const tasks = [task({ id: 'specced', spec: 'a-branch' }), task({ id: 'never-specced' }), task({ id: 'swept-out-unmet', departure: 'unmet' })];
    expect(listQueue(tasks, { unspecced: true }).map((entry) => entry.id).sort()).toEqual(['never-specced', 'swept-out-unmet']);
    expect(ids(roadmapView(tasks, noSpecFiles).topics).sort()).toEqual(['never-specced', 'swept-out-unmet']);
    // `--deferred` answers a narrower question the roadmap does not ask: only
    // a scope decision, never a clause the branch checked and failed.
    expect(listQueue(tasks, { deferred: true })).toEqual([]);
  });

  it('sorts live work into named states rather than calling undecided work ready', () => {
    const view = roadmapView(
      [task({ id: 'gate' }), task({ id: 'implement-me', spec: 'a-branch' }), task({ id: 'decide-me' }), task({ id: 'held-up', spec: 'a-branch', requires: ['gate'] })],
      noSpecFiles,
    );
    expect(view.counts.ready).toBe(1);
    expect(view.counts.unspecced).toBe(2);
    expect(view.counts.blocked).toBe(1);
    expect(ids(view.topics)).toEqual(['gate', 'decide-me']);
  });

  it('counts every record exactly once, so no record falls between the sections', () => {
    const { counts } = roadmapView(
      [
        task({ id: 'gate' }),
        task({ id: 'ready', spec: 'a-branch' }),
        task({ id: 'blocked', requires: ['gate'] }),
        task({ id: 'claimed', state: 'in-progress' }),
        task({ id: 'defect', kind: 'finding' }),
        task({ id: 'asked', kind: 'question' }),
        task({ id: 'raw', state: 'unreviewed' }),
        task({ id: 'shipped', state: 'done' }),
        task({ id: 'dropped', state: 'declined' }),
      ],
      noSpecFiles,
    );
    expect(counts.ready + counts.inProgress + counts.blocked + counts.unspecced + counts.findings + counts.otherKinds + counts.unreviewed + counts.archived).toBe(counts.total);
    expect(counts.archived).toBe(2);
  });

  it('orders a chain so each spec follows what it waits on, and depth counts the links', () => {
    const view = roadmapView(
      [task({ id: 'c', spec: 'third', requires: ['b'] }), task({ id: 'a', spec: 'first' }), task({ id: 'b', spec: 'second', requires: ['a'] })],
      noSpecFiles,
    );
    expect(view.decided.map((spec) => [spec.spec, spec.depth])).toEqual([
      ['first', 0],
      ['second', 1],
      ['third', 2],
    ]);
  });

  it('prints a spec directly under the last decided spec it was waiting for', () => {
    const view = roadmapView(
      [task({ id: 'a', spec: 'chain-a' }), task({ id: 'b', spec: 'chain-b' }), task({ id: 'a2', spec: 'chain-a-next', requires: ['a'] }), task({ id: 'b2', spec: 'chain-b-next', requires: ['b'] })],
      noSpecFiles,
    );
    expect(slugs(view.decided)).toEqual(['chain-a', 'chain-a-next', 'chain-b', 'chain-b-next']);
  });

  it('still answers when a dependency cycle leaves the order undefined', () => {
    const view = roadmapView([task({ id: 'x', spec: 'loop-a', requires: ['y'] }), task({ id: 'y', spec: 'loop-b', requires: ['x'] })], noSpecFiles);
    expect(slugs(view.decided).sort()).toEqual(['loop-a', 'loop-b']);
  });

  it('reads each clause standing out of the spec file, through the same summary spec show prints', () => {
    const view = roadmapView([task({ id: 'a', spec: 'demo' })], specFiles({ demo: TWO_CLAUSES_ONE_MET }));
    expect(view.decided[0].standing).toEqual({ clauses: 2, latestPass: 1, outstanding: 'outstanding: c2 (unknown)' });
  });

  it('states that a decided branch has no readable spec rather than dropping its row', () => {
    const view = roadmapView([task({ id: 'a', spec: 'vanished' })], noSpecFiles);
    expect(slugs(view.decided)).toEqual(['vanished']);
    expect(view.decided[0].standing).toBeNull();
  });

  it('names what a spec waits on, and which spec owns the far end of that edge', () => {
    const view = roadmapView(
      [task({ id: 'upstream', spec: 'earlier' }), task({ id: 'downstream', spec: 'later', requires: ['upstream', 'undecided', 'never-filed'] }), task({ id: 'undecided' })],
      noSpecFiles,
    );
    const later = view.decided.find((spec) => spec.spec === 'later')!;
    expect(later.waitsOn).toEqual([
      { id: 'upstream', spec: 'earlier', status: 'waiting' },
      { id: 'undecided', spec: null, status: 'waiting' },
      { id: 'never-filed', spec: null, status: 'missing' },
    ]);
  });

  it('says a spec is waiting on nothing when nothing holds any member up', () => {
    const view = roadmapView([task({ id: 'a', spec: 'free' })], noSpecFiles);
    expect(view.decided[0].waitsOn).toEqual([]);
  });

  it('draws a spec edge only where it leaves the spec, so internal ordering is not a chain link', () => {
    const view = roadmapView([task({ id: 'first-half', spec: 'one-branch' }), task({ id: 'second-half', spec: 'one-branch', requires: ['first-half'] }), task({ id: 'elsewhere', requires: ['first-half'] })], noSpecFiles);
    expect(view.decided[0].unblocks).toEqual([{ id: 'elsewhere', spec: null, alsoWaitsOn: [] }]);
    expect(view.decided[0].depth).toBe(0);
  });

  it('calls a spec ready while any member can be picked up, and blocked only when none can', () => {
    const view = roadmapView(
      [task({ id: 'gate' }), task({ id: 'part-one', spec: 'mixed', requires: ['gate'] }), task({ id: 'part-two', spec: 'mixed' }), task({ id: 'stalled', spec: 'stuck', requires: ['gate'] }), task({ id: 'claimed', spec: 'busy', state: 'in-progress' })],
      noSpecFiles,
    );
    expect(view.decided.map((spec) => [spec.spec, spec.state])).toEqual([
      ['mixed', 'ready'],
      ['busy', 'in-progress'],
      ['stuck', 'blocked'],
    ]);
  });

  it('keeps a done member out of the spec section once nothing of it is live', () => {
    const view = roadmapView([task({ id: 'shipped', spec: 'closed-branch', state: 'done' })], noSpecFiles);
    expect(view.decided).toEqual([]);
  });

  it('names the findings that could redden an audit and aggregates only the rest', () => {
    const view = roadmapView(
      [
        task({ id: 'urgent', kind: 'finding', severity: 'high', system: 'Runtime' }),
        task({ id: 'minor', kind: 'finding', severity: 'low', system: 'Runtime' }),
        task({ id: 'middling', kind: 'finding', severity: 'medium', system: 'Task system' }),
      ],
      noSpecFiles,
    );
    expect(ids(view.namedFindings)).toEqual(['urgent']);
    expect(view.findingsBySystem).toEqual([
      ['Runtime', 1],
      ['Task system', 1],
    ]);
    expect(view.counts.findings).toBe(3);
    expect(view.counts.highFindings).toBe(1);
  });

  it('names a finding a spec has already taken on, because severity is what reddens an audit', () => {
    const view = roadmapView([task({ id: 'owned', kind: 'finding', severity: 'high', spec: 'a-branch' })], noSpecFiles);
    expect(ids(view.namedFindings)).toEqual(['owned']);
  });

  it('lists the blocked unspecced tasks with what each is waiting on', () => {
    const view = roadmapView([task({ id: 'gate' }), task({ id: 'waiting', requires: ['gate', 'never-filed'] })], noSpecFiles);
    expect(ids(view.blocked)).toEqual(['waiting']);
    expect(view.blocked[0].waitsOn.map((blocker) => blocker.status)).toEqual(['waiting', 'missing']);
  });

  it('orders topics by how many live records each unblocks, before severity', () => {
    const view = roadmapView(
      [task({ id: 'urgent-leaf', severity: 'high' }), task({ id: 'load-bearing', severity: 'low' }), task({ id: 'waiter-one', requires: ['load-bearing'] }), task({ id: 'waiter-two', requires: ['load-bearing'] })],
      noSpecFiles,
    );
    expect(ids(view.topics)).toEqual(['load-bearing', 'urgent-leaf']);
  });

  it('breaks a fan-out tie by severity, then by seq, oldest first, regardless of array order', () => {
    const view = roadmapView(
      [task({ id: 'second-medium', severity: 'medium', seq: 2 }), task({ id: 'the-high', severity: 'high', seq: 3 }), task({ id: 'first-medium', severity: 'medium', seq: 1 })],
      noSpecFiles,
    );
    expect(ids(view.topics)).toEqual(['the-high', 'first-medium', 'second-medium']);
  });

  it('does not count a closed record as something a topic unblocks', () => {
    const view = roadmapView([task({ id: 'a' }), task({ id: 'shipped', state: 'done', requires: ['a'] })], noSpecFiles);
    expect(view.topics[0].unblocks).toEqual([]);
  });

  it('names what a waiter is still short of besides this topic', () => {
    const view = roadmapView([task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c', state: 'done' }), task({ id: 'waiter', requires: ['a', 'b', 'c'] })], noSpecFiles);
    expect(view.topics[0].unblocks).toEqual([{ id: 'waiter', spec: null, alsoWaitsOn: ['b'] }]);
  });

  it('reads a requirement nothing in the store answers as still blocking', () => {
    const view = roadmapView([task({ id: 'orphan', requires: ['never-filed'] })], noSpecFiles);
    expect(view.topics).toEqual([]);
    expect(view.counts.blocked).toBe(1);
  });

  it('releases a topic whose only requirement was declined', () => {
    const view = roadmapView([task({ id: 'dropped', state: 'declined' }), task({ id: 'freed', requires: ['dropped'] })], noSpecFiles);
    expect(ids(view.topics)).toEqual(['freed']);
  });

  it('never offers a finding as a topic', () => {
    const view = roadmapView([task({ id: 'a-defect', kind: 'finding', system: 'Runtime' })], noSpecFiles);
    expect(view.topics).toEqual([]);
    expect(view.blocked).toEqual([]);
  });
});
