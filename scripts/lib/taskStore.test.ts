import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkStore, dependencyCycles, fixNowQueue, isBlocked, listQueue, loadStore, nearMatches, parseStore, parseStoreTolerantly, requirementStates, saveStore, StoreError, unreviewedQueue, waitingOn, type Task } from './taskStore';

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
    deliverable: null,
    evidence: null,
    source: null,
    reason: null,
    closed: null,
    closedCommit: null,
    extra: null,
    ...overrides,
  };
}

describe('checkStore clause binding', () => {
  it('refuses an undelivered task that names no proof clause', () => {
    const issues = checkStore([task({ id: 'u', kind: 'undelivered', spec: null })], []);
    expect(issues).toContainEqual({ level: 'error', message: 'u is undelivered but names no proof clause' });
  });

  it('refuses a clause binding on any other kind, so the field cannot drift into meaning something else', () => {
    const issues = checkStore([task({ id: 't', clause: 3 })], []);
    expect(issues).toContainEqual({ level: 'error', message: 't names a proof clause but is not undelivered' });
  });
});

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

  it('serializes every task in the same canonical key order after loading older rows', () => {
    withTmpDir((dir) => {
      const file = path.join(dir, 'tasks.jsonl');
      writeFileSync(
        file,
        `${JSON.stringify({
          id: 'legacy',
          title: 'legacy',
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
        })}\n`,
        'utf8',
      );

      saveStore(loadStore(file), file);
      expect(readFileSync(file, 'utf8')).toBe(
        `${JSON.stringify({
          id: 'legacy',
          title: 'legacy',
          kind: 'task',
          state: 'open',
          severity: null,
          system: null,
          spec: null,
          clause: null,
          requires: [],
          files: [],
          deliverable: null,
          evidence: null,
          source: null,
          reason: null,
          closed: null,
          closedCommit: null,
        })}\n`,
      );
    });
  });

  it('reports malformed JSONL with the store path and line number', () => {
    withTmpDir((dir) => {
      const file = path.join(dir, 'tasks.jsonl');
      writeFileSync(file, `${JSON.stringify(task({ id: 'ok' }))}\n<<<<<<< HEAD\n`, 'utf8');
      expect(() => loadStore(file)).toThrow(`${file}:2: malformed JSONL task record`);
    });
  });

  it('reports malformed task shape with the store path and line number', () => {
    withTmpDir((dir) => {
      const file = path.join(dir, 'tasks.jsonl');
      writeFileSync(file, `${JSON.stringify({ id: 'broken', title: 'missing arrays' })}\n`, 'utf8');
      expect(() => loadStore(file)).toThrow(`${file}:1: task "broken" requires kind`);
    });
  });

  // A distinct error class, not just a distinctive message, is what lets a
  // single boundary at the top of every command tell "the store is
  // malformed" apart from any other bug — string-matching a message is the
  // kind of check that silently stops matching the moment the wording
  // changes.
  it('throws StoreError specifically for malformed JSONL and malformed task shape, not a plain Error', () => {
    withTmpDir((dir) => {
      const malformedJsonl = path.join(dir, 'a.jsonl');
      writeFileSync(malformedJsonl, '<<<<<<< HEAD\n', 'utf8');
      expect(() => loadStore(malformedJsonl)).toThrow(StoreError);

      const malformedShape = path.join(dir, 'b.jsonl');
      writeFileSync(malformedShape, `${JSON.stringify({ id: 'broken' })}\n`, 'utf8');
      expect(() => loadStore(malformedShape)).toThrow(StoreError);
    });
  });

  it('preserves a field this version of the store does not know about, round-tripping it unchanged', () => {
    withTmpDir((dir) => {
      const file = path.join(dir, 'tasks.jsonl');
      const { extra: _unused, ...known } = task({ id: 'forward-compat' });
      const legacy = { ...known, zebraField: 'z', futureField: 'must survive' };
      writeFileSync(file, `${JSON.stringify(legacy)}\n`, 'utf8');

      saveStore(loadStore(file), file);
      const saved = JSON.parse(readFileSync(file, 'utf8').trim());
      expect(saved.futureField).toBe('must survive');
      expect(saved.zebraField).toBe('z');
    });
  });

  it('emits unknown fields after the canonical keys, in sorted order', () => {
    withTmpDir((dir) => {
      const file = path.join(dir, 'tasks.jsonl');
      const { extra: _unused, ...known } = task({ id: 'sorted-unknowns' });
      const legacy = { ...known, zField: 1, aField: 2, mField: 3 };
      writeFileSync(file, `${JSON.stringify(legacy)}\n`, 'utf8');

      saveStore(loadStore(file), file);
      const line = readFileSync(file, 'utf8').trim();
      const canonicalKeys = ['id', 'title', 'kind', 'state', 'severity', 'system', 'spec', 'clause', 'requires', 'files', 'deliverable', 'evidence', 'source', 'reason', 'closed', 'closedCommit'];
      const keys = Object.keys(JSON.parse(line));
      expect(keys.slice(0, canonicalKeys.length)).toEqual(canonicalKeys);
      expect(keys.slice(canonicalKeys.length)).toEqual(['aField', 'mField', 'zField']);
    });
  });

  it('does not add an extra field to a line that has none, keeping ordinary round trips byte-identical', () => {
    withTmpDir((dir) => {
      const file = path.join(dir, 'tasks.jsonl');
      saveStore([task({ id: 'plain' })], file);
      const before = readFileSync(file, 'utf8');
      saveStore(loadStore(file), file);
      expect(readFileSync(file, 'utf8')).toBe(before);
    });
  });
});

