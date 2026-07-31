import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkStore, fixNowQueue, isBlocked, loadStore, saveStore, unreviewedQueue, type Task } from './taskStore';

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    kind: 'task',
    state: 'open',
    severity: null,
    system: null,
    spec: null,
    requires: [],
    files: [],
    deliverable: null,
    evidence: null,
    source: null,
    reason: null,
    closed: null,
    ...overrides,
  };
}

function withTmpDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-taskstore-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('loadStore / saveStore', () => {
  it('round-trips through a JSONL file, one task per line', () => {
    withTmpDir((dir) => {
      const file = path.join(dir, 'tasks.jsonl');
      const tasks = [task({ id: 'a', severity: 'high' }), task({ id: 'b', severity: 'low', requires: ['a'] })];
      saveStore(tasks, file);
      expect(loadStore(file)).toEqual(tasks);
    });
  });

  it('returns an empty array when the store does not exist yet', () => {
    withTmpDir((dir) => {
      expect(loadStore(path.join(dir, 'missing.jsonl'))).toEqual([]);
    });
  });

  it('ignores blank lines', () => {
    withTmpDir((dir) => {
      const file = path.join(dir, 'tasks.jsonl');
      saveStore([task({ id: 'a' })], file);
      expect(loadStore(file)).toHaveLength(1);
    });
  });
});

describe('isBlocked', () => {
  it('is blocked while any requirement is not done', () => {
    const tasks = [task({ id: 'a', state: 'open' }), task({ id: 'b', requires: ['a'] })];
    const byId = new Map(tasks.map((t) => [t.id, t]));
    expect(isBlocked(tasks[1], byId)).toBe(true);
  });

  it('is unblocked once every requirement is done', () => {
    const tasks = [task({ id: 'a', state: 'done' }), task({ id: 'b', requires: ['a'] })];
    const byId = new Map(tasks.map((t) => [t.id, t]));
    expect(isBlocked(tasks[1], byId)).toBe(false);
  });

  it('has nothing to be blocked by when requires is empty', () => {
    const t = task({ id: 'a' });
    expect(isBlocked(t, new Map([[t.id, t]]))).toBe(false);
  });
});

describe('fixNowQueue', () => {
  it('orders by severity, high before medium before low before unset', () => {
    const tasks = [task({ id: 'low', spec: 's', severity: 'low' }), task({ id: 'high', spec: 's', severity: 'high' }), task({ id: 'medium', spec: 's', severity: 'medium' }), task({ id: 'none', spec: 's', severity: null })];
    expect(fixNowQueue(tasks, 's').map((t) => t.id)).toEqual(['high', 'medium', 'low', 'none']);
  });

  it('breaks ties by creation order (file position)', () => {
    const tasks = [task({ id: 'first', spec: 's', severity: 'high' }), task({ id: 'second', spec: 's', severity: 'high' })];
    expect(fixNowQueue(tasks, 's').map((t) => t.id)).toEqual(['first', 'second']);
  });

  it('excludes tasks outside the given spec', () => {
    const tasks = [task({ id: 'in', spec: 's', severity: 'high' }), task({ id: 'deferred', spec: null, severity: 'high' }), task({ id: 'other-spec', spec: 'other', severity: 'high' })];
    expect(fixNowQueue(tasks, 's').map((t) => t.id)).toEqual(['in']);
  });

  it('excludes blocked tasks', () => {
    const tasks = [task({ id: 'blocker', spec: 's', state: 'open' }), task({ id: 'blocked', spec: 's', requires: ['blocker'] })];
    expect(fixNowQueue(tasks, 's').map((t) => t.id)).toEqual(['blocker']);
  });

  it('excludes non-open states', () => {
    const tasks = [task({ id: 'done-task', spec: 's', state: 'done' }), task({ id: 'unreviewed-task', spec: 's', state: 'unreviewed' })];
    expect(fixNowQueue(tasks, 's')).toEqual([]);
  });

  it('filters by system and severity', () => {
    const tasks = [task({ id: 'a', spec: 's', system: 'Runtime', severity: 'high' }), task({ id: 'b', spec: 's', system: 'UI', severity: 'high' })];
    expect(fixNowQueue(tasks, 's', { system: 'UI' }).map((t) => t.id)).toEqual(['b']);
    expect(fixNowQueue(tasks, 's', { severity: 'high' })).toHaveLength(2);
  });
});

describe('unreviewedQueue', () => {
  it('orders unreviewed findings by severity, ignoring everything else', () => {
    const tasks = [task({ id: 'a', state: 'unreviewed', severity: 'low' }), task({ id: 'b', state: 'open', severity: 'high' }), task({ id: 'c', state: 'unreviewed', severity: 'high' })];
    expect(unreviewedQueue(tasks).map((t) => t.id)).toEqual(['c', 'a']);
  });
});

describe('checkStore', () => {
  const systems = ['Runtime', 'UI'];

  it('passes on an empty store', () => {
    expect(checkStore([], systems)).toEqual([]);
  });

  it('flags a duplicate id', () => {
    const issues = checkStore([task({ id: 'a' }), task({ id: 'a' })], systems);
    expect(issues).toContainEqual({ level: 'error', message: 'duplicate id: a' });
  });

  it('flags an unresolved requires reference', () => {
    const issues = checkStore([task({ id: 'a', requires: ['ghost'] })], systems);
    expect(issues).toContainEqual({ level: 'error', message: 'a requires unresolved id: ghost' });
  });

  it('detects a dependency cycle exactly once', () => {
    const issues = checkStore([task({ id: 'a', requires: ['b'] }), task({ id: 'b', requires: ['a'] })], systems);
    const cycles = issues.filter((issue) => issue.message.startsWith('dependency cycle'));
    expect(cycles).toHaveLength(1);
  });

  it('requires a reason exactly when declined', () => {
    expect(checkStore([task({ id: 'a', state: 'declined' })], systems)).toContainEqual({ level: 'error', message: 'a is declined but has no reason' });
    expect(checkStore([task({ id: 'a', state: 'open', reason: 'no longer relevant' })], systems)).toContainEqual({ level: 'error', message: 'a has a reason but is not declined' });
    expect(checkStore([task({ id: 'a', state: 'declined', reason: 'stale' })], systems)).toEqual([]);
  });

  it('refuses a declined undelivered task', () => {
    const issues = checkStore([task({ id: 'a', kind: 'undelivered', state: 'declined', reason: 'x' })], systems);
    expect(issues).toContainEqual({ level: 'error', message: 'a is undelivered and cannot be declined' });
  });

  it('flags a system not in systems.json', () => {
    const issues = checkStore([task({ id: 'a', system: 'Ghost system' })], systems);
    expect(issues).toContainEqual({ level: 'error', message: 'a has a system not in systems.json: Ghost system' });
  });

  it('flags a spec with no file', () => {
    const issues = checkStore([task({ id: 'a', spec: 'ghost-spec' })], systems, () => false);
    expect(issues).toContainEqual({ level: 'error', message: 'a references a spec with no file: ghost-spec' });
  });

  it('warns, but does not error, on a file that no longer exists', () => {
    const issues = checkStore([task({ id: 'a', files: ['no/such/file.ts:12'] })], systems);
    expect(issues).toEqual([{ level: 'warning', message: 'a lists a file that no longer exists: no/such/file.ts:12' }]);
  });
});
