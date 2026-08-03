import { describe, expect, it } from 'vitest';
import { roadmapView } from './roadmap';
import type { Task } from './taskStore';

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    kind: 'task',
    state: 'open',
    severity: null,
    system: null,
    spec: null,
    clause: null,
    requires: [],
    files: [],
    writes: [],
    produces: [],
    deliverable: null,
    evidence: null,
    source: null,
    reason: null,
    closed: null,
    closedCommit: null,
    claimed: null,
    claimedBy: null,
    extra: null,
    ...overrides,
  };
}

const ids = (tasks: Array<{ task: Task }>): string[] => tasks.map((entry) => entry.task.id);

describe('roadmapView', () => {
  it('offers only deferred, open, unblocked tasks as topics', () => {
    const view = roadmapView([
      task({ id: 'ready' }),
      task({ id: 'claimed-by-a-spec', spec: 'some-branch' }),
      task({ id: 'closed', state: 'done' }),
      task({ id: 'held', state: 'in-progress' }),
      task({ id: 'waiting', requires: ['ready'] }),
    ]);
    expect(ids(view.topics)).toEqual(['ready']);
  });

  it('never offers a finding as a topic, and counts it instead', () => {
    const view = roadmapView([task({ id: 'a-defect', kind: 'finding', system: 'Runtime' })]);
    expect(view.topics).toEqual([]);
    expect(view.counts.unblockedFindings).toBe(1);
    expect(view.findingsBySystem).toEqual([['Runtime', 1]]);
  });

  it('orders by how many live records the topic unblocks, before severity', () => {
    const view = roadmapView([
      task({ id: 'urgent-leaf', severity: 'high' }),
      task({ id: 'load-bearing', severity: 'low' }),
      task({ id: 'waiter-one', requires: ['load-bearing'] }),
      task({ id: 'waiter-two', requires: ['load-bearing'] }),
    ]);
    expect(ids(view.topics)).toEqual(['load-bearing', 'urgent-leaf']);
  });

  it('breaks a fan-out tie by severity, then by store order', () => {
    const view = roadmapView([
      task({ id: 'second-medium', severity: 'medium' }),
      task({ id: 'the-high', severity: 'high' }),
      task({ id: 'first-medium', severity: 'medium' }),
    ]);
    expect(ids(view.topics)).toEqual(['the-high', 'second-medium', 'first-medium']);
  });

  it('does not count a closed record as something the topic unblocks', () => {
    const view = roadmapView([task({ id: 'a' }), task({ id: 'shipped', state: 'done', requires: ['a'] })]);
    expect(view.topics[0].unblocks).toEqual([]);
  });

  it('names what a waiter is still short of besides this topic', () => {
    const view = roadmapView([
      task({ id: 'a' }),
      task({ id: 'b' }),
      task({ id: 'c', state: 'done' }),
      task({ id: 'waiter', requires: ['a', 'b', 'c'] }),
    ]);
    expect(view.topics[0].unblocks).toEqual([{ id: 'waiter', alsoWaitsOn: ['b'] }]);
  });

  it('counts the whole store, so the body reads as a fraction of it', () => {
    const view = roadmapView([
      task({ id: 'ready' }),
      task({ id: 'a-finding', kind: 'finding' }),
      task({ id: 'blocked', requires: ['ready'] }),
      task({ id: 'in-a-spec', spec: 'branch' }),
      task({ id: 'raw', state: 'unreviewed' }),
      task({ id: 'held', state: 'in-progress' }),
      task({ id: 'shipped', state: 'done' }),
    ]);
    expect(view.counts).toEqual({
      total: 7,
      unreviewed: 1,
      inProgress: 1,
      open: 4,
      heldBySpec: 1,
      deferred: 3,
      unblocked: 2,
      unblockedTasks: 1,
      unblockedFindings: 1,
      blocked: 1,
    });
  });

  it('reads a requirement nothing in the store answers as still blocking', () => {
    const view = roadmapView([task({ id: 'orphan', requires: ['never-filed'] })]);
    expect(view.topics).toEqual([]);
    expect(view.counts.blocked).toBe(1);
  });

  it('releases a topic whose only requirement was declined', () => {
    const view = roadmapView([task({ id: 'dropped', state: 'declined' }), task({ id: 'freed', requires: ['dropped'] })]);
    expect(ids(view.topics)).toEqual(['freed']);
  });
});