describe('parseStoreTolerantly', () => {
  it('returns every line it could parse and one message per line it could not', () => {
    const text = `${JSON.stringify(task({ id: 'first' }))}\n<<<<<<< HEAD\n${JSON.stringify({ id: 'shapeless' })}\n${JSON.stringify(task({ id: 'last' }))}\n`;
    const { tasks, skipped } = parseStoreTolerantly(text, 'store');
    expect(tasks.map((t) => t.id)).toEqual(['first', 'last']);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]).toContain('store:2: malformed JSONL task record');
    expect(skipped[1]).toContain('store:3: task "shapeless" requires kind');
  });

  it('leaves parseStore strict, so a writer cannot round-trip a store minus its unparseable lines', () => {
    const text = `${JSON.stringify(task({ id: 'first' }))}\n<<<<<<< HEAD\n`;
    expect(() => parseStore(text, 'store')).toThrow(StoreError);
  });
});

describe('isBlocked', () => {
  const blockedBy = (requirement: Partial<Task>): boolean => {
    const tasks = [task({ id: 'a', ...requirement }), task({ id: 'b', requires: ['a'] })];
    return isBlocked(tasks[1], new Map(tasks.map((t) => [t.id, t])));
  };

  it('is blocked while a requirement is unreviewed, open or in-progress', () => {
    expect(blockedBy({ state: 'unreviewed' })).toBe(true);
    expect(blockedBy({ state: 'open' })).toBe(true);
    expect(blockedBy({ state: 'in-progress' })).toBe(true);
  });

  it('is unblocked once every requirement is done', () => {
    expect(blockedBy({ state: 'done' })).toBe(false);
  });

  it('is unblocked by a declined requirement, which nobody is ever going to finish', () => {
    expect(blockedBy({ state: 'declined', reason: 'not worth it' })).toBe(false);
  });

  it('is unblocked by a requirement id no record answers to, which names nothing to wait for', () => {
    const b = task({ id: 'b', requires: ['gone'] });
    expect(isBlocked(b, new Map([[b.id, b]]))).toBe(false);
  });

  it('has nothing to be blocked by when requires is empty', () => {
    const t = task({ id: 'a' });
    expect(isBlocked(t, new Map([[t.id, t]]))).toBe(false);
  });
});

describe('requirementStates', () => {
  it('names each requirement and why it does or does not hold the task up', () => {
    const tasks = [
      task({ id: 'settled', state: 'done' }),
      task({ id: 'live', state: 'open' }),
      task({ id: 'abandoned', state: 'declined', reason: 'superseded' }),
      task({ id: 'dependent', requires: ['settled', 'live', 'abandoned', 'phantom'] }),
    ];
    const byId = new Map(tasks.map((t) => [t.id, t]));
    expect(requirementStates(tasks[3], byId)).toEqual([
      { id: 'settled', status: 'done' },
      { id: 'live', status: 'waiting' },
      { id: 'abandoned', status: 'declined' },
      { id: 'phantom', status: 'missing' },
    ]);
    expect(waitingOn(tasks[3], byId)).toEqual(['live']);
  });
});

describe('dependencyCycles', () => {
  it('returns a ring of requirements as a walkable path rather than a bare flag', () => {
    const tasks = [task({ id: 'a', requires: ['b'] }), task({ id: 'b', requires: ['a'] })];
    expect(dependencyCycles(tasks)).toEqual([['a', 'b', 'a']]);
  });

  it('finds nothing in an acyclic store', () => {
    expect(dependencyCycles([task({ id: 'a' }), task({ id: 'b', requires: ['a'] })])).toEqual([]);
  });
});

describe('nearMatches', () => {
  const store = [
    task({ id: 'pass1-check-merge-shell', title: 'the merge shell is untested' }),
    task({ id: 'pass2-check-merge-shell', title: 'the merge shell is still untested' }),
    task({ id: 'runtime-save-corruption', title: 'saves are corrupted on quit' }),
  ];

  it('ranks a truncated id above one that only shares words', () => {
    expect(nearMatches('pass1-check-merge', store).map((t) => t.id)).toEqual(['pass1-check-merge-shell', 'pass2-check-merge-shell']);
  });

  it('reaches a record through its title when the id shares nothing', () => {
    expect(nearMatches('corrupted-saves', store).map((t) => t.id)).toEqual(['runtime-save-corruption']);
  });

  it('returns nothing rather than a ranked list of unrelated records', () => {
    expect(nearMatches('zzzzz', store)).toEqual([]);
  });

  it('caps the list so a 275-record store cannot answer with 275 guesses', () => {
    const many = Array.from({ length: 20 }, (_, i) => task({ id: `shared-word-${i}` }));
    expect(nearMatches('shared', many)).toHaveLength(5);
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
    const tasks = [task({ id: 'done-task', spec: 's', state: 'done' }), task({ id: 'unreviewed-task', spec: 's', state: 'unreviewed' }), task({ id: 'in-progress-task', spec: 's', state: 'in-progress' })];
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

describe('listQueue text search', () => {
  const corpus = [
    task({ id: 'combat-post-chunk7-gaps', state: 'open', title: 'Close the remaining combat gaps' }),
    task({ id: 'droptables', state: 'open', title: 'Layered droptables', deliverable: 'give: becomes sugar for a single-entry combat table' }),
    task({ id: 'smithing', state: 'open', title: 'Smithing skill', evidence: 'no COMBAT involvement at all, listed for contrast' }),
    task({ id: 'gui-rebuild', state: 'open', title: 'Rebuild the GUI', system: 'User interface' }),
  ];

  it('matches id, title, deliverable and evidence, case-insensitively', () => {
    expect(listQueue(corpus, { text: 'combat' }).map((t) => t.id)).toEqual(['combat-post-chunk7-gaps', 'droptables', 'smithing']);
  });

  it('matches the system name', () => {
    expect(listQueue(corpus, { text: 'user interface' }).map((t) => t.id)).toEqual(['gui-rebuild']);
  });

  it('ANDs with the other filters rather than replacing them', () => {
    expect(listQueue(corpus, { text: 'combat', spec: 'nothing-has-this-spec' })).toEqual([]);
  });

  it('returns nothing for a term no task carries', () => {
    expect(listQueue(corpus, { text: 'zzzznotpresent' })).toEqual([]);
  });
});

describe('listQueue', () => {
  it('defaults to not-closed (unreviewed + open + in-progress), highest severity first', () => {
    const tasks = [
      task({ id: 'declined', state: 'declined', reason: 'x', severity: 'high' }),
      task({ id: 'done', state: 'done', severity: 'high' }),
      task({ id: 'in-flight', state: 'in-progress', severity: 'medium' }),
      task({ id: 'low-open', state: 'open', severity: 'low' }),
      task({ id: 'high-unreviewed', state: 'unreviewed', severity: 'high' }),
    ];
    expect(listQueue(tasks).map((t) => t.id)).toEqual(['high-unreviewed', 'in-flight', 'low-open']);
  });

  it('breaks ties by creation order (file position)', () => {
    const tasks = [task({ id: 'first', state: 'open', severity: 'high' }), task({ id: 'second', state: 'open', severity: 'high' })];
    expect(listQueue(tasks).map((t) => t.id)).toEqual(['first', 'second']);
  });

  it('an explicit --state overrides the not-closed default', () => {
    const tasks = [task({ id: 'a', state: 'done' }), task({ id: 'b', state: 'open' })];
    expect(listQueue(tasks, { state: 'done' }).map((t) => t.id)).toEqual(['a']);
  });

  it('filters by severity, system, spec and kind', () => {
    const tasks = [
      task({ id: 'a', state: 'open', severity: 'high', system: 'Runtime', spec: 's', kind: 'task' }),
      task({ id: 'b', state: 'open', severity: 'low', system: 'UI', spec: 'other', kind: 'finding' }),
    ];
    expect(listQueue(tasks, { severity: 'high' }).map((t) => t.id)).toEqual(['a']);
    expect(listQueue(tasks, { system: 'UI' }).map((t) => t.id)).toEqual(['b']);
    expect(listQueue(tasks, { spec: 's' }).map((t) => t.id)).toEqual(['a']);
    expect(listQueue(tasks, { kind: 'finding' }).map((t) => t.id)).toEqual(['b']);
  });

  it('--deferred keeps only state:open tasks with no spec', () => {
    const tasks = [
      task({ id: 'deferred', state: 'open', spec: null }),
      task({ id: 'fix-now', state: 'open', spec: 's' }),
      task({ id: 'unreviewed', state: 'unreviewed', spec: null }),
    ];
    expect(listQueue(tasks, { deferred: true }).map((t) => t.id)).toEqual(['deferred']);
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

  it('resolves the path out of a doc backlink (path#H1) rather than checking the anchored string itself', () => {
    // docs/audits/systems.json is a real file in this repo's own checkout,
    // so a #anchor suffix on it must not warn — only a code reference's
    // `:line` suffix was being stripped before this fix.
    const clean = checkStore([task({ id: 'a', files: ['docs/audits/systems.json#H1'] })], systems);
    expect(clean).toEqual([]);

    const missing = checkStore([task({ id: 'b', files: ['docs/audits/no-such-doc.md#H1'] })], systems);
    expect(missing).toEqual([{ level: 'warning', message: 'b lists a file that no longer exists: docs/audits/no-such-doc.md#H1' }]);
  });
});
